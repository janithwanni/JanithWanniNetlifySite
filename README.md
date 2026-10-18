# janithwanni.com

A static Vite site: one HTML shell, one small stylesheet, and htmx. Pages are written in
Quarto (`content/`), rendered to bare HTML, and served as fragments that htmx swaps into `<main>`.

```
content/            Quarto sources (.qmd), _freeze for executed R posts
scripts/
  build-content.mjs content/_out -> public/c/*.html fragments, listings, _redirects
  prerender.mjs     dist/<route>/index.html for every fragment (fast first load, no-JS fallback)
public/             static files (CV, images) + generated fragments in public/c
index.html, src/    the shell, htmx wiring, CSS
```

## Writing

Add a folder under `content/blog/` or `content/creative/` with a `.qmd` (title, description,
date in the front matter; `draft: true` hides it), then:

```sh
npm run content   # quarto render content + build fragments (needs Quarto)
npm run dev       # preview at localhost:5173
```

Commit the regenerated `public/c` and `content/routes.json`. Netlify only runs
`npm run build`, so it doesn't need Quarto or R.

R posts are frozen. Re-run their code with `quarto render content --cache-refresh` after
restoring the renv library (`content/renv.lock`). A full project render uses the freeze;
rendering a single file always re-executes it.
