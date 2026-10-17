// GET /c/colours -> an htmx fragment: a shelf of book spines, one per recent photo, each
// striped with that photo's colour palette (from the getcolors function on hear.).
// Opening a spine shows the photo; until then no image is downloaded. Responses are
// kept in the edge cache, so getcolors is hit at most once per TTL per data centre.

const SOURCE = 'https://hear.janithwanni.com/.netlify/functions/getcolors?limit=12';
const TTL = 3600;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Colours go straight into style="", so only plain hex is let through.
const isHex = (h) => typeof h === 'string' && /^#(?:[0-9a-f]{3}){1,2}$/i.test(h);

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Australia/Melbourne' });

// A rough colour name for screen readers: "deep blue", "pale orange", "grey".
function colourName(hex) {
  const h6 = hex.length === 4 ? hex.replace(/\w/g, (c) => c + c) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h6.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l < 0.12) return 'black';
  if (l > 0.93) return 'white';
  const tone = l < 0.3 ? 'deep ' : l > 0.75 ? 'pale ' : '';
  if (d / (1 - Math.abs(2 * l - 1)) < 0.15) return `${tone}grey`;
  const hue = (max === r ? (g - b) / d + 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 % 360;
  const names = [[15, 'red'], [45, 'orange'], [70, 'yellow'], [160, 'green'], [200, 'teal'], [255, 'blue'], [290, 'violet'], [335, 'pink'], [360, 'red']];
  return tone + names.find(([end]) => hue < end)[1];
}

async function photos() {
  const res = await fetch(SOURCE, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`getcolors ${res.status}`);
  return ((await res.json()).images ?? [])
    .map((p) => ({ ...p, palette: (p.palette ?? []).filter((c) => isHex(c.hex) && c.share > 0) }))
    .filter((p) => p.palette.length);
}

function spine(p) {
  const date = new Date(p.date ?? p.time * 1000);
  const caption = esc(p.caption || 'untitled');
  const spoken = p.palette.map((c) => `${colourName(c.hex)} ${Math.round(c.share * 100)}%`).join(', ');
  const bands = p.palette.map((c) => `<span style="flex:${+c.share} 0 0;background:${c.hex}" title="${c.hex}"></span>`).join('');
  const img = /^https:\/\//.test(p.imageUrl ?? '')
    ? `<img src="${esc(p.imageUrl)}" alt="${caption}" width="320" height="224" loading="lazy" decoding="async">`
    : '';
  return `<details class="spine" name="spine"><summary>` +
    `<span class="bands" aria-hidden="true">${bands}</span>` +
    `<span class="spine-label">${caption}</span>` +
    `<span class="vh">, ${dateFmt.format(date)}: ${spoken}</span></summary>` +
    `<figure class="plate">${img}<figcaption><cite>${caption}</cite> · ` +
    `<time datetime="${date.toISOString()}">${shortFmt.format(date)}</time>` +
    `<span class="hexes">${p.palette.map((c) => c.hex.toLowerCase()).join(' ')}</span></figcaption></figure></details>`;
}

const render = (list) => `<h3 class="small-head">On the shelf, in colour</h3>
<div class="shelf">${list.map(spine).join('\n')}</div>
<p class="shelf-note">Colours from photographs I have taken. Take one down to look closer.</p>`;

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  let list;
  try {
    list = await photos();
  } catch (err) {
    console.error('colours:', err.message);
    list = [];
  }
  // htmx leaves the placeholder untouched on a 204, so failures stay invisible.
  if (!list.length) return new Response(null, { status: 204 });

  const res = new Response(render(list), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${TTL}` },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
