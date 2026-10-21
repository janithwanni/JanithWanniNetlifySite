// The flowers in my actual garden, arranged in a vase and painted in watercolour. No images:
// each flower is drawn as SVG from a few petal and leaf shapes, and the paint comes from
// shared filters that wobble the edges, pool pigment where a wash dries and let the paper
// grain show through. Petals are translucent, so where they overlap they glaze darker.
//
// The section's <li>s name the flowers that can go in the vase; which of them do, in which
// of their colours and where, is chosen afresh each day and on every click of Rearrange.

import { mulberry32, today } from './garden.js';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const f = (n) => Math.round(n * 10) / 10;
const deg = (a) => f(a * 180 / Math.PI);

const node = (tag, attrs, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.append(el);
  return el;
};

// wc-petal and wc-leaf differ only in their noise, so neighbouring washes don't wobble alike.
// Edge pooling: (1.8 × the wash) − (0.8 × the wash blurred) is the wash itself in the middle
// but more opaque just inside its edge. wc-fuzz roughens the edge finely, for wattle.
const FILTERS = `
<filter id="wc-petal" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="4" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feGaussianBlur in="d" stdDeviation="1.1" result="b"/>
  <feComposite in="d" in2="b" operator="arithmetic" k2="1.8" k3="-0.8" result="e"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="9" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0.45" result="grain"/>
  <feComposite in="e" in2="grain" operator="in"/>
</filter>
<filter id="wc-leaf" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="17" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feGaussianBlur in="d" stdDeviation="1.3" result="b"/>
  <feComposite in="d" in2="b" operator="arithmetic" k2="1.7" k3="-0.7" result="e"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="23" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0.45" result="grain"/>
  <feComposite in="e" in2="grain" operator="in"/>
</filter>
<filter id="wc-fuzz" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feGaussianBlur in="d" stdDeviation="0.7" result="b"/>
  <feComposite in="d" in2="b" operator="arithmetic" k2="1.6" k3="-0.6"/>
</filter>
<filter id="wc-bleed" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>`;

// Petal outlines, pointing along +x from the flower's centre: length L, half-width w.
const SHAPES = {
  // Widest near the tip (impatiens, hibiscus, petunia).
  round: (L, w) => `M0 0C${f(L * 0.15)} ${f(-w * 0.5)} ${f(L * 0.5)} ${f(-w * 1.1)} ${f(L * 0.82)} ${f(-w * 0.95)}Q${f(L * 1.04)} ${f(-w * 0.55)} ${f(L)} 0Q${f(L * 1.04)} ${f(w * 0.55)} ${f(L * 0.82)} ${f(w * 0.95)}C${f(L * 0.5)} ${f(w * 1.1)} ${f(L * 0.15)} ${f(w * 0.5)} 0 0Z`,
  // A notch at the tip (primula).
  heart: (L, w) => `M0 0C${f(L * 0.15)} ${f(-w * 0.5)} ${f(L * 0.5)} ${f(-w * 1.1)} ${f(L * 0.82)} ${f(-w * 0.95)}Q${f(L * 1.08)} ${f(-w * 0.6)} ${f(L * 0.86)} 0Q${f(L * 1.08)} ${f(w * 0.6)} ${f(L * 0.82)} ${f(w * 0.95)}C${f(L * 0.5)} ${f(w * 1.1)} ${f(L * 0.15)} ${f(w * 0.5)} 0 0Z`,
  // Lopsided, so five of them turn like a pinwheel (vinca).
  pinwheel: (L, w) => `M0 0C${f(L * 0.2)} ${f(-w * 0.4)} ${f(L * 0.55)} ${f(-w * 1.25)} ${f(L * 0.9)} ${f(-w * 0.9)}Q${f(L * 1.08)} ${f(-w * 0.4)} ${f(L * 0.95)} ${f(w * 0.2)}C${f(L * 0.75)} ${f(w * 0.75)} ${f(L * 0.3)} ${f(w * 0.45)} 0 0Z`,
  // Long and narrow with a blunt tip (daisies, chrysanthemum).
  strap: (L, w) => `M0 ${f(-w * 0.35)}C${f(L * 0.3)} ${f(-w)} ${f(L * 0.85)} ${f(-w)} ${f(L * 0.97)} ${f(-w * 0.35)}Q${f(L * 1.03)} 0 ${f(L * 0.97)} ${f(w * 0.35)}C${f(L * 0.85)} ${f(w)} ${f(L * 0.3)} ${f(w)} 0 ${f(w * 0.35)}Z`,
  // A pinked, saw-toothed tip (dianthus) or a softly scalloped one (marigold, portulaca).
  fringe: (L, w) => edged(L, w, 9, 0.16, 'L'),
  ruffle: (L, w) => edged(L, w, 5, 0.1, 'Q'),
};

// A petal whose outer edge is an arc of teeth (straight, L) or scallops (curved, Q).
function edged(L, w, teeth, depth, kind) {
  const r = L * 0.78, span = Math.asin(Math.min(0.95, w / r));
  let d = `M0 0C${f(L * 0.2)} ${f(-w * 0.6)} ${f(L * 0.45)} ${f(-w * 1.05)} ${f(Math.cos(span) * r)} ${f(-Math.sin(span) * r)}`;
  for (let i = 1; i <= teeth; i++) {
    const a1 = -span + (2 * span * (i - 0.5)) / teeth, a2 = -span + (2 * span * i) / teeth;
    const out = L * (1 + depth) * (0.94 + 0.06 * Math.cos(a1 * 1.6));
    const tip = [Math.cos(a1) * out, Math.sin(a1) * out];
    const end = [Math.cos(a2) * r * (1 + depth * 0.4), Math.sin(a2) * r * (1 + depth * 0.4)];
    d += kind === 'Q' ? `Q${f(tip[0])} ${f(tip[1])} ${f(end[0])} ${f(end[1])}` : `L${f(tip[0])} ${f(tip[1])}L${f(end[0])} ${f(end[1])}`;
  }
  return `${d}C${f(L * 0.45)} ${f(w * 1.05)} ${f(L * 0.2)} ${f(w * 0.6)} 0 0Z`;
}

// Leaf outlines, also along +x from the stalk.
const LEAVES = {
  lens: (L, w) => `M0 0C${f(L * 0.3)} ${f(-w)} ${f(L * 0.75)} ${f(-w)} ${f(L)} 0C${f(L * 0.75)} ${f(w)} ${f(L * 0.3)} ${f(w)} 0 0Z`,
  oval: (L, w) => `M0 0C${f(L * 0.05)} ${f(-w * 1.2)} ${f(L * 0.8)} ${f(-w * 1.15)} ${f(L)} 0C${f(L * 0.8)} ${f(w * 1.15)} ${f(L * 0.05)} ${f(w * 1.2)} 0 0Z`,
  // Toothed (hibiscus) or deeply lobed (chrysanthemum, primula's crinkled edge).
  toothed: (L, w) => margin(L, w, 7, 0.12),
  lobed: (L, w) => margin(L, w, 3, 0.32),
};

function margin(L, w, lobes, depth) {
  const hw = (t) => w * Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.8;
  // Each lobe bulges out to a control point and comes back in at the notch after it.
  const ctrl = [], notch = [[0, 0]];
  for (let i = 1; i <= lobes; i++) {
    const tm = (i - 0.5) / lobes, t1 = i / lobes;
    ctrl.push([L * (tm + 0.04), hw(tm) * (1 + depth)]);
    notch.push([L * t1, hw(t1) * (1 - depth)]);
  }
  // Up one side to the tip, then back down the mirrored side.
  let d = 'M0 0';
  for (let i = 0; i < lobes; i++) d += `Q${f(ctrl[i][0])} ${f(-ctrl[i][1])} ${f(notch[i + 1][0])} ${f(-notch[i + 1][1])}`;
  for (let i = lobes - 1; i >= 0; i--) d += `Q${f(ctrl[i][0])} ${f(ctrl[i][1])} ${f(notch[i][0])} ${f(notch[i][1])}`;
  return `${d}Z`;
}


// The paint box for one arrangement: gradients are made on demand, the shapes share the filters.
let uid = 0;
function painter(svg, rand) {
  const between = (a, b) => a + rand() * (b - a);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const defs = node('defs', {}, svg);
  const gradient = (tag, attrs, stops) => {
    const g = node(tag, { id: `wc${uid++}`, ...attrs }, defs);
    for (const [o, c] of stops) node('stop', { offset: o, 'stop-color': c }, g);
    return `url(#${g.id})`;
  };
  // A radial wash centred on a flower: stops are [offset, colour] from the eye outwards.
  const radial = (stops, r) => gradient('radialGradient', { gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: f(r) }, stops);
  // A wash along a leaf (paler at the stalk) or across a vase (paler on the lit side).
  const linear = ([a, b]) => gradient('linearGradient', {}, [[0, a], [1, b]]);

  return {
    rand, between, pick, linear,
    layer: (parent, filter) => node('g', filter ? { filter: `url(#wc-${filter})` } : {}, parent),

    // A soft, wet-in-wet bleed of colour behind a flower.
    bleed(g, x, y, r, colour, opacity = 0.14) {
      node('circle', { cx: f(x + r * 0.15), cy: f(y + r * 0.2), r: f(r * 0.85), fill: colour, opacity, filter: 'url(#wc-bleed)' }, g);
    },

    // A stalk along a cubic Bézier [start, control, control, end].
    curve(g, [a, b, c, d], width, colour) {
      node('path', { d: `M${f(a[0])} ${f(a[1])}C${f(b[0])} ${f(b[1])} ${f(c[0])} ${f(c[1])} ${f(d[0])} ${f(d[1])}`, fill: 'none', stroke: colour, 'stroke-width': width, 'stroke-linecap': 'round', opacity: 0.75 }, g);
    },

    leaf(g, x, y, angle, L, w, colours, shape = 'lens', vein) {
      const wrap = node('g', { transform: `translate(${f(x)} ${f(y)}) rotate(${deg(angle)})` }, g);
      node('path', { d: LEAVES[shape](L, w), fill: linear(colours), 'fill-opacity': 0.62 }, wrap);
      if (vein) node('path', { d: `M${f(L * 0.05)} 0Q${f(L * 0.5)} ${f(w * 0.08)} ${f(L * 0.85)} 0`, fill: 'none', stroke: vein, 'stroke-width': 0.6, opacity: 0.6 }, wrap);
    },

    // A leaf of paired leaflets along a midrib (marigold, marguerite).
    pinnate(g, x, y, angle, L, colours, pairs = 5, leaflet = 0.32) {
      const wrap = node('g', { transform: `translate(${f(x)} ${f(y)}) rotate(${deg(angle)})` }, g);
      node('path', { d: `M0 0L${f(L)} 0`, stroke: colours[1], 'stroke-width': 0.8, opacity: 0.7 }, wrap);
      const fill = linear(colours);
      for (let i = 0; i < pairs; i++) {
        const t = (i + 1) / (pairs + 1), len = L * leaflet * (1.15 - t * 0.6);
        for (const s of [-1, 1]) {
          const at = node('g', { transform: `translate(${f(L * t)} 0) rotate(${f(s * between(40, 60))})` }, wrap);
          node('path', { d: LEAVES.lens(len, len * 0.28), fill, 'fill-opacity': 0.6 }, at);
        }
      }
      node('path', { d: LEAVES.lens(L * leaflet, L * leaflet * 0.28), transform: `translate(${f(L * 0.97)} 0)`, fill, 'fill-opacity': 0.6 }, wrap);
    },

    // A whorl of petals around (x, y). tilt squashes it vertically, as if seen at an angle.
    head(g, x, y, { n, L, w, shape, stops, rot = rand() * TAU, jitter = 0.1, tilt = 1, opacity = 0.82 }) {
      const fill = radial(stops, L * 1.05);
      const wrap = node('g', { transform: `translate(${f(x)} ${f(y)}) scale(1 ${tilt})` }, g);
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU + between(-jitter, jitter) * (TAU / n);
        const len = L * between(1 - jitter, 1 + jitter * 0.5);
        node('path', { d: SHAPES[shape](len, w * between(0.9, 1.1)), transform: `rotate(${deg(a)})`, fill, 'fill-opacity': opacity }, wrap);
      }
      return wrap;
    },

    dot(g, x, y, r, colour, opacity = 0.75) {
      node('circle', { cx: f(x), cy: f(y), r: f(r), fill: colour, 'fill-opacity': opacity }, g);
    },

    // A daisy's disc: a wash with a ring of florets.
    disc(g, x, y, r, base, florets, tilt = 1) {
      node('ellipse', { cx: f(x), cy: f(y), rx: f(r), ry: f(r * tilt), fill: base, 'fill-opacity': 0.85 }, g);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + between(-0.15, 0.15), d = r * between(0.55, 0.9);
        node('circle', { cx: f(x + Math.cos(a) * d), cy: f(y + Math.sin(a) * d * tilt), r: f(r * 0.14), fill: florets, 'fill-opacity': 0.7 }, g);
      }
    },

    line(g, x1, y1, x2, y2, colour, width = 0.5, opacity = 0.5) {
      node('path', { d: `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, stroke: colour, 'stroke-width': width, 'stroke-linecap': 'round', opacity }, g);
    },
  };
}

// Greens, as [near the stalk, at the tip].
const GREEN = ['#b5cf7a', '#4e8a3c'];
const DARK_GREEN = ['#7fae5e', '#2f6234'];
const GREY_GREEN = ['#b8c9a6', '#6f8c6a'];
const BLUE_GREEN = ['#a9c7b9', '#4f7f78'];

// Small flowers come a few to a stem.
function cluster(p, n, x, y, spread, bloom) {
  const turn = p.rand() * TAU;
  for (let k = 0; k < n; k++) {
    const a = turn + (k / n) * TAU;
    bloom(x + Math.cos(a) * spread, y + Math.sin(a) * spread * 0.8);
  }
}

// Every kind of flower in the garden and the colours it grows in. r is the head's rough
// radius, for spacing; fillers (spikes and sprays) stand at the back of the arrangement.
// paint() draws one stem's flowers at (x, y), scaled by s; dir is the stem's direction there.
const FLOWERS = {
  primula: {
    plural: 'primulas', r: 15, stem: '#6f9b4a',
    variants: [{ colour: '', tint: '#c92f7c', blooms: ['#c92f7c', '#7d4cb0', '#e9b318', '#d8364a'] }],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 16 * s, 6 * s, GREEN, 'lobed', '#e4efc6'),
    paint(p, g, x, y, s, v) {
      cluster(p, 3, x, y, 7 * s, (fx, fy) => {
        const c = p.pick(v.blooms);
        p.head(g, fx, fy, { n: 5, L: 9 * s, w: 6 * s, shape: 'heart', stops: [[0, '#f4c51f'], [0.3, '#f6d34a'], [0.42, c], [1, c]] });
        p.dot(g, fx, fy, 1.1 * s, '#c98d00');
      });
    },
  },

  marigold: {
    plural: 'marigolds', r: 20, stem: '#5d8c3e',
    variants: [
      { colour: 'red', tint: '#b52c1e', rings: [['#5e0e0b', '#a8241a'], ['#6e130f', '#b52c1e'], ['#7a1a10', '#c0351f'], ['#4f0b08', '#8f1d14']] },
      { colour: 'yellow', tint: '#f5b324', rings: [['#d08a05', '#f5c02c'], ['#d99606', '#f7c83a'], ['#e0a00a', '#f8d04a'], ['#c27c04', '#f0b81f']] },
    ],
    leaf: (p, g, x, y, a, s) => p.pinnate(g, x, y, a, 22 * s, DARK_GREEN, 5, 0.26),
    paint(p, g, x, y, s, v) {
      [[15, 20, 6.5], [13, 15.5, 6], [11, 11, 5], [8, 7, 4.2]].forEach(([n, L, w], i) =>
        p.head(g, x, y, { n, L: L * s, w: w * s, shape: 'ruffle', tilt: 0.86, stops: [[0, v.rings[i][0]], [1, v.rings[i][1]]] }));
    },
  },

  chrysanthemum: {
    plural: 'chrysanthemums', r: 21, stem: '#56803f',
    variants: [{ colour: 'white', tint: '#e8c94a' }],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 18 * s, 7 * s, DARK_GREEN, 'lobed', '#d4e3b8'),
    paint(p, g, x, y, s) {
      // White petals are the paper, with only their shadows painted; the eye is yellow.
      const stops = [[0, '#cdb64a'], [0.3, '#cfccdc'], [1, '#efeef5']];
      [[22, 21, 3], [18, 17, 3], [15, 13, 2.8], [11, 9, 2.5]].forEach(([n, L, w]) =>
        p.head(g, x, y, { n, L: L * s, w: w * s, shape: 'strap', tilt: 0.82, jitter: 0.18, stops, opacity: 0.85 }));
      p.disc(g, x, y, 4.5 * s, '#e8b923', '#c38f0c', 0.85);
    },
  },

  impatiens: {
    plural: 'impatiens', r: 16, stem: '#5b8f46',
    variants: [
      { colour: 'pink', tint: '#ef6b88', stops: [[0, '#fff4f4'], [0.1, '#fff4f4'], [0.16, '#c2335c'], [0.32, '#ee6283'], [1, '#f6899f']] },
      { colour: 'red', tint: '#d8263a', stops: [[0, '#fff0e8'], [0.1, '#fff0e8'], [0.16, '#7e0c1c'], [0.32, '#cc1f33'], [1, '#e2393f']] },
    ],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 14 * s, 5 * s, DARK_GREEN, 'oval', '#cfe2ad'),
    paint(p, g, x, y, s, v) {
      cluster(p, 3, x, y, 8 * s, (fx, fy) => p.head(g, fx, fy, { n: 5, L: 10 * s, w: 7 * s, shape: 'round', tilt: 0.92, stops: v.stops }));
    },
  },

  vinca: {
    plural: 'vincas', r: 15, stem: '#4f7c3c',
    variants: [
      { colour: 'pink', tint: '#e88cb4', stops: [[0, '#fbeef3'], [0.05, '#fbeef3'], [0.1, '#a3164a'], [0.28, '#c43a73'], [0.4, '#f0a2c4'], [1, '#f6c1d8']] },
      { colour: 'white', tint: '#d6c9de', stops: [[0, '#fff'], [0.05, '#fff'], [0.1, '#b8295c'], [0.22, '#d36b92'], [0.34, '#d2d0de'], [1, '#efeef5']] },
    ],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 15 * s, 5.5 * s, ['#5f9b4c', '#244f2c'], 'oval', '#d7ebbd'),
    paint(p, g, x, y, s, v) {
      cluster(p, 2, x, y, 7 * s, (fx, fy) => p.head(g, fx, fy, { n: 5, L: 12 * s, w: 7.5 * s, shape: 'pinwheel', jitter: 0.04, stops: v.stops }));
    },
  },

  petunia: {
    plural: 'petunias', r: 18, stem: '#5e8a42',
    variants: [
      { colour: 'pink', tint: '#d9599e', vein: '#7a1550', stops: [[0, '#6a0f45'], [0.18, '#a52d72'], [0.5, '#d9599e'], [1, '#ef8fc0']] },
      { colour: 'white', tint: '#d8d6a8', vein: '#9d9ab4', stops: [[0, '#b8b77a'], [0.15, '#d8d6a8'], [0.35, '#d0cedc'], [1, '#efeef5']] },
    ],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 13 * s, 5 * s, GREEN, 'oval', '#e1eec8'),
    paint(p, g, x, y, s, v) {
      const flower = p.head(g, x, y, { n: 5, L: 17 * s, w: 11.5 * s, shape: 'round', jitter: 0.05, stops: v.stops });
      // Veins, darker, running out from the throat.
      for (let i = 0; i < 15; i++) {
        const a = (i / 15) * TAU + p.between(-0.1, 0.1);
        p.line(flower, Math.cos(a) * 1.5 * s, Math.sin(a) * 1.5 * s, Math.cos(a) * 12 * s, Math.sin(a) * 12 * s, v.vein, 0.5, 0.4);
      }
    },
  },

  lavender: {
    plural: 'lavender', r: 8, stem: '#7f9a72', filler: true,
    variants: [{ colour: '', tint: '#8f74c8' }],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 12 * s, 1.4 * s, GREY_GREEN, 'lens'),
    // A spike of whorls, smallest at the tip, along the stem.
    paint(p, g, x, y, s, v, dir) {
      const ux = Math.cos(dir), uy = Math.sin(dir);
      for (let t = 0, at = 0; t < 10; t++, at += t < 7 ? 2.6 : 4) {
        const cx = x - ux * at * s, cy = y - uy * at * s, size = (1.1 + Math.min(t, 6) * 0.13) * s;
        for (const k of [-1, 0, 1]) {
          const ex = cx - uy * k * 1.7 * s + p.between(-0.4, 0.4), ey = cy + ux * k * 1.7 * s + p.between(-0.4, 0.4);
          node('ellipse', { cx: f(ex), cy: f(ey), rx: f(size), ry: f(size * 1.3), transform: `rotate(${f(deg(dir) - 90)} ${f(ex)} ${f(ey)})`,
            fill: t < 3 ? '#a58bd8' : '#7556b4', 'fill-opacity': 0.65 }, g);
        }
      }
    },
  },

  'african-daisy': {
    plural: 'African daisies', r: 22, stem: '#4f7f3f',
    variants: [{ colour: 'yellow', tint: '#f2c12e' }],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 18 * s, 4 * s, DARK_GREEN, 'toothed', '#cfe2b2'),
    paint(p, g, x, y, s) {
      p.head(g, x, y, { n: 13, L: 21 * s, w: 3.8 * s, shape: 'strap', tilt: 0.9, stops: [[0, '#8a5a0a'], [0.22, '#d99a12'], [0.45, '#f2c12e'], [1, '#f8dd70']] });
      p.disc(g, x, y, 5 * s, '#4b2e5c', '#e9c94a', 0.9);
    },
  },

  'marguerite-daisy': {
    plural: 'marguerite daisies', r: 15, stem: '#7aa45a',
    variants: [{ colour: 'pink', tint: '#e070a0' }],
    leaf: (p, g, x, y, a, s) => p.pinnate(g, x, y, a, 16 * s, ['#c5dc9c', '#7aa45a'], 4, 0.3),
    paint(p, g, x, y, s) {
      p.head(g, x, y, { n: 16, L: 14 * s, w: 3 * s, shape: 'strap', tilt: 0.92, jitter: 0.12, stops: [[0, '#a3305f'], [0.3, '#e070a0'], [1, '#f7b6d0']] });
      p.disc(g, x, y, 4 * s, '#f2b705', '#c27f00', 0.92);
    },
  },

  dianthus: {
    plural: 'dianthus', r: 14, stem: '#6c9a90',
    variants: [{ colour: '', tint: '#e2557f' }],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 14 * s, 1.3 * s, BLUE_GREEN, 'lens'),
    paint(p, g, x, y, s) {
      cluster(p, 2, x, y, 7 * s, (fx, fy) => {
        p.head(g, fx, fy, { n: 5, L: 10 * s, w: 7 * s, shape: 'fringe', jitter: 0.06, stops: [[0, '#4d0820'], [0.25, '#9e123e'], [0.42, '#e0507c'], [1, '#f6a3bb']] });
        p.dot(g, fx, fy, 0.9 * s, '#f6e6ea', 0.85);
      });
    },
  },

  hibiscus: {
    plural: 'hibiscus', r: 26, stem: '#4f7a3a',
    variants: [{ colour: 'purple', tint: '#8848a6' }],
    leaf: (p, g, x, y, a, s) => p.leaf(g, x, y, a, 20 * s, 9 * s, DARK_GREEN, 'toothed', '#c3dba5'),
    paint(p, g, x, y, s) {
      p.head(g, x, y, { n: 5, L: 24 * s, w: 16 * s, shape: 'round', jitter: 0.05, tilt: 0.92, opacity: 0.85, stops: [[0, '#2e0636'], [0.15, '#561462'], [0.3, '#8848a6'], [1, '#b791d6']] });
      // The staminal column, arching out of the throat.
      const tip = [x + 13 * s, y - 17 * s];
      p.curve(g, [[x, y], [x + 5 * s, y - 6 * s], [x + 9 * s, y - 12 * s], tip], 1.5 * s, '#efe2f2');
      for (let i = 0; i < 8; i++) p.dot(g, x + (6 + i * 0.8) * s + p.between(-1.2, 1.2), y - (8 + i * 1) * s + p.between(-1, 1), 0.9 * s, '#f0be2a', 0.9);
      for (let i = 0; i < 5; i++) p.dot(g, tip[0] + Math.cos(i * 1.25) * 1.8 * s, tip[1] + Math.sin(i * 1.25) * 1.8 * s, 0.9 * s, '#7a1a6e', 0.9);
    },
  },

  wattle: {
    plural: 'wattle', r: 14, stem: '#7a5a3c', filler: true, fuzz: true,
    variants: [{ colour: '', tint: '#f2c014' }],
    // Puffballs on short sprays along the end of the stem, between narrow phyllodes.
    paint(p, g, x, y, s, v, dir) {
      const ux = Math.cos(dir), uy = Math.sin(dir);
      for (let i = 0; i < 4; i++) {
        const back = (4 + i * 9) * s, side = i % 2 ? 1 : -1;
        const bx = x - ux * back, by = y - uy * back, a = dir + side * 0.75;
        p.leaf(g, bx, by, dir - side * 0.6, 14 * s, 1.8 * s, GREY_GREEN, 'lens');
        for (let k = 1; k <= 3; k++) {
          p.dot(g, bx + Math.cos(a) * k * 5 * s + p.between(-1, 1), by + Math.sin(a) * k * 5 * s + p.between(-1, 1), p.between(2.4, 3) * s, k % 2 ? '#f2c014' : '#f7d43c', 0.85);
        }
      }
      p.dot(g, x, y, 2.6 * s, '#f7d43c', 0.85);
    },
  },

  portulaca: {
    plural: 'portulaca', r: 13, stem: '#a35c48',
    variants: [{ colour: '', tint: '#e5267a', blooms: [['#e5267a', '#9e0f4c'], ['#f28c1c', '#c2550c'], ['#f6c935', '#d38f0b']] }],
    leaf: (p, g, x, y, a, s) => {
      for (let i = 0; i < 3; i++) p.leaf(g, x, y, a + (i - 1) * 0.5, 7 * s, 1.7 * s, ['#a8cf84', '#5e9a4c'], 'lens');
    },
    paint(p, g, x, y, s, v) {
      cluster(p, 2, x, y, 6 * s, (fx, fy) => {
        const [c, d] = p.pick(v.blooms);
        p.head(g, fx, fy, { n: 5, L: 9 * s, w: 7 * s, shape: 'ruffle', stops: [[0, d], [0.5, c], [1, c]] });
        p.head(g, fx, fy, { n: 5, L: 6 * s, w: 4.5 * s, shape: 'ruffle', stops: [[0, d], [1, c]] });
        for (let i = 0; i < 7; i++) p.dot(g, fx + Math.cos(i) * 1.2 * s, fy + Math.sin(i) * 1.2 * s, 0.5 * s, '#f9e27a', 0.9);
      });
    },
  },
};

// The arrangement: stems gather in the mouth of a vase and fan out into a loose dome.
const W = 400, H = 320;
const NECK = [200, 196];

// A point on, and the direction of, a cubic Bézier at t.
const bez = ([a, b, c, d], t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]);
};
const heading = ([a, b, c, d], t) => {
  const u = 1 - t;
  const [dx, dy] = [0, 1].map((i) => 3 * u * u * (b[i] - a[i]) + 6 * u * t * (c[i] - b[i]) + 3 * t * t * (d[i] - c[i]));
  return Math.atan2(dy, dx);
};

// Which flowers go in today, how many stems of each, and in which of their colours.
function gather(p, kinds) {
  const pool = kinds.filter((k) => FLOWERS[k]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(p.rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const stems = [];
  for (const kind of pool.slice(0, 5 + Math.floor(p.rand() * 3))) {
    const fl = FLOWERS[kind];
    const count = fl.filler ? 2 + Math.floor(p.rand() * 3) : fl.r > 24 ? 1 : 2 + Math.floor(p.rand() * 2);
    for (let i = 0; i < count; i++) stems.push({ kind, fl, v: p.pick(fl.variants), s: p.between(1.3, 1.6) });
  }
  // Fillers reach furthest and go in first; then the big heads, then small ones in the gaps.
  return stems.sort((a, b) => (b.fl.filler ? 99 : b.fl.r) - (a.fl.filler ? 99 : a.fl.r));
}

// Find each head a place in the dome, as far from its neighbours as a few tries allow.
function place(p, stems) {
  const placed = [];
  for (const stem of stems) {
    const r = stem.fl.r * stem.s, reach = stem.fl.filler ? 150 : 80;
    let best, bestScore = -Infinity;
    for (let tries = 0; tries < 40; tries++) {
      const a = p.between(-Math.PI + 0.25, -0.25), d = stem.fl.filler ? p.between(120, 170) : p.between(30, 125);
      const x = NECK[0] + Math.cos(a) * d * 1.35, y = NECK[1] - 4 + Math.sin(a) * d;
      if (x < r + 4 || x > W - r - 4 || y < r + 4) continue;
      const room = Math.min(60, ...placed.map((q) => Math.hypot(q.x - x, q.y - y) - (q.r + r) * 0.6));
      const score = room - Math.abs(d - reach) * 0.1;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (best) placed.push({ ...stem, ...best, r });
  }
  return placed;
}

const VASES = {
  jug: 'M-24 0Q-19 8 -17 16C-46 34 -46 82 -25 96L25 96C46 82 46 34 17 16Q19 8 24 0Z',
  urn: 'M-30 0C-28 14 -40 34 -38 60C-36 84 -22 96 0 96C22 96 36 84 38 60C40 34 28 14 30 0Z',
  jar: 'M-30 -2L-30 88Q-30 96 -22 96L22 96Q30 96 30 88L30 -2Z',
};
const GLAZES = [['#a9bcd6', '#5f7aa3'], ['#c4d9c6', '#7fa58c'], ['#e5a882', '#b5603b'], ['#efe5cf', '#bfae8a']];

function vase(p, svg) {
  const [x, y] = NECK;
  node('ellipse', { cx: x + 10, cy: y + 116, rx: 58, ry: 7, fill: '#6b6050', opacity: 0.25, filter: 'url(#wc-bleed)' }, svg);
  const g = node('g', { transform: `translate(${x} ${y}) scale(1.2)`, filter: 'url(#wc-leaf)' }, svg);
  const kind = p.pick(Object.keys(VASES));
  if (kind === 'jar') {
    // Glass: the stems show through, and the water is a shade deeper.
    node('path', { d: VASES.jar, fill: '#cfe0e3', 'fill-opacity': 0.3, stroke: '#9ab3b8', 'stroke-width': 0.8 }, g);
    node('path', { d: 'M-30 34Q0 38 30 34L30 88Q30 96 22 96L-22 96Q-30 96 -30 88Z', fill: '#a9c8cf', 'fill-opacity': 0.25 }, g);
    node('ellipse', { cx: 0, cy: -2, rx: 30, ry: 3.5, fill: 'none', stroke: '#9ab3b8', 'stroke-width': 0.8 }, g);
  } else {
    const glaze = p.pick(GLAZES);
    node('path', { d: VASES[kind], fill: p.linear(glaze), 'fill-opacity': 0.88 }, g);
    node('ellipse', { cx: 0, cy: 0, rx: kind === 'jug' ? 24 : 30, ry: 3.5, fill: glaze[1], 'fill-opacity': 0.7 }, g);
  }
  // A highlight left unpainted down the lit side.
  node('path', { d: 'M-24 36Q-30 58 -20 82', fill: 'none', stroke: '#fffaf0', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.45 }, g);
}

function arrange(svg, kinds, seed) {
  const p = painter(svg, mulberry32(seed));
  const placed = place(p, gather(p, kinds));
  const bleeds = p.layer(svg), greens = p.layer(svg, 'leaf'), back = p.layer(svg);

  for (const q of placed) {
    const dx = q.x - NECK[0];
    const path = [
      [NECK[0] + Math.max(-14, Math.min(14, dx * 0.08)), NECK[1] + 70],
      [NECK[0] + dx * 0.12, NECK[1] - 10],
      [q.x - dx * 0.3, q.y + (NECK[1] - q.y) * 0.5],
      [q.x, q.y],
    ];
    p.curve(greens, path, q.fl.filler ? 1.1 : 1.6, q.fl.stem);
    if (q.fl.leaf) {
      for (let i = 0, n = 2 + Math.floor(p.rand() * 2); i < n; i++) {
        const t = p.between(0.35, 0.85), [lx, ly] = bez(path, t);
        q.fl.leaf(p, greens, lx, ly, heading(path, t) + (i % 2 ? 1 : -1) * p.between(0.5, 1), q.s);
      }
    }
    q.dir = heading(path, 1);
    if (!q.fl.filler) p.bleed(bleeds, q.x, q.y, q.r * 1.1, q.v.tint);
  }
  for (const q of placed.filter((q) => q.fl.filler)) q.fl.paint(p, p.layer(back, q.fl.fuzz ? 'fuzz' : 'petal'), q.x, q.y, q.s, q.v, q.dir);

  vase(p, svg);
  // A leaf or two spilling over the rim.
  const drape = p.layer(svg, 'leaf');
  for (const side of [-1, 1]) {
    if (p.rand() < 0.6) p.leaf(drape, NECK[0] + side * 20, NECK[1] + 1, side < 0 ? Math.PI - 0.45 : 0.45, 28, 9, DARK_GREEN, 'oval', '#cfe2ad');
  }

  // Heads from the back (highest) to the front, each its own wash.
  for (const q of placed.filter((q) => !q.fl.filler).sort((a, b) => a.y - b.y)) q.fl.paint(p, p.layer(svg, 'petal'), q.x, q.y, q.s, q.v, q.dir);
  return placed;
}

// "purple hibiscus, red and yellow marigolds and lavender"
const and = new Intl.ListFormat('en-GB', { type: 'conjunction' });
function describe(placed) {
  const colours = new Map();
  for (const q of placed) {
    const set = colours.get(q.kind) ?? new Set();
    if (q.v.colour) set.add(q.v.colour);
    colours.set(q.kind, set);
  }
  return and.format([...colours].map(([kind, set]) => (set.size ? `${and.format([...set])} ` : '') + FLOWERS[kind].plural));
}

function rearrange(box, seed) {
  const kinds = [...box.querySelectorAll('[data-flower]')].map((li) => li.dataset.flower);
  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  const placed = arrange(svg, kinds, seed);
  box.querySelector('.bouquet').replaceChildren(svg);
  box.querySelector('.bouquet-says').textContent = `In the vase: ${describe(placed)}.`;
}

export function paintFlowers(box) {
  if (box.hasAttribute('data-painted')) return;
  box.setAttribute('data-painted', '');
  // The filters live in the section, so htmx's history snapshot keeps them with the painting.
  const shared = node('svg', { class: 'flower-filters', width: 0, height: 0, 'aria-hidden': 'true' });
  shared.innerHTML = FILTERS;
  box.prepend(shared);
  // A new arrangement each day; the button (or a click on the painting) makes another.
  rearrange(box, today());
  box.querySelector('.bouquet-shuffle').hidden = false;
}

// Delegated, so an arrangement restored from htmx's history still responds.
document.addEventListener('click', (e) => {
  const box = e.target.closest('.flowers[data-painted]');
  if (box && e.target.closest('.bouquet-shuffle, .bouquet svg')) rearrange(box, (Math.random() * 2 ** 32) >>> 0);
});
