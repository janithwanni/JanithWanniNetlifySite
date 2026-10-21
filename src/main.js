import htmx from 'htmx.org';
import './style.css';
import { growGarden } from './garden.js';

const main = document.getElementById('main');

// The night sky (its code and star catalogue) is only fetched when a page has one.
const drawSky = (root) => root?.querySelector('.sky') && import('./sky/sky.js').then((sky) => sky.drawSky(root));

// The watercolour flowers (src/flowers.js) are fetched only once they are nearly in view.
const watched = new WeakSet();
function paintFlowers(root) {
  const box = root?.querySelector('.flowers:not([data-painted])');
  if (!box || watched.has(box)) return;
  watched.add(box);
  new IntersectionObserver((entries, io) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    import('./flowers.js').then((m) => m.paintFlowers(box));
  }, { rootMargin: '400px 0px' }).observe(box);
}
const fragmentFor =(pathname) => `/c${pathname.replace(/\/$/, '') || '/'}`;

function markCurrentSection() {
  const section = location.pathname.split('/')[1];
  // Each section has its own accent colour (the --ch-* tokens in style.css).
  document.documentElement.dataset.section = section || 'home';
  for (const a of document.querySelectorAll('.site-head nav a')) {
    if (a.dataset.section === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

// Thoughts and musings come as JSON ([{ message, time }]) from the getmessages function,
// so they are rendered here rather than swapped in by htmx: a short list on the homepage
// ([data-thoughts]) and postcards on /thoughts/ ([data-postcards]).
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

async function fetchThoughts(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`getmessages ${res.status}`);
  return (await res.json())
    .filter((t) => t && t.message)
    // Accept Unix timestamps in seconds or milliseconds.
    .map(({ message, time }) => ({ message, date: new Date(time < 1e12 ? time * 1000 : time) }))
    .sort((a, b) => b.date - a.date);
}

const timeEl = (date, text = dateFmt.format(date)) => el('time', { dateTime: date.toISOString() }, text);

function thoughtsList(thoughts) {
  const more = el('a', { href: '/thoughts/' }, 'Read them all as postcards →');
  more.setAttribute('hx-get', '/c/thoughts');
  more.setAttribute('hx-push-url', '/thoughts/');
  return [
    el('h3', { className: 'small-head' }, 'Thoughts & musings'),
    el('ul', { className: 'lately thoughts' },
      ...thoughts.map(({ message, date }) => el('li', {}, timeEl(date), el('p', {}, message)))),
    el('p', { className: 'more' }, more),
  ];
}

function postcards(thoughts) {
  return thoughts.map(({ message, date }, i) => {
    const [day, month, year] = dateFmt.format(date).toUpperCase().split(' ');
    return el('li', { className: 'postcard' },
      el('div', { className: 'postcard-note' },
        el('p', {}, message),
        el('p', { className: 'postcard-sign' }, `${weekdayFmt.format(date)}, `, timeEl(date))),
      el('div', { className: 'postcard-side', ariaHidden: 'true' },
        el('span', { className: 'stamp' }, el('span', {}, 'ฅ')),
        el('span', { className: 'postmark' }, el('span', {}, `${day} ${month}`, el('br'), year)),
        el('span', { className: 'address' }, 'To the wanderer', el('br'), 'wherever you are'),
        el('span', { className: 'postcard-no' }, `No. ${thoughts.length - i}`)));
  });
}

async function loadThoughts() {
  for (const [selector, key, render] of [
    ['[data-thoughts]', 'thoughts', thoughtsList],
    ['[data-postcards]', 'postcards', postcards],
  ]) {
    const box = main.querySelector(selector);
    // data-loaded survives htmx's history snapshot, so going back doesn't refetch.
    if (!box || box.hasAttribute('data-loaded')) continue;
    box.setAttribute('data-loaded', '');
    try {
      const thoughts = await fetchThoughts(box.dataset[key]);
      if (thoughts.length) box.replaceChildren(...render(thoughts));
      else if (key === 'postcards') box.replaceChildren(el('li', { className: 'postcards-status' }, 'No post today.'));
      htmx.process(box);
    } catch (err) {
      console.error('thoughts:', err);
      box.removeAttribute('data-loaded');
      // The homepage list just stays empty; the postcards page says so.
      if (key === 'postcards') {
        box.replaceChildren(el('li', { className: 'postcards-status' }, 'The post seems to be delayed. Please try again a little later.'));
      }
    }
  }
}

// Each recently played track takes a colour from its album cover: the most saturated
// mid-tone pixel of the thumbnail. Covers come through /c/cover, same-origin, so the
// canvas can read them.
function tintCovers(root) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (const img of root.querySelectorAll('.listening img')) {
    const tint = () => {
      try {
        ctx.drawImage(img, 0, 0, 8, 8);
        const px = ctx.getImageData(0, 0, 8, 8).data;
        let best = null, bestScore = -1;
        for (let i = 0; i < px.length; i += 4) {
          const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
          const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 510;
          const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
          const score = sat * (1 - Math.abs(l - 0.5) * 1.6);
          if (score > bestScore) { bestScore = score; best = `rgb(${r} ${g} ${b})`; }
        }
        if (best) img.closest('li').style.setProperty('--cover', best);
      } catch (err) {
        console.error('cover colour:', err);
      }
    };
    if (img.complete && img.naturalWidth) tint();
    else img.addEventListener('load', tint, { once: true });
  }
}

document.body.addEventListener('htmx:afterSwap', (e) => {
  if (e.detail.target?.matches?.('.listening-row')) tintCovers(e.detail.target);
});

document.body.addEventListener('htmx:afterSettle', (e) => {
  if (e.detail.target !== main) return;
  markCurrentSection();
  loadThoughts();
  drawSky(main);
  growGarden(main);
  paintFlowers(main);
  main.focus({ preventScroll: true });
});
// htmx restores the whole <body>, so the sky looks up the new #main to re-centre its view.
document.body.addEventListener('htmx:historyRestore', () => { markCurrentSection(); loadThoughts(); drawSky(document.getElementById('main')); growGarden(main); paintFlowers(document.getElementById('main')); });

// In-page links to a collapsed <details> (the talks list) open it before jumping there.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  const target = a && document.getElementById(decodeURIComponent(a.hash.slice(1)));
  if (target?.matches('details')) target.open = true;
});

// A missing fragment falls back to a normal page load (and Netlify's 404).
document.body.addEventListener('htmx:responseError', (e) => {
  const href = e.detail.elt.getAttribute('href');
  if (href) location.assign(href);
});

// Production pages are prerendered; the dev server only serves the empty shell.
if (!main.firstElementChild) htmx.ajax('GET', fragmentFor(location.pathname), { target: main, swap: 'innerHTML' });
else { loadThoughts(); drawSky(main); growGarden(main); paintFlowers(main); }
markCurrentSection();
