-- Typst (PDF) only: lay out each .cv-item as two columns, date | details,
-- matching the .cv-item grid in src/style.css. HTML output is left alone.
function Div(el)
  if not quarto.doc.is_format('typst') or not el.classes:includes('cv-item') then return nil end
  local blocks = pandoc.Blocks{
    pandoc.RawBlock('typst', '#block(breakable: false, below: 0.9em, grid(columns: (6.5em, 1fr), column-gutter: 1em, text(fill: luma(90))['),
    el.content[1],
    pandoc.RawBlock('typst', '], ['),
  }
  for i = 2, #el.content do blocks:insert(el.content[i]) end
  blocks:insert(pandoc.RawBlock('typst', ']))'))
  return blocks
end
