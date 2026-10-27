// GET /c/exhibition -> an htmx fragment for /museum/: every photograph, framed and hung
// on the walls of a small museum, in rooms by colour. Each frame links to the full-size
// photo; src/museum.js turns that into a closer look (a <dialog>) with its palette.
// Cached at the edge like /c/colours.

import { photos } from '../_lib/photos.js';

const TTL = 300;
const LIMIT = 120;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' });

// Each photo is hung in the room of its boldest colour: the one with the most chroma,
// weighed by how much of the photo it covers. Photos with no strong colour go to the
// quiet room. Hues are in degrees; the warm room wraps around through pinks to red.
const ROOMS = [
  { id: 'warm', name: 'The Warm Room', note: 'Reds, oranges &amp; golds', tint: '#d46e0d', hues: (h) => h < 55 || h >= 290 },
  { id: 'green', name: 'The Green Room', note: 'Leaves &amp; growing things', tint: '#6d8206', hues: (h) => h >= 55 && h < 160 },
  { id: 'blue', name: 'The Blue Room', note: 'Skies, seas &amp; evenings', tint: '#0576ac', hues: (h) => h >= 160 && h < 290 },
  { id: 'quiet', name: 'The Quiet Room', note: 'Greys &amp; shadows', tint: '#776751', hues: () => false },
];

function hueAndChroma(hex) {
  const h6 = hex.length === 4 ? hex.replace(/\w/g, (c) => c + c) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h6.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const hue = d === 0 ? 0 : (max === r ? (g - b) / d + 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 % 360;
  return { hue, chroma: d };
}

function roomFor(p) {
  let best = null, score = 0.065; // below this, nothing in the photo is bold enough
  for (const c of p.palette) {
    const { hue, chroma } = hueAndChroma(c.hex);
    if (Math.sqrt(c.share) * chroma > score) { score = Math.sqrt(c.share) * chroma; best = hue; }
  }
  return best === null ? ROOMS.at(-1) : ROOMS.find((room) => room.hues(best));
}

const roman = (n) => [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((out, [v, r]) => { while (n >= v) { out += r; n -= v; } return out; }, '');

const https = (url) => (/^https:\/\//.test(url ?? '') ? url : '');

function exhibit(p, no) {
  const caption = esc(p.caption || 'Untitled');
  const date = new Date(p.date ?? p.time * 1000);
  // The mat takes the photo's main colour; the pigments list the whole palette.
  const [main] = [...p.palette].sort((a, b) => b.share - a.share);
  const thumb = https(p.thumbUrl ?? p.imageUrl);
  const full = https(p.imageUrl) || thumb;
  const palette = p.palette.map((c) => `${c.hex.toLowerCase()}:${+c.share}`).join(' ');
  const dots = p.palette.map((c) => `<span style="background:${c.hex}"></span>`).join('');
  return `<li class="exhibit" style="--tint:${main.hex}">` +
    `<a class="frame" href="${esc(full)}" data-no="${no}" data-palette="${palette}" aria-label="No. ${no}, ${caption}: step closer">` +
    (thumb ? `<img src="${esc(thumb)}" alt="${caption}" width="320" height="240" loading="lazy" decoding="async">` : '') +
    `</a><p class="placard"><span class="placard-no">No. ${no}</span><cite>${caption}</cite>` +
    `<span class="placard-meta">Photograph · <time datetime="${date.toISOString()}">${dateFmt.format(date)}</time></span>` +
    `<span class="pigments" aria-hidden="true">${dots}</span></p></li>`;
}

function render(list) {
  const when = (p) => new Date(p.date ?? p.time * 1000);
  const rooms = ROOMS
    .map((room) => ({ ...room, works: list.filter((p) => roomFor(p) === room).sort((a, b) => when(b) - when(a)) }))
    .filter((room) => room.works.length);
  let no = 0;
  const halls = rooms.map(({ id, name, note, tint, works }, i) => `<section class="room" id="room-${id}" style="--room:${tint}" aria-labelledby="room-${id}-head">
<h2 class="room-head" id="room-${id}-head"><span class="room-no">Room ${roman(i + 1)}</span>${name}<em>${note}</em></h2>
<ol class="wall" tabindex="0" aria-label="${name}, ${works.length} photograph${works.length === 1 ? '' : 's'}; scroll to walk along">
${works.map((p) => exhibit(p, ++no)).join('\n')}
</ol>
</section>`);
  const plan = rooms.map(({ id, name, tint, works }, i) =>
    `<li style="--room:${tint}"><a href="#room-${id}"><span class="room-no">${roman(i + 1)}</span> ${name}</a> <span class="count">${works.length}</span></li>`);
  return `<div class="ticket">
<p class="ticket-stub"><span>Admit one</span><span class="ticket-no">No. ${String(list.length).padStart(4, '0')}</span></p>
<div class="ticket-body">
<p class="small-head">Floor plan · ${list.length} photographs in ${rooms.length} room${rooms.length === 1 ? '' : 's'}</p>
<ol class="floor-plan">${plan.join('')}</ol>
<button type="button" class="house-lights" aria-pressed="false">Dim the house lights</button>
</div>
</div>
${halls.join('\n')}
<p class="museum-exit">Thank you for visiting. Mind the step on your way out.</p>`;
}

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  let list;
  try {
    list = await photos(LIMIT);
  } catch (err) {
    console.error('exhibition:', err.message);
    list = [];
  }
  // Unlike the homepage rows, the museum says when it is closed; that isn't cached.
  if (!list.length) {
    return new Response('<p class="museum-status">The museum is closed today. Please come back a little later.</p>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const res = new Response(render(list), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=60, s-maxage=${TTL}` },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
