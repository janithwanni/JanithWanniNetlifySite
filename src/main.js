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

document.body.addEventListener('htmx:afterSettle', (e) => {
  if (e.detail.target !== main) return;
  markCurrentSection();
  main.focus({ preventScroll: true });
});
document.body.addEventListener('htmx:historyRestore', markCurrentSection);

// A missing fragment falls back to a normal page load (and Netlify's 404).
document.body.addEventListener('htmx:responseError', (e) => {
  const href = e.detail.elt.getAttribute('href');
  if (href) location.assign(href);
});

// Production pages are prerendered; the dev server only serves the empty shell.
if (!main.firstElementChild) htmx.ajax('GET', fragmentFor(location.pathname), { target: main, swap: 'innerHTML' });
markCurrentSection();
