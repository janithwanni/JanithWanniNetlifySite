// Builds src/sky/data.json, the star catalogue for the homepage sky (src/sky/), from
// Olaf Frohn's d3-celestial data (BSD-3-Clause; stars from Hipparcos and the Yale Bright
// Star Catalogue, Milky Way outlines from Mellinger). Run once with `npm run sky`; the
// output is committed, so builds never fetch.
//
// It also builds public/img/sky/: Johan Meuris's constellation figures from Stellarium
// (Free Art License 1.3), turned into small white-on-transparent WebPs, with the three
// stars each one is pinned to. That step needs ImageMagick (`magick`).
//
// Everything is J2000 RA/Dec in degrees, rounded and flattened to keep the file small.

import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const BASE = 'https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/';
const STELLARIUM = 'https://raw.githubusercontent.com/Stellarium/stellarium/aaf27aab7590ff1b323727ce4ef68af5321c6d2f/skycultures/modern/';
const ART_PX = 256;    // figures are drawn small and faint; this is plenty
const MAX_MAG = 5;     // about what a Melbourne suburb shows on a clear night
const MAX_DEC = 53;    // further north never rises at latitude -37.8
const NAMED_MAG = 2.6; // stars bright enough to be worth a name on hover

const get = async (file) => {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return res.json();
};

const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
const ra360 = (ra) => (ra + 360) % 360;

// Angular distance in degrees, for thinning outlines.
function sep([a1, d1], [a2, d2]) {
  const rad = Math.PI / 180;
  const c = Math.sin(d1 * rad) * Math.sin(d2 * rad) + Math.cos(d1 * rad) * Math.cos(d2 * rad) * Math.cos((a1 - a2) * rad);
  return Math.acos(Math.min(1, Math.max(-1, c))) / rad;
}

// stars.8 rather than stars.6: a few of the figures are pinned to stars fainter than 6.
const [stars, names, lines, cons, mw] = await Promise.all(
  ['stars.8.json', 'starnames.json', 'constellations.lines.json', 'constellations.json', 'mw.json'].map(get));

// Stars as [ra, dec, mag, colour] runs; colour is a B-V bucket (0 blue-white … 3 orange).
const out = { stars: [], names: {}, lines: {}, cons: {}, mw: [], art: {} };
const kept = stars.features
  .filter((f) => f.properties.mag <= MAX_MAG && f.geometry.coordinates[1] <= MAX_DEC)
  .sort((a, b) => a.properties.mag - b.properties.mag);
for (const f of kept) {
  const [ra, dec] = f.geometry.coordinates;
  const bv = parseFloat(f.properties.bv);
  const tint = Number.isNaN(bv) ? 1 : bv < 0 ? 0 : bv < 0.5 ? 1 : bv < 1.1 ? 2 : 3;
  const i = out.stars.length / 4;
  out.stars.push(r2(ra360(ra)), r2(dec), r2(f.properties.mag), tint);
  const name = names[f.id]?.name;
  if (name && f.properties.mag <= NAMED_MAG) out.names[i] = name;
}

for (const f of lines.features) {
  out.lines[f.id] = f.geometry.coordinates.map((line) => line.flatMap(([ra, dec]) => [r2(ra360(ra)), r2(dec)]));
}

// Constellation names and label positions, only for those that ever rise.
for (const f of cons.features) {
  const [ra, dec] = f.geometry.coordinates;
  if (dec <= MAX_DEC + 10) out.cons[f.id] = [f.properties.name, r1(ra360(ra)), r1(dec)];
}

// The Milky Way: its three fainter contour levels as rings of points at least 1.5° apart.
for (const f of mw.features.filter((f) => ['ol1', 'ol2', 'ol3'].includes(f.id))) {
  const rings = [];
  for (const polygon of f.geometry.coordinates) {
    for (const ring of polygon) {
      const thin = [ring[0]];
      for (const p of ring) if (sep(p, thin.at(-1)) >= 1.5) thin.push(p);
      if (thin.length >= 4) rings.push(thin.flatMap(([ra, dec]) => [r1(ra360(ra)), r1(dec)]));
    }
  }
  out.mw.push(rings);
}

// Constellation art: each image with three anchors, [x, y, ra, dec], x and y as fractions
// of the image, so the page can stretch it over the stars it belongs to.
const hip = new Map(stars.features.map((f) => [f.id, f.geometry.coordinates]));
const art = await (await fetch(`${STELLARIUM}index.json`)).json();
const imgDir = new URL('../public/img/sky/', import.meta.url);
await mkdir(imgDir, { recursive: true });
let bytes = 0;
for (const c of art.constellations) {
  const id = c.id.split(' ').at(-1);
  if (!c.image || !out.cons[id]) continue;
  const { file, size: [w, h], anchors } = c.image;
  if (anchors.some((a) => !hip.has(a.hip))) { console.warn(`${id}: anchor star missing, skipped`); continue; }
  const name = file.split('/').at(-1).replace(/\.png$/, '');
  const png = Buffer.from(await (await fetch(STELLARIUM + file)).arrayBuffer());
  // Grey on black (made to be added to a planetarium dome) to white with that brightness
  // as its opacity, so it can be inked or lit by CSS.
  const webp = execFileSync('magick', ['png:-', '-resize', `${ART_PX}x${ART_PX}>`, '-colorspace', 'gray', '-alpha', 'copy',
    '-fill', 'white', '-colorize', '100', '-quality', '60', '-define', 'webp:alpha-quality=60', 'webp:-'], { input: png });
  await writeFile(new URL(`${name}.webp`, imgDir), webp);
  bytes += webp.length;
  out.art[id] = [name, ...anchors.flatMap(({ pos: [x, y], hip: n }) => {
    const [ra, dec] = hip.get(n);
    return [Math.round((x / w) * 1000) / 1000, Math.round((y / h) * 1000) / 1000, r2(ra360(ra)), r2(dec)];
  })];
}

await mkdir(new URL('../src/sky/', import.meta.url), { recursive: true });
const json = JSON.stringify(out);
await writeFile(new URL('../src/sky/data.json', import.meta.url), json);
console.log(`src/sky/data.json: ${kept.length} stars, ${Object.keys(out.names).length} names, ` +
  `${Object.keys(out.lines).length} figures, ${(json.length / 1024).toFixed(1)} KB`);
console.log(`public/img/sky: ${Object.keys(out.art).length} figures, ${(bytes / 1024).toFixed(0)} KB in all`);
