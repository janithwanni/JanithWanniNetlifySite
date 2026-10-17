// Turns Quarto's rendered pages (content/_out) into htmx fragments.
//
//   content/_out/talks.html                 -> public/c/talks.html        (route /talks/)
//   content/_out/blog/<slug>/<file>.html    -> public/c/blog/<slug>.html  (route /blog/<slug>/)
//
// Fragments are requested without the extension (/c/talks, /c/ for the homepage):
// Cloudflare Pages 308-redirects any *.html URL to that form, costing a round trip.
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
const HOME_TITLE = `${SITE} · Statistician, explainable AI &amp; data visualisation`;

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
const fragmentFile = (route) => `/c${route.replace(/\/$/, '') || '/index'}.html`;
const fragmentUrl = (route) => `/c${route.replace(/\/$/, '') || '/'}`;
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
  const file = path.join(PUBLIC, fragmentFile(route));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fullTitle = title ? `${title} · ${SITE}` : HOME_TITLE;
  fs.writeFileSync(file, `<title>${fullTitle}</title>\n${inner.trim()}\n`);
  routes.push({ route, fragment: fragmentFile(route), title: fullTitle, description });
};

for (const page of pages) {
  let body = rewriteUrls(page)
    .replace(/<header id="title-block-header">[\s\S]*?<\/header>/, '')
    .replace(/<img (?![^>]*loading=)/g, '<img loading="lazy" decoding="async" ');
  page.minutes = readingTime(body);
  page.html = body;
  if (page.route === '/') continue; // written below, once the listings are known
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

// Homepage: a table of contents and the latest poem fill content/index.qmd's placeholders.
const home = pages.find((p) => p.route === '/');
const byPage = (route) => pages.find((p) => p.route === route);
const bySection = (s) => pages.filter((p) => p.section === s).sort((a, b) => b.date.localeCompare(a.date));
const count = (html, tag) => (html.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;
const fmtMonth = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const chapter = (num, title, note, right) =>
  `<span class="num">${num}</span><span class="chapter">${title}<em>${note}</em></span>` +
  `<span class="leader"></span><span class="count">${right}</span>`;
const contents = `<nav class="contents" aria-labelledby="contents-head">
<h2 id="contents-head" class="rule-head">Contents</h2>
<ol>
<li>${link('/creative/', chapter('I', 'Creative Corner', 'Poems, letters &amp; short stories', `${bySection('creative').length} pieces`))}</li>
<li>${link('/blog/', chapter('II', 'Blog', 'Explainable AI, statistics &amp; R', `${bySection('blog').length} essays`))}</li>
<li>${link('/research/', chapter('III', 'Research', 'Explainable AI &amp; visualisation', `${count(byPage('/research/').html, 'h3')} works`))}</li>
<li>${link('/software/', chapter('IV', 'Software', 'R packages &amp; tools', `${count(byPage('/software/').html, 'h3')} packages`))}</li>
<li>${link('/talks/', chapter('V', 'Talks', 'Conferences, meetups &amp; workshops', `${count(byPage('/talks/').html, 'h2')} talks`))}</li>
<li>${link('/cv/', chapter('VI', 'Curriculum Vitae', 'The longer story', 'HTML · PDF'))}</li>
</ol>
</nav>`;

const [latest, ...older] = bySection('creative');
const excerpt = latest.html.match(/<p>((?:(?!<\/p>)[\s\S]){40,}?)<\/p>/)?.[1] ?? '';
const lately = [...older, ...bySection('blog')]
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 4)
  .map((p) => `<li><time datetime="${p.date}">${fmtMonth(p.date)}</time>${link(p.route, p.title)}` +
    `<span class="kind">${p.section === 'blog' ? 'essay' : 'verse'}</span></li>`);
const notebook = `<section class="notebook" aria-labelledby="notebook-head">
<h2 id="notebook-head" class="rule-head">From the notebook</h2>
<figure class="excerpt">
<blockquote><p>${excerpt}</p></blockquote>
<figcaption>${link(latest.route, `<cite>${latest.title}</cite>`)} · <time datetime="${latest.date}">${fmtDate(latest.date)}</time></figcaption>
</figure>
<p class="more">${link(latest.route, 'Continue reading →')}</p>
<h3 class="small-head">Lately</h3>
<ul class="lately">
${lately.join('\n')}
</ul>
</section>`;

writeFragment('/', '', 'PhD candidate at Monash University researching explainable AI, data visualisation and interpretable models. R packages, talks, writing and poems.',
  `<article class="home">${home.html.replace(/<!--[\s\S]*?-->\s*/g, "")
    .replace(/<div id="contents">\s*<\/div>/, contents)
    .replace(/<div id="notebook">\s*<\/div>/, notebook)
    .trim()}</article>`);

// The CV also renders to PDF (Typst) from content/cv.qmd.
if (fs.existsSync(path.join(OUT, 'cv.pdf'))) fs.copyFileSync(path.join(OUT, 'cv.pdf'), path.join(PUBLIC, 'cv.pdf'));
else console.warn('  missing content/_out/cv.pdf; public/cv.pdf not updated');

routes.sort((a, b) => a.route.localeCompare(b.route));
fs.writeFileSync(path.join(SRC, 'routes.json'), JSON.stringify(routes, null, 2) + '\n');

// Redirect the old Quarto website URLs to the new routes -----------------------
const redirects = [
  '/blog.html /blog/ 301',
  '/creatives.html /creative/ 301',
  '/about.html / 301',
  '/publications/ /research/ 301',
  '/publications.html /research/ 301',
  '/Portfolio.pdf /cv.pdf 301',
  '/Janith_Wanniarachchi_Portfolio.pdf /cv.pdf 301',
  ...pages.filter((p) => p.route !== '/').map((p) => `/${p.rel} ${p.route} 301`),
];
fs.writeFileSync(path.join(PUBLIC, '_redirects'), redirects.join('\n') + '\n');

console.log(`Wrote ${routes.length} fragments to public/c`);
