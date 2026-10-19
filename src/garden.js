// The homepage garden: imaginary plants grown by seeded, recursive branching in SVG and
// coloured from the palette of one of my photographs (/c/palette, one per day). Colour
// follows growth: the newest shoots and first leaves take the palest colour, older
// branches the most saturated, flowers the brightest, and overlapping leaves are
// multiplied together so foliage darkens where it crowds. Click to plant a seed.
//
// Everything lives in the DOM (the palette in data-stages, the plants as <g>s), and the
// listeners are delegated, so htmx's history snapshot restores a working garden.

const NS = 'http://www.w3.org/2000/svg';
const W = 640, H = 200, GROUND = 188;
const STEP = 420; // ms per generation of growth
const MAX_PLANTS = 12;

// Used when /c/palette is unavailable (or in the plain Vite dev server).
const FALLBACK = ['#e3d4f6', '#c8a2f2', '#9a78d0', '#5e2a96', '#2f8f83', '#d0648c'];

// A small, fast seeded PRNG.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Today's date as a number, so the garden (and its photograph) changes once a day.
const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

// Hex to OKLCH lightness and chroma, for ordering colours by how they look.
function oklch(hex) {
  const h6 = hex.length === 4 ? hex.replace(/\w/g, (c) => c + c) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h6.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    hex,
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    C: Math.hypot(1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s),
  };
}

// Assign a palette's colours to growth stages.
function stages(hexes) {
  // Very pale or very dark colours vanish against the page in one mode or the other.
  let cs = [...new Set(hexes.map((h) => h.toLowerCase()))].map(oklch).filter((c) => c.L > 0.3 && c.L < 0.9);
  if (cs.length < 3) cs = [...cs, ...FALLBACK.map(oklch)].slice(0, 6);
  const byL = [...cs].sort((a, b) => b.L - a.L);
  const byC = [...cs].sort((a, b) => b.C - a.C);
  const mature = byC.find((c) => c.L < 0.75) ?? byL.at(-1);
  const bloom = byC.find((c) => c !== mature) ?? byC[0];
  return {
    young: byL[0].hex,                          // new shoots, first leaves
    mid: byL[Math.floor(byL.length / 2)].hex,   // maturing stems and leaves
    mature: mature.hex,                         // old wood
    bloom: bloom.hex,                           // petals and buds
  };
}

async function choosePalette(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status !== 200) throw new Error(`palette ${res.status}`);
    const { palettes } = await res.json();
    // Skip near-greyscale photographs; a garden needs some colour.
    const usable = (palettes ?? []).filter((p) => p.length >= 3 && p.some((c) => oklch(c.hex).C > 0.06));
    if (!usable.length) throw new Error('no palettes');
    const p = usable[today() % usable.length];
    return stages(p.sort((a, b) => b.share - a.share).slice(0, 7).map((c) => c.hex));
  } catch {
    return stages(FALLBACK);
  }
}

const node = (tag, attrs, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.append(el);
  return el;
};
const f = (n) => Math.round(n * 10) / 10;
const leafPath = (len, w) => `M0 0C${f(len * 0.3)} ${f(-w)} ${f(len * 0.75)} ${f(-w)} ${f(len)} 0C${f(len * 0.75)} ${f(w)} ${f(len * 0.3)} ${f(w)} 0 0Z`;
const delay = (el, ms) => el.style.setProperty('--d', `${Math.round(ms)}ms`);

// Grow one plant at x from a seed. Branches recurse with shrinking length; older
// generations are drawn in the mature colour, the newest in the youngest.
function plant(svg, x, seed, colours, start = 0) {
  const rand = mulberry32(seed);
  const between = (a, b) => a + rand() * (b - a);
  const depth = 4 + Math.floor(rand() * 3);              // 4–6 generations
  const spread = between(0.32, 0.6);                     // branch angle, radians
  const decay = between(0.66, 0.78);
  const lean = between(-0.18, 0.18);
  const leafy = between(0.5, 1);
  const g = node('g', { class: 'plant' }, svg);
  const stems = node('g', {}, g), leaves = node('g', {}, g), blooms = node('g', {}, g);

  const stemColour = (gen) => {
    const t = gen / (depth - 1);
    return t < 0.34 ? colours.mature : t < 0.75 ? colours.mid : colours.young;
  };

  function leaf(px, py, angle, size, colour, at) {
    const wrap = node('g', { transform: `translate(${f(px)} ${f(py)}) rotate(${f(angle * 180 / Math.PI)})` }, leaves);
    delay(node('path', { class: 'leaf', d: leafPath(size, size * between(0.28, 0.4)), fill: colour }, wrap), at);
  }

  function flower(px, py, at) {
    const petals = 5 + Math.floor(rand() * 3), r = between(5, 9), turn = rand() * Math.PI;
    for (let i = 0; i < petals; i++) leaf(px, py, turn + (i / petals) * Math.PI * 2, r, colours.bloom, at + i * 40);
    delay(node('circle', { class: 'bud', cx: f(px), cy: f(py), r: f(r * 0.28), fill: colours.mature }, blooms), at + petals * 40);
  }

  function branch(px, py, angle, len, gen) {
    const ex = px + Math.cos(angle) * len, ey = py + Math.sin(angle) * len;
    // A slight bow, perpendicular to the branch.
    const bow = between(-0.18, 0.18) * len;
    const cx = (px + ex) / 2 - Math.sin(angle) * bow, cy = (py + ey) / 2 + Math.cos(angle) * bow;
    const at = start + gen * STEP + rand() * 80;
    delay(node('path', {
      class: 'stem', d: `M${f(px)} ${f(py)}Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`, pathLength: 1,
      stroke: stemColour(gen), 'stroke-width': f(Math.max(0.7, (depth - gen) * 0.85)),
    }, stems), at);

    // Leaves along the newer branches; the youngest are palest.
    if (gen >= 1) {
      const n = Math.floor(rand() * 2.6 * leafy);
      for (let i = 0; i < n; i++) {
        const t = between(0.35, 0.95), side = rand() < 0.5 ? -1 : 1;
        leaf(px + (ex - px) * t, py + (ey - py) * t, angle + side * between(0.5, 1.1),
          between(9, 16) * (1 - gen / (depth * 2)), gen >= depth - 2 ? colours.young : colours.mid, at + STEP * t + 120);
      }
    }

    if (gen === depth - 1) {
      if (rand() < 0.4) flower(ex, ey, at + STEP + 150);
      else leaf(ex, ey, angle, between(8, 12), colours.young, at + STEP);
      return;
    }
    const kids = rand() < 0.22 ? 3 : rand() < 0.12 ? 1 : 2;
    for (let i = 0; i < kids; i++) {
      const off = kids === 1 ? between(-0.2, 0.2) : (i / (kids - 1) - 0.5) * 2 * spread * between(0.7, 1.2);
      // Pull each branch back towards the light a little.
      const a = angle + off + (-Math.PI / 2 - angle) * 0.18;
      branch(ex, ey, a, len * decay * between(0.85, 1.1), gen + 1);
    }
  }

  branch(x, GROUND, -Math.PI / 2 + lean, between(44, 60), 0);
  // The oldest plant wilts away once the bed is full.
  const plants = svg.querySelectorAll('.plant:not(.wilt)');
  if (plants.length > MAX_PLANTS) {
    plants[0].classList.add('wilt');
    setTimeout(() => plants[0].remove(), 1200);
  }
}

function bed(svg) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  node('path', { class: 'ground', d: `M0 ${GROUND + 1}Q${W / 4} ${GROUND - 3} ${W / 2} ${GROUND + 1}T${W} ${GROUND + 1}` }, svg);
}

const coloursOf = (box) => JSON.parse(box.dataset.stages);

export async function growGarden(root) {
  const box = root.querySelector('.garden');
  // data-loaded survives htmx's history snapshot, so going back keeps the same garden.
  if (!box || box.hasAttribute('data-loaded')) return;
  box.setAttribute('data-loaded', '');
  const svg = box.querySelector('.garden-bed');
  bed(svg);
  const colours = await choosePalette(box.dataset.palette);
  box.dataset.stages = JSON.stringify(colours);

  // Plant the day's first few seeds once the garden scrolls into view.
  new IntersectionObserver((entries, io) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const rand = mulberry32(today());
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const x = W * (i + 0.5) / n + (rand() - 0.5) * (W / n) * 0.5;
      plant(svg, x, today() * 31 + i, colours, i * 350);
    }
  }, { threshold: 0.3 }).observe(box);
}

// Delegated, so a garden restored from htmx's history still responds.
document.addEventListener('click', (e) => {
  const box = e.target.closest('.garden[data-stages]');
  if (!box) return;
  const svg = box.querySelector('.garden-bed');
  let x;
  if (e.target.closest('.garden-plant')) x = 40 + Math.random() * (W - 80);
  else if (e.target.closest('.garden-bed')) x = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()).x;
  else return;
  plant(svg, x, (Math.random() * 2 ** 32) >>> 0, coloursOf(box));
});
