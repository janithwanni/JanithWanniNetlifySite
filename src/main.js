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

// The homepage's thoughts and musings come as JSON ([{ message, time }]), so they are
// rendered here rather than swapped in by htmx. Any failure leaves the section empty.
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

async function loadThoughts() {
  const box = main.querySelector('[data-thoughts]');
  if (!box || box.firstElementChild) return;
  try {
    const res = await fetch(box.dataset.thoughts, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const thoughts = (await res.json())
      .filter((t) => t && t.message)
      .sort((a, b) => b.time - a.time);
    if (!thoughts.length) return;

    const head = Object.assign(document.createElement('h3'), { className: 'small-head', textContent: 'Thoughts & musings' });
    const list = Object.assign(document.createElement('ul'), { className: 'lately thoughts' });
    for (const { message, time } of thoughts) {
      // Accept Unix timestamps in seconds or milliseconds.
      const date = new Date(time < 1e12 ? time * 1000 : time);
      const li = document.createElement('li');
      const when = Object.assign(document.createElement('time'), {
        dateTime: date.toISOString(),
        textContent: dateFmt.format(date),
      });
      const what = Object.assign(document.createElement('p'), { textContent: message });
      li.append(when, what);
      list.append(li);
    }
    box.replaceChildren(head, list);
  } catch (err) {
    console.error('thoughts:', err);
  }
}

document.body.addEventListener('htmx:afterSettle', (e) => {
  if (e.detail.target !== main) return;
  markCurrentSection();
  loadThoughts();
  main.focus({ preventScroll: true });
});
document.body.addEventListener('htmx:historyRestore', () => { markCurrentSection(); loadThoughts(); });

// A missing fragment falls back to a normal page load (and Netlify's 404).
document.body.addEventListener('htmx:responseError', (e) => {
  const href = e.detail.elt.getAttribute('href');
  if (href) location.assign(href);
});

// Production pages are prerendered; the dev server only serves the empty shell.
if (!main.firstElementChild) htmx.ajax('GET', fragmentFor(location.pathname), { target: main, swap: 'innerHTML' });
else loadThoughts();
markCurrentSection();
