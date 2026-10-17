import htmx from 'htmx.org';
import './style.css';

const main = document.getElementById('main');
const fragmentFor = (pathname) => `/c${pathname.replace(/\/$/, '') || '/'}`;

function markCurrentSection() {
  const section = location.pathname.split('/')[1];
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
        el('span', { className: 'stamp' }, el('span', {}, '❦')),
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

document.body.addEventListener('htmx:afterSettle', (e) => {
  if (e.detail.target !== main) return;
  markCurrentSection();
  loadThoughts();
  main.focus({ preventScroll: true });
});
document.body.addEventListener('htmx:historyRestore', () => { markCurrentSection(); loadThoughts(); });

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
else loadThoughts();
markCurrentSection();
