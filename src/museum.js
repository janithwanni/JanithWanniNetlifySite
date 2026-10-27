// The museum (/museum/, filled by functions/c/exhibition.js). Each frame is a link to the
// full-size photograph; here it opens a closer look instead: a <dialog> with the photo, its
// placard and its palette, walked with the arrow keys, a swipe or the buttons. The house
// lights dim the walls so only the spotlit frames show. Listeners are delegated, so the
// exhibition can be swapped in (and restored from history) at any time.

const frames = () => [...document.querySelectorAll('.museum .frame')];
let current = 0;

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// htmx restores <body> from its history snapshot, so always look the dialog up afresh.
function viewing() {
  const found = document.getElementById('viewing');
  if (found) return found;
  const dialog = el('dialog', { id: 'viewing', className: 'viewing' });
  dialog.setAttribute('aria-labelledby', 'viewing-title');
  dialog.innerHTML = `<div class="viewing-inner">
<form method="dialog"><button class="viewing-close" aria-label="Back to the wall">×</button></form>
<figure class="viewing-figure"><img alt="" decoding="async">
<figcaption><span class="placard-no"></span><h2 id="viewing-title"><cite></cite></h2><span class="placard-meta"></span>
<span class="viewing-palette" aria-hidden="true"></span><span class="hexes"></span></figcaption></figure>
<nav class="viewing-nav" aria-label="Exhibition">
<button type="button" data-step="-1">← Previous</button><span class="viewing-count"></span><button type="button" data-step="1">Next →</button>
</nav></div>`;
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close(); // a click on the backdrop
    const step = e.target.closest('[data-step]');
    if (step) show(current + Number(step.dataset.step));
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
  let touchX = null;
  dialog.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - (touchX ?? e.changedTouches[0].clientX);
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    touchX = null;
  });
  // Back at the wall, in front of the last photo looked at.
  dialog.addEventListener('close', () => frames()[current]?.focus({ preventScroll: true }));
  document.body.append(dialog);
  return dialog;
}

function show(i) {
  const all = frames();
  if (!all.length) return;
  current = (i + all.length) % all.length;
  const frame = all[current];
  const thumb = frame.querySelector('img');
  const exhibit = frame.closest('.exhibit');
  const dialog = viewing();
  const img = dialog.querySelector('img');

  // The thumbnail is already loaded: show it at once, then swap in the full-size photo.
  img.src = thumb?.currentSrc || frame.href;
  img.alt = thumb?.alt ?? '';
  if (thumb) {
    const full = new Image();
    full.onload = () => { if (all[current] === frame) img.src = frame.href; };
    full.src = frame.href;
  }

  const palette = frame.dataset.palette.split(' ').map((c) => c.split(':'));
  dialog.querySelector('.placard-no').textContent = `No. ${frame.dataset.no}`;
  dialog.querySelector('cite').textContent = exhibit.querySelector('.placard cite').textContent;
  dialog.querySelector('.placard-meta').replaceChildren(...exhibit.querySelector('.placard-meta').cloneNode(true).childNodes);
  dialog.querySelector('.viewing-palette').replaceChildren(...palette.map(([hex, share]) =>
    el('span', { style: `flex:${+share} 0 0;background:${hex}` })));
  dialog.querySelector('.hexes').textContent = palette.map(([hex]) => hex).join(' ');
  dialog.querySelector('.viewing-count').textContent = `${current + 1} of ${all.length}`;

  // Walk along the wall behind the dialog too.
  frame.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (!dialog.open) dialog.showModal();
}

document.addEventListener('click', (e) => {
  const frame = e.target.closest('.museum .frame');
  if (frame && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    show(frames().indexOf(frame));
  }
  const lights = e.target.closest('.museum .house-lights');
  if (lights) {
    const low = lights.getAttribute('aria-pressed') !== 'true';
    lights.setAttribute('aria-pressed', String(low));
    lights.textContent = low ? 'Bring the lights up' : 'Dim the house lights';
    lights.closest('.museum').toggleAttribute('data-lights-low', low);
  }
});

// Don't save an open dialog into htmx's history snapshot.
document.body.addEventListener('htmx:beforeHistorySave', () => document.getElementById('viewing')?.close());
