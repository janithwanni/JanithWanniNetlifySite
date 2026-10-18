// The scrollytelling figure for "Where the explainers point": a sticky view of the data
// space that redraws as each [data-step] scrolls into the middle of the screen.
//
// Data (public/data/explainers.json) is exported from the paper's saved results by
// scripts/export-explainers.R. Everything in data coordinates lives in one <g> whose
// transform does the zooming, so a zoom costs one attribute per frame; strokes and dots
// use non-scaling strokes so they keep their on-screen size.
import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';

const FULL = [-1.005, 1.005]; // the 201 x 201 prediction grid, cell edges included
const CELL = 0.01;
const POINTS = [1, 2, 3, 4];
const LAYERS = ['shap', 'lime', 'cf', 'anchor'];
const NAMES = { shap: 'SHAP', lime: 'LIME', cf: 'Counterfactual', anchor: 'Anchors' };

// The true rule (see the post): class A is this polygon, class B the rest of the square.
const TRUTH_A = [[-1, -1], [-1, -0.3], [-0.5, -0.3], [0.4, 0.42], [0.4, 1], [1, 1], [1, -0.2], [0, -1]];
const TRUTH_LINES = [[[-1, -0.3], [-0.5, -0.3], [0.4, 0.42], [0.4, 1]], [[0, -1], [1, -0.2]]];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const darkScheme = matchMedia('(prefers-color-scheme: dark)');

const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const pathOf = (pts) => `M${pts.map(([x, y]) => `${x},${y}`).join('L')}`;
// A dot per point as a zero-length segment with a round cap: one path for many dots.
const dots = (pts) => pts.map(([x, y]) => `M${x},${y}h0`).join('');

// Views ---------------------------------------------------------------------------
const squareView = (cx, cy, half) => {
  const fit = (c) => Math.min(Math.max(c, FULL[0] + half), FULL[1] - half);
  return { x: [fit(cx) - half, fit(cx) + half], y: [fit(cy) - half, fit(cy) + half] };
};
const FULL_VIEW = { x: FULL, y: FULL };
const REGION_VIEW = squareView(0.3, 0.08, 0.72); // all four points, a little closer
const zoomView = (p) => squareView(
  (p.bounds.x[0] + p.bounds.x[1]) / 2, (p.bounds.y[0] + p.bounds.y[1]) / 2, 0.16);

// Each step names a view and the layers to show; numbers pick points.
const STEPS = {
  data: { view: 'full', truth: true, data: true },
  model: { view: 'full', model: true, truthLine: true, data: true },
  points: { view: 'full', model: true, truthLine: true, pois: POINTS },
  usual: { view: 1, model: true, pois: [1] },
  parts: { view: 1, model: true, pois: [1], nbhd: [1], perturb: [1] },
  shap: { view: 'region', model: true, pois: POINTS, shap: POINTS },
  lime: { view: 1, model: true, pois: [1], nbhd: [1], perturb: [1], glm: true, lime: [1] },
  lime3: { view: 3, model: true, pois: [3], nbhd: [3], perturb: [3], glm: true, lime: [3] },
  cf: { view: 'region', model: true, pois: POINTS, cf: POINTS },
  anchors: { view: 'region', model: true, pois: POINTS, nbhd: POINTS, anchor: POINTS },
  anchors4: { view: 4, model: true, pois: [4], nbhd: [4], anchor: [4] },
  disagree: { view: 1, model: true, pois: [1], nbhd: [1], shap: [1], lime: [1], cf: [1], anchor: [1] },
};

function exploreStep({ point, layers, truth }) {
  const pts = point === 'all' ? POINTS : [point];
  const step = { view: point === 'all' ? 'region' : point, model: true, truthLine: truth, pois: pts };
  for (const l of LAYERS) if (layers.has(l)) step[l] = pts;
  if (point !== 'all' && layers.has('lime')) Object.assign(step, { perturb: pts, glm: true });
  if (layers.has('lime') || layers.has('anchor')) step.nbhd = pts;
  return step;
}

// Drawing -------------------------------------------------------------------------
export default async function scrolly(root) {
  const figure = root.querySelector('.scrolly-figure');
  const stage = figure.querySelector('.stage');
  const live = figure.querySelector('[aria-live]');
  const steps = [...root.querySelectorAll('[data-step]')];

  let data;
  try {
    const res = await fetch(root.dataset.scrolly);
    if (!res.ok) throw new Error(`explainers ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error('scrolly:', err);
    stage.querySelector('.stage-note').textContent = 'The figure could not be loaded. The text tells the whole story without it.';
    return;
  }
  const byLabel = new Map(data.points.map((p) => [p.label, p]));
  const viewFor = (v) => (v === 'full' ? FULL_VIEW : v === 'region' ? REGION_VIEW : zoomView(byLabel.get(v)));

  const canvas = document.createElement('canvas');
  canvas.className = 'surface';
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  stage.replaceChildren(canvas, svgEl);
  stage.classList.add('ready');

  const svg = select(svgEl).attr('viewBox', '0 0 100 100').attr('aria-hidden', 'true');
  const sx = scaleLinear().range([0, 100]);
  const sy = scaleLinear().range([100, 0]);
  const world = svg.append('g'); // data coordinates
  const screen = svg.append('g'); // viewBox coordinates, repositioned every frame
  const layer = (parent, name, point) => parent.append('g').attr('class', 'layer').attr('data-layer', name).attr('data-point', point ?? null);
  const placers = []; // re-position the viewBox-space marks for the current view

  // Truth and data, in data coordinates.
  const truth = layer(world, 'truth');
  truth.append('rect').attr('class', 'fill-b').attr('x', -1).attr('y', -1).attr('width', 2).attr('height', 2);
  truth.append('path').attr('class', 'fill-a').attr('d', `${pathOf(TRUTH_A)}Z`);
  const truthLine = layer(world, 'truthLine');
  for (const line of TRUTH_LINES) truthLine.append('path').attr('class', 'truth-line').attr('d', pathOf(line));

  const { x: dx, y: dy, cls } = data.data;
  const dataG = layer(world, 'data');
  for (const c of ['A', 'B']) {
    dataG.append('path').attr('class', `dots dot-${c.toLowerCase()}`)
      .attr('d', dots(dx.flatMap((x, i) => (cls[i] === c ? [[x, dy[i]]] : []))));
  }

  for (const p of data.points) {
    const { bounds: b, anchor: a, lime } = p;
    layer(world, 'nbhd', p.label).append('rect').attr('class', 'nbhd')
      .attr('x', b.x[0]).attr('y', b.y[0]).attr('width', b.x[1] - b.x[0]).attr('height', b.y[1] - b.y[0]);

    // Perturbations: squares for the forest's predictions, dots for LIME's local model.
    const perturb = layer(world, 'perturb', p.label);
    const half = CELL * 0.42;
    for (const c of ['A', 'B']) {
      perturb.append('path').attr('class', `cells cell-${c.toLowerCase()}`).attr('d', lime.pts
        .filter((_, i) => lime.bb[i] === c)
        .map(([x, y]) => `M${x - half},${y - half}h${2 * half}v${2 * half}h${-2 * half}Z`).join(''));
    }
    const glm = perturb.append('g').attr('class', 'glm');
    for (const c of ['A', 'B']) {
      glm.append('path').attr('class', `dots small dot-${c.toLowerCase()}`)
        .attr('d', dots(lime.pts.filter((_, i) => lime.glm[i] === c)));
    }

    layer(world, 'anchor', p.label).append('rect').attr('class', 'anchor')
      .attr('x', a.x[0]).attr('y', a.y[0]).attr('width', a.x[1] - a.x[0]).attr('height', a.y[1] - a.y[0]);

    // LIME's boundary: where the local logistic model for class B crosses 0.5, clipped
    // to the neighbourhood box.
    const [b0, bx, by] = lime.coef;
    const ends = by === 0
      ? [[-b0 / bx, b.y[0]], [-b0 / bx, b.y[1]]]
      : b.x.map((x) => [x, -(b0 + bx * x) / by]);
    const limeG = layer(world, 'lime', p.label);
    limeG.append('path').attr('class', 'lime-line').attr('d', pathOf(clip(ends, b)));
    const limeArrow = layer(screen, 'lime', p.label).append('path').attr('class', 'arrow lime-arrow');
    // At right angles to the line, towards the other class.
    const norm = Math.hypot(bx, by);
    const sign = p.pred === 'A' ? 1 : -1;
    const dir = [(sign * bx) / norm, (sign * by) / norm];
    placers.push(() => {
      const len = 0.09;
      limeArrow.attr('d', arrow(p.x, p.y, p.x + dir[0] * len, p.y + dir[1] * len));
    });

    layer(world, 'cf', p.label).append('path').attr('class', 'cf-line').attr('d', pathOf([[p.x, p.y], [p.cf.x, p.cf.y]]));
    const cfMark = layer(screen, 'cf', p.label).append('circle').attr('class', `cf-mark mark-${p.cf.pred.toLowerCase()}`).attr('r', 1.4);
    placers.push(() => cfMark.attr('cx', sx(p.cf.x)).attr('cy', sy(p.cf.y)));

    // SHAP: one arrow per feature, along its axis, coloured by the class it favours
    // (SHAP values here are contributions to the probability of class A).
    const shapG = layer(screen, 'shap', p.label);
    const shapArrows = ['x', 'y'].map((f) => shapG.append('path')
      .attr('class', `arrow shap-${p.shap[f] >= 0 ? 'a' : 'b'}`));
    placers.push((view) => {
      const k = view.k ?? 0.5;
      shapArrows[0].attr('d', arrow(p.x, p.y, p.x + p.shap.x * k, p.y));
      shapArrows[1].attr('d', arrow(p.x, p.y, p.x, p.y + p.shap.y * k));
    });

    const poi = layer(screen, 'pois', p.label).attr('class', 'layer poi');
    const ring = poi.append('circle').attr('r', 2.3).attr('class', `mark-${p.pred.toLowerCase()}`);
    const num = poi.append('text').text(p.label);
    placers.push(() => {
      ring.attr('cx', sx(p.x)).attr('cy', sy(p.y));
      num.attr('x', sx(p.x)).attr('y', sy(p.y));
    });
  }

  // An arrow from (x0, y0) to (x1, y1) in data coordinates, drawn in viewBox units so its
  // head keeps its size at every zoom.
  function arrow(x0, y0, x1, y1) {
    const [a, b, c, d] = [sx(x0), sy(y0), sx(x1), sy(y1)];
    const len = Math.hypot(c - a, d - b);
    if (len < 0.3) return '';
    const ux = (c - a) / len, uy = (d - b) / len, h = Math.min(2.2, len);
    const bx = c - ux * h, by = d - uy * h;
    return `M${a},${b}L${bx},${by}M${c},${d}L${bx - uy * h * 0.5},${by + ux * h * 0.5}L${bx + uy * h * 0.5},${by - ux * h * 0.5}Z`;
  }

  // The forest's predictions as a 201 x 201 image, one pixel per grid cell.
  let surface;
  function paintSurface() {
    const css = getComputedStyle(root);
    const rgb = (name) => {
      const v = css.getPropertyValue(name).trim().replace('#', '');
      return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
    };
    const colours = { A: rgb('--surface-a'), B: rgb('--surface-b') };
    const n = data.surface.length;
    surface = new OffscreenCanvasOr(n, n);
    const ctx = surface.getContext('2d');
    const img = ctx.createImageData(n, n);
    data.surface.forEach((row, r) => {
      for (let c = 0; c < n; c++) {
        const i = ((n - 1 - r) * n + c) * 4; // row 0 is y = -1, the bottom
        const [R, G, B] = colours[row[c]];
        img.data.set([R, G, B, 255], i);
      }
    });
    ctx.putImageData(img, 0, 0);
  }

  function drawSurface() {
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    const [x0, x1] = view.x, [y0, y1] = view.y;
    ctx.drawImage(surface, (x0 - FULL[0]) / CELL, (FULL[1] - y1) / CELL, (x1 - x0) / CELL, (y1 - y0) / CELL, 0, 0, width, height);
  }

  function resize() {
    const size = stage.getBoundingClientRect().width;
    const px = Math.round(size * Math.min(devicePixelRatio || 1, 2));
    if (px && canvas.width !== px) {
      canvas.width = canvas.height = px;
      drawSurface();
    }
  }

  let view = { ...FULL_VIEW, k: 0.5 };
  function draw() {
    sx.domain(view.x);
    sy.domain(view.y);
    const a = 100 / (view.x[1] - view.x[0]), d = -100 / (view.y[1] - view.y[0]);
    world.attr('transform', `matrix(${a},0,0,${d},${-view.x[0] * a},${-view.y[1] * d})`);
    for (const place of placers) place(view);
    drawSurface();
  }

  let frame;
  function goTo(target) {
    cancelAnimationFrame(frame);
    const from = view;
    if (reduceMotion.matches) {
      view = target;
      draw();
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = ease(Math.min(1, (now - start) / 800));
      view = {
        x: [lerp(from.x[0], target.x[0], t), lerp(from.x[1], target.x[1], t)],
        y: [lerp(from.y[0], target.y[0], t), lerp(from.y[1], target.y[1], t)],
        k: lerp(from.k, target.k, t),
      };
      draw();
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  // SHAP arrows are scaled so the longest one in view is a fixed share of the view.
  const shapScale = (v, shown) => {
    const max = Math.max(...shown.flatMap((l) => [byLabel.get(l).shap.x, byLabel.get(l).shap.y].map(Math.abs)));
    return (0.3 * (v.x[1] - v.x[0])) / max;
  };

  function show(step) {
    for (const g of svgEl.querySelectorAll('.layer')) {
      const want = step[g.dataset.layer];
      const on = g.dataset.point ? Array.isArray(want) && want.includes(Number(g.dataset.point)) : !!want;
      g.classList.toggle('on', on);
    }
    for (const g of svgEl.querySelectorAll('.glm')) g.classList.toggle('on', !!step.glm);
    canvas.classList.toggle('on', !!step.model);
    const target = viewFor(step.view);
    goTo({ ...target, k: shapScale(target, step.shap?.length ? step.shap : POINTS) });
  }

  // Explore controls ------------------------------------------------------------------
  const explore = { point: 1, layers: new Set(LAYERS), truth: false };
  const controls = root.querySelector('.explore-controls');
  if (controls) {
    const pointBtns = [...POINTS, 'all'].map((p) => {
      const btn = Object.assign(document.createElement('button'), {
        type: 'button', textContent: p === 'all' ? 'All' : `Point ${p}`,
      });
      btn.addEventListener('click', () => { explore.point = p; update(); });
      return [p, btn];
    });
    const check = (label, on, onChange) => {
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: on });
      box.addEventListener('change', () => { onChange(box.checked); update(); });
      const wrap = document.createElement('label');
      wrap.append(box, ` ${label}`);
      return wrap;
    };
    const pointsGroup = Object.assign(document.createElement('div'), { className: 'seg' });
    pointsGroup.setAttribute('role', 'group');
    pointsGroup.setAttribute('aria-label', 'Point');
    pointsGroup.append(...pointBtns.map(([, b]) => b));
    const layersGroup = Object.assign(document.createElement('fieldset'), { className: 'checks' });
    layersGroup.append(
      Object.assign(document.createElement('legend'), { className: 'vh', textContent: 'Explanations to draw' }),
      ...LAYERS.map((l) => check(NAMES[l], true, (on) => (on ? explore.layers.add(l) : explore.layers.delete(l)))),
      check('True boundary', false, (on) => { explore.truth = on; }),
    );
    controls.replaceChildren(pointsGroup, layersGroup);

    function update() {
      for (const [p, b] of pointBtns) b.setAttribute('aria-pressed', String(p === explore.point));
      const which = explore.point === 'all' ? 'all four points' : `point ${explore.point}`;
      const drawn = [...explore.layers].map((l) => NAMES[l]).join(', ') || 'no explanations';
      live.textContent = `Showing ${which} with ${drawn}.`;
      if (active === 'explore') show(exploreStep(explore));
    }
    for (const [p, b] of pointBtns) b.setAttribute('aria-pressed', String(p === explore.point));
  }

  // Scrolling -------------------------------------------------------------------------
  let active;
  function activate(el) {
    const name = el.dataset.step;
    if (name === active) return;
    active = name;
    for (const s of steps) s.classList.toggle('active', s === el);
    show(name === 'explore' ? exploreStep(explore) : STEPS[name]);
    live.textContent = el.dataset.alt ?? '';
  }

  // A step takes over as it crosses the middle of the screen, or on narrow screens the
  // middle of the space left under the figure.
  const band = matchMedia('(min-width: 62rem)').matches ? '-45% 0px -45% 0px' : '-68% 0px -27% 0px';
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) activate(e.target);
  }, { rootMargin: band });
  for (const s of steps) observer.observe(s);
  const resizer = new ResizeObserver(resize);
  resizer.observe(stage);
  const repaint = () => { paintSurface(); drawSurface(); };
  darkScheme.addEventListener('change', repaint);

  // Stop listening once htmx swaps the page out.
  const gone = new MutationObserver(() => {
    if (root.isConnected) return;
    for (const o of [observer, resizer, gone]) o.disconnect();
    darkScheme.removeEventListener('change', repaint);
    cancelAnimationFrame(frame);
  });
  gone.observe(document.getElementById('main'), { childList: true });

  paintSurface();
  resize();
  activate(steps[0]);
  draw();
}

// OffscreenCanvas where there is one (an ordinary canvas otherwise).
function OffscreenCanvasOr(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  return Object.assign(document.createElement('canvas'), { width: w, height: h });
}

// Clip a line through two points to a box (Liang-Barsky), so LIME's line stays in its
// neighbourhood.
function clip([[x0, y0], [x1, y1]], box) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - box.x[0]], [dx, box.x[1] - x0], [-dy, y0 - box.y[0]], [dy, box.y[1] - y0]]) {
    if (p === 0) { if (q < 0) return [[x0, y0], [x0, y0]]; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
  }
  if (t0 > t1) return [[x0, y0], [x0, y0]];
  return [[x0 + t0 * dx, y0 + t0 * dy], [x0 + t1 * dx, y0 + t1 * dy]];
}
