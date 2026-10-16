// Turns Quarto's rendered pages (content/_out) into htmx fragments.
//
//   content/_out/talks.html                 -> public/c/talks.html        (route /talks/)
//   content/_out/blog/<slug>/<file>.html    -> public/c/blog/<slug>.html  (route /blog/<slug>/)
//
// Also writes the blog/creative listing fragments, copies figures, writes
// content/routes.json (used by prerender.mjs) and public/_redirects for old URLs.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'content');
const OUT = path.join(SRC, '_out');
const PUBLIC = path.join(ROOT, 'public');
const DEST = path.join(PUBLIC, 'c');
const SITE = 'Janith Wanniarachchi';

const SECTIONS = {
  blog: { title: 'Blog', heading: 'Blog Articles' },
  creative: { title: 'Creative Corner', heading: 'Creative Writing' },
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });

const meta = (html, name) => html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1] ?? '';
const fragmentUrl = (route) => `/c${route.replace(/\/$/, '') || '/index'}.html`;
const link = (route, text, cls = '') =>
  `<a${cls ? ` class="${cls}"` : ''} href="${route}" hx-get="${fragmentUrl(route)}" hx-push-url="${route}">${text}</a>`;
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function routeFor(rel) {
  const parts = rel.replace(/\.html$/, '').split('/');
  if (parts.length === 1) return parts[0] === 'index' ? '/' : `/${parts[0]}/`;
  return `/${parts[0]}/${parts[1]}/`;
}

// Collect pages ---------------------------------------------------------------
const pages = walk(OUT)
  .filter((f) => f.endsWith('.html'))
  .map((file) => {
    const rel = path.relative(OUT, file).split(path.sep).join('/');
    const html = fs.readFileSync(file, 'utf8');
    const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
    const section = rel.includes('/') ? rel.split('/')[0] : null;
    const date = meta(html, 'dcterms.date') || rel.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
    return {
      rel,
      body,
      section,
      route: routeFor(rel),
      draft: body.includes('quarto-draft-alert'),
      // Without a title Quarto falls back to the file name; only trust the title block.
      title: body.match(/<h1 class="title">([^<]*)<\/h1>/)?.[1].trim() ?? '',
      description: meta(html, 'description').trim().replace(/^(&quot;|“)|(&quot;|”)$/g, ''),
      date,
    };
  })
  .filter((p) => !p.draft);

const routeByRel = new Map(pages.map((p) => [p.rel, p.route]));

// Rewrite relative src/href so fragments work from any URL ----------------------
function rewriteUrls(page) {
  const dir = path.posix.dirname(page.rel);
  return page.body.replace(/\b(src|href)="([^"]+)"/g, (m, name, url) => {
    if (/^([a-z]+:|#|\/)/i.test(url)) return m;
    const [p, hash = ''] = url.split('#');
    const target = path.posix.normalize(path.posix.join(dir, p));
    const suffix = hash ? `#${hash}` : '';
    const route = routeByRel.get(target.replace(/\.qmd$/, '.html'));
    if (route) return `${name}="${route}${suffix}" hx-get="${fragmentUrl(route)}" hx-push-url="${route}"`;
    if (fs.existsSync(path.join(PUBLIC, target))) return `${name}="/${target}${suffix}"`;
    const from = [path.join(OUT, target), path.join(SRC, target)].find((f) => fs.existsSync(f));
    if (!from) {
      console.warn(`  missing asset in ${page.rel}: ${url}`);
      return m;
    }
    const to = path.join(DEST, target);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    return `${name}="/c/${target}${suffix}"`;
  });
}

const readingTime = (html) =>
  Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 200));

function header(page) {
  if (!page.section) return page.title ? `<header class="page-head"><h1>${page.title}</h1></header>` : '';
  const back = link(`/${page.section}/`, `← ${SECTIONS[page.section].title}`, 'back');
  const date = page.date ? `<time datetime="${page.date}">${fmtDate(page.date)}</time> · ` : '';
  return `<header class="page-head">${back}<h1>${page.title}</h1>` +
    `<p class="meta">${date}${page.minutes} min read</p></header>`;
}

// Write fragments --------------------------------------------------------------
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
const routes = [];

const writeFragment = (route, title, description, inner) => {
  const file = path.join(PUBLIC, fragmentUrl(route));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fullTitle = title ? `${title} · ${SITE}` : SITE;
  fs.writeFileSync(file, `<title>${fullTitle}</title>\n${inner.trim()}\n`);
  routes.push({ route, fragment: fragmentUrl(route), title: fullTitle, description });
};

for (const page of pages) {
  let body = rewriteUrls(page)
    .replace(/<header id="title-block-header">[\s\S]*?<\/header>/, '')
    .replace(/<img (?![^>]*loading=)/g, '<img loading="lazy" decoding="async" ');
  page.minutes = readingTime(body);
  writeFragment(page.route, page.title, page.description,
    `<article class="${page.section ? 'post' : 'page'}">${header(page)}${body.trim()}</article>`);
}

for (const [section, { title, heading }] of Object.entries(SECTIONS)) {
  const items = pages
    .filter((p) => p.section === section)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => `<li>
  ${link(p.route, p.title)}
  ${p.description ? `<p>${p.description}</p>` : ''}
  <p class="meta">${p.date ? `<time datetime="${p.date}">${fmtDate(p.date)}</time> · ` : ''}${p.minutes} min read</p>
</li>`);
  writeFragment(`/${section}/`, title, `${heading} by ${SITE}`,
    `<article class="page"><header class="page-head"><h1>${heading}</h1></header>
<ul class="listing">
${items.join('\n')}
</ul></article>`);
}

routes.sort((a, b) => a.route.localeCompare(b.route));
fs.writeFileSync(path.join(SRC, 'routes.json'), JSON.stringify(routes, null, 2) + '\n');

// Redirect the old Quarto website URLs to the new routes -----------------------
const redirects = [
  '/blog.html /blog/ 301',
  '/creatives.html /creative/ 301',
  '/about.html / 301',
  ...pages.filter((p) => p.route !== '/').map((p) => `/${p.rel} ${p.route} 301`),
];
fs.writeFileSync(path.join(PUBLIC, '_redirects'), redirects.join('\n') + '\n');

console.log(`Wrote ${routes.length} fragments to public/c`);
