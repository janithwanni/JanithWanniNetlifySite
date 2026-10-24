// The homepage sky: what I can see from Melbourne at 9 pm tonight, drawn above the garden
// as a panorama of the whole horizon. Azimuth runs left to right (N, E, S, W, N, as if
// turning on the spot) and altitude from the horizon up to 72°. The view opens facing
// south, and can be dragged or scrolled all the way round.
//
// The panorama is drawn three times side by side, so scrolling can wrap forever. (Not
// with <use>: page styles don't reach reliably into its copies.) Like the garden, it all
// lives in the DOM and the listeners are delegated, so htmx's history snapshot restores
// a working sky.

import { melbourneNine, skyAt, phaseName, compass, norm } from './astro.js';
import data from './data.json';

const U = 5;              // SVG units per degree
const TOP = 72;           // highest altitude shown
const W = 360 * U, H = TOP * U;
const x = (az) => az * U;
const y = (alt) => (TOP - alt) * U;
const f = (n) => Math.round(n * 10) / 10;

// Better known by another name, for the hover labels and the note.
const ALIAS = { Cru: 'the Southern Cross', Ori: 'Orion (the Saucepan)', Sgr: 'Sagittarius (the Teapot)' };
// Constellations worth a mention in the note, in order of how well people know them.
const FAMOUS = ['Cru', 'Ori', 'Sco', 'Sgr', 'Cen', 'Leo', 'CMa', 'Tau', 'Gem', 'Peg', 'Aql', 'Cyg', 'Lyr', 'Gru', 'Car', 'Vir'];
const CLOUDS = [['Large Magellanic Cloud', 80.89, -69.76, 4.2], ['Small Magellanic Cloud', 13.19, -72.83, 2.4]];

// The Greek stories behind the figures, told under the sky when one is hovered.
const MYTHS = {
  Ori: 'Orion, the hunter who boasted he could kill every beast on Earth, until Gaia sent a scorpion.',
  Sco: 'The scorpion that killed Orion. Zeus set them on opposite sides of the sky, so they never meet.',
  Per: 'Perseus, holding the head of Medusa, on his way home to save Andromeda.',
  And: 'Andromeda, chained to a rock as an offering to the sea monster, waiting for Perseus.',
  Cet: 'Cetus, the sea monster Poseidon sent for Andromeda, turned to stone by Medusa’s gaze.',
  Cas: 'Queen Cassiopeia, who said her daughter was lovelier than the Nereids, and was punished for it.',
  Cep: 'King Cepheus, who chained his own daughter Andromeda to the rocks to save his kingdom.',
  Peg: 'Pegasus, the winged horse, who sprang from Medusa’s neck when Perseus cut off her head.',
  Cen: 'Chiron, the wisest of the centaurs, teacher of Achilles, Jason and Asclepius.',
  Sgr: 'An archer centaur, his arrow aimed at the heart of the Scorpion, in case it chases Orion again.',
  Lyr: 'The lyre of Orpheus, whose music almost brought Eurydice back from the underworld.',
  Cyg: 'Zeus as a swan, come to court Leda of Sparta.',
  Aql: 'The eagle that carried Zeus’s thunderbolts, and carried Ganymede up to Olympus.',
  Aqr: 'Ganymede, the Trojan boy who became cupbearer to the gods.',
  Leo: 'The Nemean lion, whose hide no weapon could pierce. Heracles strangled it: his first labour.',
  Hya: 'The Lernaean Hydra: cut off one head and two grow back. Heracles’ second labour.',
  Cnc: 'The crab Hera sent to nip at Heracles’ heels while he fought the Hydra. He stepped on it.',
  Her: 'Heracles, kneeling, upside down from Melbourne, resting after his twelve labours.',
  Gem: 'Castor and Pollux, twins with one mortal life between them, who chose to share it.',
  Tau: 'Zeus as a white bull, carrying Europa across the sea to Crete.',
  Ari: 'The ram with the golden fleece, which Jason and the Argonauts sailed to the end of the world for.',
  CrB: 'The crown Dionysus gave Ariadne, after Theseus left her on Naxos.',
  Crv: 'Apollo’s crow, sent to fetch water, who dawdled and lied, and was set in the sky without a drink.',
  Crt: 'Apollo’s cup, set forever just out of the crow’s reach.',
  Car: 'The keel of the Argo, the ship that carried Jason and the Argonauts.',
  Pup: 'The stern of the Argo, Jason’s ship.',
  Vel: 'The sails of the Argo, Jason’s ship.',
  CMa: 'Laelaps, the hound who always caught his quarry, chasing a fox that could never be caught.',
  Oph: 'Asclepius, the healer, who learnt to raise the dead. Zeus struck him down for it.',
  Ser: 'The serpent Asclepius holds, which taught him the herb that brings back the dead.',
  UMa: 'Callisto, turned into a bear by a jealous Hera, and set in the sky by Zeus.',
  Boo: 'Arcas, son of Callisto, who nearly hunted his own mother before Zeus lifted them both away.',
  Vir: 'Persephone, perhaps, or Astraea, the last of the gods to leave the Earth.',
  Lib: 'The scales of Astraea, goddess of justice.',
  Cap: 'Pan, who leapt into the Nile to flee Typhon and turned half into a fish.',
  Del: 'The dolphin who found the sea nymph Amphitrite for Poseidon.',
  Sge: 'The arrow Heracles shot at the eagle tormenting Prometheus.',
  Eri: 'The river Eridanus, where Phaethon fell after losing control of the Sun’s chariot.',
  Aur: 'The charioteer, holding the she-goat Amalthea, who nursed the infant Zeus.',
  Lep: 'The hare at Orion’s feet, which he never quite catches.',
  PsA: 'The great fish, said to have saved Aphrodite when she fell into a lake.',
  CrA: 'A crown, said to be the one Dionysus left for his mother Semele.',
};
// Pairs worth a word in the note when the sky lines up for them.
const PAIRS = [
  ['Ori', 'Sco', 'Orion is up, and the Scorpion that killed him is safely below the horizon.'],
  ['Sco', 'Ori', 'The Scorpion is up, and Orion is hiding below the horizon from it.'],
];

// One sky per page load: the night is the same whichever homepage element draws it.
// `current` is the resolved model, for the hover and scroll handlers.
let night, current = null;
const tonight = () => (night ??= Promise.resolve().then(() => (current = model(data))));

// Unwrap a run of azimuths so a line or outline crossing north stays continuous.
function unwrap(points) {
  for (let i = 1; i < points.length; i++) {
    const d = points[i][0] - points[i - 1][0];
    if (d > 180) points[i][0] -= 360 * Math.ceil((d - 180) / 360);
    else if (d < -180) points[i][0] += 360 * Math.ceil((-d - 180) / 360);
  }
  return points;
}

// The SVG matrix taking three points [u, v] to three points [X, Y] (Cramer's rule).
function affine(from, to) {
  const [[u1, v1], [u2, v2], [u3, v3]] = from;
  const det = u1 * (v2 - v3) - v1 * (u2 - u3) + (u2 * v3 - u3 * v2);
  const solve = ([p1, p2, p3]) => [
    (p1 * (v2 - v3) - v1 * (p2 - p3) + (p2 * v3 - p3 * v2)) / det,
    (u1 * (p2 - p3) - p1 * (u2 - u3) + (u2 * p3 - u3 * p2)) / det,
    (u1 * (v2 * p3 - v3 * p2) - v1 * (u2 * p3 - u3 * p2) + p1 * (u2 * v3 - u3 * v2)) / det,
  ];
  const [a, c, e] = solve(to.map((p) => p[0])), [b, d, g] = solve(to.map((p) => p[1]));
  return [a, b, c, d, e, g].map((n) => Math.round(n * 100) / 100).join(' ');
}

// Compute positions for everything once; drawing and hover both use this.
function model(data) {
  const when = melbourneNine();
  const sky = skyAt(when);
  // Twilight washes out faint stars (magnitude 5 in full dark, 2 just after sunset), and
  // the Milky Way and the figures fade with them.
  const dark = Math.max(0, Math.min(1, (-4 - sky.sun.alt) / 14));
  const limit = 2 + 3 * dark;

  const stars = [];
  for (let i = 0; i < data.stars.length; i += 4) {
    const [ra, dec, mag, tint] = data.stars.slice(i, i + 4);
    if (mag > limit) break; // sorted brightest first
    const [az, alt] = sky.project(ra, dec);
    if (alt > -1) stars.push({ az, alt, mag, tint, name: data.names[i / 4] });
  }

  const figures = [];
  for (const [id, lines] of Object.entries(data.lines)) {
    const runs = lines.map((flat) => {
      const pts = [];
      for (let i = 0; i < flat.length; i += 2) pts.push(sky.project(flat[i], flat[i + 1]));
      return unwrap(pts);
    });
    if (runs.some((r) => r.some(([, alt]) => alt > 0))) {
      const [name, ra, dec] = data.cons[id] ?? [id];
      figures.push({ id, name: ALIAS[id] ?? name, runs, centre: ra === undefined ? null : sky.project(ra, dec) });
    }
  }

  const mw = data.mw.map((rings) => rings.map((flat) => {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push(sky.project(flat[i], flat[i + 1]));
    pts.push([...pts[0]]);
    unwrap(pts);
    // The band's two edges each go all the way round the horizon (turn ±360°).
    return { pts, turn: Math.round((pts.at(-1)[0] - pts[0][0]) / 360) * 360 };
  }));

  const clouds = CLOUDS.map(([name, ra, dec, r]) => ({ name, r, pos: sky.project(ra, dec) }));
  const planets = sky.planets.filter((p) => p.alt > 0 && p.mag < limit + 1);
  // Each constellation's artwork, pinned to its three anchor stars by an affine map from
  // the image (as a unit square) onto the panorama.
  const art = {};
  for (const [id, [file, ...a]] of Object.entries(data.art)) {
    const uv = [0, 1, 2].map((k) => [a[k * 4], a[k * 4 + 1]]);
    const at = unwrap([0, 1, 2].map((k) => sky.project(a[k * 4 + 2], a[k * 4 + 3])));
    if (at.every(([, alt]) => alt < -10)) continue;
    art[id] = { file, matrix: affine(uv, at.map(([az, alt]) => [x(az), y(alt)])) };
  }

  return { when, sky, stars, figures, mw, clouds, planets, moon: sky.moon, dark, art };
}

// --- Drawing -------------------------------------------------------------------------

const ring = (pts) => `M${pts.map(([az, alt]) => `${f(x(az))} ${f(y(alt))}`).join('L')}Z`;

// The Milky Way is drawn once across all three copies of the panorama, since its band
// can't be cut into tiles cleanly. Each edge of the band is unrolled into one long curve
// spanning the whole strip and closed over the top; with both edges closed the same way,
// the even-odd fill leaves the band between them. Islands and holes repeat per copy.
function milkyWay(rings) {
  return rings.map(({ pts, turn }) => {
    if (!turn) return [-360, 0, 360, 720, 1080].map((k) => ring(pts.map(([az, alt]) => [az + k, alt]))).join('');
    const a0 = pts[0][0];
    const shift = turn < 0 ? 360 * Math.ceil((1180 - a0) / 360) : 360 * Math.floor((-100 - a0) / 360);
    const long = [];
    for (let k = 0; k < 6; k++) for (const [az, alt] of pts) long.push([az + shift + k * turn, alt]);
    return ring([...long, [long.at(-1)[0], 100], [long[0][0], 100]]);
  }).join('');
}

function polyline(run) {
  // Break a figure line where it swings across the zenith rather than draw it the long way.
  let d = '';
  run.forEach(([az, alt], i) => {
    const jump = i === 0 || Math.abs(az - run[i - 1][0]) > 60;
    d += `${jump ? 'M' : 'L'}${f(x(az))} ${f(y(alt))}`;
  });
  return d;
}

const starRadius = (mag) => Math.max(0.65, 2.7 - 0.42 * mag);

function moonShape({ az, alt, lit, limb }) {
  // Lit limb towards the Sun (+x), terminator as a half-ellipse, then turned to face it.
  const R = 7, rx = R * Math.abs(2 * lit - 1);
  const lit_d = `M0 ${-R}A${R} ${R} 0 0 1 0 ${R}A${f(rx)} ${R} 0 0 ${lit > 0.5 ? 1 : 0} 0 ${-R}Z`;
  return `<g class="moon" transform="translate(${f(x(az))} ${f(y(alt))}) rotate(${f(limb - 90)})">` +
    `<circle class="moon-dark" r="${R}"/><path class="moon-lit" d="${lit_d}"/></g>`;
}

function render(m) {
  const { sky } = m;
  const dusk = Math.max(0, Math.min(1, (sky.sun.alt + 18) / 18));
  let s = '';
  if (dusk > 0) {
    s += `<ellipse class="dusk" cx="${f(x(sky.sun.az))}" cy="${H}" rx="${70 * U}" ry="${30 * U}" opacity="${f(dusk * 0.9)}"/>`;
  }
  s += m.clouds.filter((c) => c.pos[1] > -c.r).map(({ pos: [az, alt], r }) =>
    `<ellipse class="cloud" cx="${f(x(az))}" cy="${f(y(alt))}" rx="${f((r * U) / Math.max(0.3, Math.cos((alt * Math.PI) / 180)))}" ry="${f(r * U)}"/>`).join('');
  s += '<g class="figs"></g>'; // constellation artwork, added on first hover
  s += m.figures.map((c) => `<path class="con" data-c="${c.id}" d="${c.runs.map(polyline).join('')}"/>`).join('');
  // Stars fade in a magnitude at a time, brightest first. Animating a few groups rather
  // than every star keeps the browser's start-up work small.
  const groups = [];
  m.stars.forEach(({ az, alt, mag, tint }, i) => {
    const k = Math.max(0, Math.min(6, Math.floor(mag + 1.5)));
    const tw = i < 24 && i % 3 === 0 ? ` tw" style="--tw:${3 + (i % 5)}s` : '';
    (groups[k] ??= []).push(`<circle class="star t${tint}${mag < 1.5 ? ' b' : ''}${tw}" cx="${f(x(az))}" cy="${f(y(alt))}" r="${f(starRadius(mag))}"/>`);
  });
  s += groups.map((g, k) => g && `<g class="stars" style="--d:${k * 160}ms">${g.join('')}</g>`).join('');
  s += m.planets.map(({ name, az, alt, mag }) =>
    `<circle class="planet" cx="${f(x(az))}" cy="${f(y(alt))}" r="${f(Math.max(1.6, starRadius(mag) + 0.4))}"/>` +
    `<text class="tag" x="${f(x(az) + 6)}" y="${f(y(alt) + 3)}">${name}</text>`).join('');
  if (m.moon.alt > -1) s += moonShape(m.moon);
  for (const [az, label] of [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']]) {
    s += `<text class="point${label.length > 1 ? ' minor' : ''}" x="${x(az)}" y="${H - 6}">${label}</text>`;
  }

  return {
    back: `<defs><radialGradient id="sky-dusk"><stop offset="0" class="dusk-0"/><stop offset="1" class="dusk-1"/></radialGradient></defs>` +
      m.mw.map((rings, i) => `<path class="mw mw${i}" fill-rule="evenodd" d="${milkyWay(rings)}"/>`).join(''),
    copy: (dx) => `<g transform="translate(${dx} 0)">${s}</g>`,
  };
}

// Let the browser breathe between steps, so no single task blocks it for long.
const pause = () => new Promise((resolve) => setTimeout(resolve));

// --- The note above the sky ------------------------------------------------------------

const height = (alt) => (alt > 75 ? 'overhead' : alt < 20 ? 'low in the' : alt > 50 ? 'high in the' : 'in the');
const where = (az, alt) => (alt > 75 ? 'overhead' : `${height(alt)} ${compass(az)}`);

function note(m) {
  const day = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long', day: 'numeric', month: 'long' }).format(m.when);
  const sights = [];
  const phase = phaseName(m.moon);
  if (m.moon.alt > 0) sights.push(`a ${/Moon/.test(phase) ? phase : `${phase} Moon`} ${where(m.moon.az, m.moon.alt)}`);
  for (const p of [...m.planets].sort((a, b) => a.mag - b.mag).slice(0, 3)) sights.push(`${p.name} ${where(p.az, p.alt)}`);
  const up = FAMOUS.map((id) => m.figures.find((c) => c.id === id)).filter((c) => c?.centre && c.centre[1] > 8);
  for (const c of up.slice(0, sights.length > 2 ? 1 : 2)) sights.push(`${c.name} ${where(...c.centre)}`);
  const list = sights.length > 1 ? `${sights.slice(0, -1).join(', ')} and ${sights.at(-1)}` : sights[0] ?? 'clear skies, I hope';
  const twilight = m.sky.sun.alt > -12 ? ' The last of the twilight hides the fainter stars.' : '';
  const alt = (id) => m.figures.find((c) => c.id === id)?.centre?.[1] ?? -90;
  const pair = PAIRS.find(([up, down]) => alt(up) > 8 && alt(down) < 0);
  return `The sky over Melbourne at 9 pm on ${day}: ${list}.${twilight}${pair ? ` ${pair[2]}` : ''}`;
}

// --- Hover labels ------------------------------------------------------------------------

// Things close to an SVG point (in one copy of the panorama), most specific first.
function nearest(m, px, py, reach = 1) {
  const near = (az, alt, r) => {
    const dx = ((((px - x(az)) % W) + W * 1.5) % W) - W / 2, dy = py - y(alt);
    return Math.hypot(dx, dy) <= r * reach ? Math.hypot(dx, dy) : Infinity;
  };
  let best = null, bestD = Infinity;
  const consider = (d, label, con) => { if (d < bestD) { bestD = d; best = { label, con }; } };
  if (m.moon.alt > -1) consider(near(m.moon.az, m.moon.alt, 14) - 6, `The Moon, ${phaseName(m.moon).replace(/ Moon$/, '')}, ${Math.round(m.moon.lit * 100)}% lit`);
  for (const p of m.planets) consider(near(p.az, p.alt, 14) - 4, p.name);
  for (const s of m.stars) if (s.name) consider(near(s.az, s.alt, 10) - 2, s.name);
  if (best) return best;
  for (const c of m.clouds) consider(near(...c.pos, c.r * U * 1.2), c.name);
  for (const c of m.figures) for (const run of c.runs) for (const [az, alt] of run) consider(near(az, alt, 22), c.name, c.id);
  return best;
}

function label(box, m, hit) {
  const tag = box.querySelector('.sky-label');
  for (const g of box.querySelectorAll('.con.on, .fig.on')) if (g.dataset.c !== hit?.con) g.classList.remove('on');
  if (hit?.con) {
    for (const g of box.querySelectorAll(`.con[data-c="${hit.con}"]`)) g.classList.add('on');
    showArt(box, m, hit.con);
  }
  tag.textContent = hit ? hit.label.replace(/^the /, 'The ') : '';
  const myth = box.querySelector('.sky-myth');
  if (myth) myth.textContent = MYTHS[hit?.con] ?? '';
}

// A constellation's figure is only fetched the first time someone hovers it (about 5 kB
// each), then kept, so coming back to it costs nothing.
function showArt(box, m, id) {
  const art = m.art[id];
  if (!art) return;
  for (const figs of box.querySelectorAll('.figs')) {
    let img = figs.querySelector(`[data-c="${id}"]`);
    if (!img) {
      figs.insertAdjacentHTML('beforeend', `<image class="fig" data-c="${id}" href="/img/sky/${art.file}.webp" ` +
        `width="1" height="1" preserveAspectRatio="none" transform="matrix(${art.matrix})"/>`);
      img = figs.lastElementChild;
    }
    requestAnimationFrame(() => img.classList.add('on'));
  }
}

function svgPoint(svg, cx, cy) {
  const p = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
  return [norm(((p.x - W) / U)) * U, p.y];
}

// --- Scrolling round -------------------------------------------------------------------

const scale = (win) => win.querySelector('.sky-dome').getBoundingClientRect().height / H;
function face(win, az) {
  win.scrollLeft = (W + norm(az) * U) * scale(win) - win.clientWidth / 2;
}
const facing = (win) => norm(((win.scrollLeft + win.clientWidth / 2) / scale(win) - W) / U);

export async function drawSky(root) {
  const box = root.querySelector('.sky');
  if (!box) return;
  const win = box.querySelector('.sky-window');
  // data-loaded survives htmx's history snapshot; the scroll position doesn't.
  if (box.hasAttribute('data-loaded')) {
    box.querySelector('.sky-label').textContent = '';
    const myth = box.querySelector('.sky-myth');
    if (myth) myth.textContent = '';
    for (const g of box.querySelectorAll('.con.on')) g.classList.remove('on');
    requestAnimationFrame(() => face(win, +(win.dataset.az ?? 180)));
    tonight();
    return;
  }
  box.setAttribute('data-loaded', '');
  try {
    const m = await tonight();
    await pause();
    // The middle copy first, which is the one in view; the copies either side, which
    // only matter once someone looks round, a moment later.
    const { back, copy } = render(m);
    const svg = box.querySelector('.sky-dome');
    svg.setAttribute('viewBox', `0 0 ${3 * W} ${H}`);
    svg.style.aspectRatio = `${3 * W} / ${H}`;
    svg.style.setProperty('--dark', m.dark.toFixed(2));
    svg.innerHTML = back + copy(W);
    const hint = Object.assign(document.createElement('span'), { className: 'sky-hint', textContent: 'Drag to look around. ' });
    const credit = Object.assign(document.createElement('a'), {
      href: 'https://github.com/Stellarium/stellarium/tree/master/skycultures/modern', textContent: 'Figures by Johan Meuris',
    });
    const licence = Object.assign(document.createElement('a'), { href: 'https://artlibre.org/licence/lal/en/', textContent: 'Free Art License' });
    hint.append(credit, ' (', licence, ').');
    box.querySelector('.sky-note').replaceChildren(note(m), ' ', hint);
    box.classList.add('lit');
    face(win, 180);
    await pause();
    svg.insertAdjacentHTML('beforeend', copy(0) + copy(2 * W));
  } catch (err) {
    console.error('sky:', err);
    box.removeAttribute('data-loaded');
  }
}

// Keep the view in the middle copy, so it never runs out of sky.
document.addEventListener('scroll', (e) => {
  const win = e.target;
  if (!(win instanceof Element) || !win.matches('.sky-window')) return;
  const period = win.scrollWidth / 3;
  if (win.scrollLeft < period * 0.5) win.scrollLeft += period;
  else if (win.scrollLeft > period * 1.5) win.scrollLeft -= period;
  win.dataset.az = Math.round(facing(win));
  // Looking round with the keyboard names whatever is in the middle of the view.
  if (current && win.matches(':focus-visible')) {
    const svg = win.querySelector('.sky-dome'), r = win.getBoundingClientRect();
    label(win.closest('.sky'), current, nearest(current, ...svgPoint(svg, r.left + r.width / 2, r.top + r.height * 0.6), 3));
  }
}, true);

// Drag to look round with a mouse; touch and trackpads scroll natively.
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const win = e.target.closest?.('.sky-window');
  if (!win || e.pointerType !== 'mouse' || e.button !== 0) return;
  drag = { win, x: e.clientX };
  win.classList.add('dragging');
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (drag) {
    drag.win.scrollLeft -= e.clientX - drag.x;
    drag.x = e.clientX;
    return;
  }
  const svg = e.target.closest?.('.sky-dome');
  if (svg && current) label(svg.closest('.sky'), current, nearest(current, ...svgPoint(svg, e.clientX, e.clientY)));
});
document.addEventListener('pointerup', () => {
  drag?.win.classList.remove('dragging');
  drag = null;
});
document.addEventListener('pointerout', (e) => {
  const svg = e.target.closest?.('.sky-dome');
  if (svg && !svg.contains(e.relatedTarget)) label(svg.closest('.sky'), current, null);
});
