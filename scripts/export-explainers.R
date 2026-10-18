# Exports the saved results of the visual-explanations paper (chapter 2 of the thesis) to
# public/data/explainers.json for the scrollytelling post. Run from this repo:
#   Rscript scripts/export-explainers.R ~/Documents/Working_papers/visual-representation-of-xai public/data/explainers.json
suppressMessages({ library(dplyr); library(tidyr); library(purrr); library(jsonlite) })
args <- commandArgs(TRUE); out <- file.path(normalizePath(dirname(args[2])), basename(args[2])); setwd(args[1])

pois_id <- sort(c(27678, 20211, 33218, 28105))
hr <- readRDS("data/high_res_data_space.rds")
# 0.01 grid from the 0.001 one: keep every 10th x and y.
k <- round((hr$x + 1) * 1000); l <- round((hr$y + 1) * 1000)
sub <- hr[k %% 10 == 0 & l %% 10 == 0, ] |> arrange(y, x)
stopifnot(nrow(sub) == 201^2)
# One string per row (y), "A"/"B" per x cell.
surface <- sub |> group_by(y) |> summarise(r = paste(as.character(preds), collapse = "")) |> pull(r)

ks <- readRDS("data/twod_kquats.rds")
train <- ks[[1]]$train_data
poi <- map_dfr(ks, \(k) k$point_of_interest |> select(index, x, y, preds) |> mutate(preds = as.character(preds)))
stopifnot(all(poi$index %in% pois_id))
poi <- poi |> mutate(label = match(index, pois_id)) |> arrange(label)

lime <- map(ks, \(k) {
  p <- k$perturbations
  list(index = k$point_of_interest$index,
       coef = unname(as.numeric(k$local_model$coef_mat)),  # intercept, x, y
       imp = as.list(k$local_model$importances),
       pts = round(as.matrix(select(p, x, y)), 4),
       bb = as.character(p[[setdiff(names(p), c("x", "y"))[1]]]),
       glm = k$local_model$glm_predictions)
})
shap <- readRDS("data/twod_shaps.rds")
cf <- readRDS("data/twod_cfacts.rds")
anc <- readRDS("data/twod_anchors.rds")
box <- \(d, id) { d <- filter(d, .data$id == !!id); list(x = d$x, y = d$y) }  # lower, upper

points <- map(seq_len(nrow(poi)), \(i) {
  p <- poi[i, ]
  L <- keep(lime, \(l) l$index == p$index)[[1]]
  s <- filter(shap, case == p$index)
  list(label = p$label, x = p$x, y = p$y, pred = p$preds,
       shap = list(x = s$x, y = s$y),
       lime = L[c("coef", "imp", "pts", "bb", "glm")],
       cf = list(x = cf$x[i], y = cf$y[i], pred = as.character(cf$preds[i])),
       anchor = c(box(anc$final_anchor, p$index), as.list(filter(anc$final_anchor, id == p$index)[1, c("prec", "cover")])),
       bounds = box(anc$perturb_bounds, p$index))
})

set.seed(1)
show <- train |> slice_sample(n = 1500)
write_json(list(
  rule = "A if x < -0.5 and y < -0.3; A if -0.5 <= x < 0.4 and y < 0.1 + 0.8x; A if x >= 0.4; then B if y < -1 + 0.8x; otherwise B",
  surface = surface,
  data = list(x = round(show$x, 3), y = round(show$y, 3), cls = as.character(show$class)),
  points = points
), out, auto_unbox = TRUE, digits = 5)
cat("wrote", out, file.size(out), "bytes\n")
