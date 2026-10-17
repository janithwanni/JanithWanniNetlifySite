// After `vite build`: writes dist/<route>/index.html for every fragment so the
// first load needs no extra request (and works without JS). htmx takes over
// navigation from there.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const shell = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'routes.json'), 'utf8'));

// Production origin, for absolute og:url links in social previews.
const SITE_URL = 'https://janithwanni.netlify.app';

const attr = (s) => s.replace(/&(?!(amp|quot|lt|gt|#\d+);)/g, '&amp;').replace(/"/g, '&quot;');

function render({ title, description, section, body, route = '/' }) {
  let html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${attr(title)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${SITE_URL}${route}`)
    .replace(/<main id="main"([^>]*)><\/main>/, `<main id="main"$1>${body}</main>`);
  if (description) {
    html = html
      .replace(/(<meta name="description" content=")[^"]*/, `$1${attr(description)}`)
      .replace(/(<meta property="og:description" content=")[^"]*/, `$1${attr(description)}`);
  }
  if (section) html = html.replace(`data-section="${section}"`, `data-section="${section}" aria-current="page"`);
  return html;
}

for (const { route, fragment, title, description } of routes) {
  const body = fs.readFileSync(path.join(DIST, fragment), 'utf8').replace(/^<title>.*<\/title>\n/, '');
  const out = path.join(DIST, route, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render({ title, description, section: route.split('/')[1], body, route }));
}

fs.writeFileSync(path.join(DIST, '404.html'), render({
  title: 'Not found · Janith Wanniarachchi',
  body: '<article class="page"><header class="page-head"><h1>Lost, wanderer?</h1></header>' +
    '<p>This page does not exist. <a href="/">Head back home</a>.</p></article>',
}));

console.log(`Prerendered ${routes.length} pages`);
