// Just enough astronomy for the homepage sky: where things are over Melbourne at a given
// instant. Low-precision formulas throughout (about a degree for planets, a fraction of
// one for the Moon), which is far finer than the drawing can show.

export const MELBOURNE = { lat: -37.8136, lon: 144.9631 };

const RAD = Math.PI / 180;
const sin = (d) => Math.sin(d * RAD), cos = (d) => Math.cos(d * RAD);
const atan2 = (y, x) => Math.atan2(y, x) / RAD;
const asin = (x) => Math.asin(Math.max(-1, Math.min(1, x))) / RAD;
export const norm = (d) => ((d % 360) + 360) % 360;

// 9 pm on today's Melbourne date, whatever the reader's own timezone. AEST or AEDT comes
// from the offset Intl reports for that evening.
export function melbourneNine(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).split('-').map(Number);
  const wall = Date.UTC(ymd[0], ymd[1] - 1, ymd[2], 21);
  const offset = (t) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Melbourne', timeZoneName: 'longOffset' })
      .formatToParts(new Date(t)).find((p) => p.type === 'timeZoneName').value; // "GMT+11:00"
    const [, sign, h, m = '0'] = name.match(/GMT([+-])(\d+):?(\d+)?/) ?? [, '+', '10'];
    return (sign === '-' ? -1 : 1) * (+h * 60 + +m) * 60000;
  };
  return new Date(wall - offset(wall - offset(wall)));
}

const julian = (date) => date.getTime() / 86400000 + 2440587.5;

// Unit vectors and back, for precession.
const vec = (ra, dec) => [cos(dec) * cos(ra), cos(dec) * sin(ra), sin(dec)];
const radec = ([x, y, z]) => [norm(atan2(y, x)), asin(z / Math.hypot(x, y, z))];

// J2000 to the equinox of date (IAU 1976 angles), as a matrix to apply to every star.
function precession(T) {
  const s = (a) => a / 3600;
  const zeta = s(2306.2181 * T + 0.30188 * T * T), z = s(2306.2181 * T + 1.09468 * T * T), th = s(2004.3109 * T - 0.42665 * T * T);
  const [cz, sz, cZ, sZ, ct, st] = [cos(zeta), sin(zeta), cos(z), sin(z), cos(th), sin(th)];
  return [
    [cZ * ct * cz - sZ * sz, -cZ * ct * sz - sZ * cz, -cZ * st],
    [sZ * ct * cz + cZ * sz, -sZ * ct * sz + cZ * cz, -sZ * st],
    [st * cz, -st * sz, ct],
  ];
}
const apply = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

// Keplerian elements and rates per century from JPL's "Approximate Positions of the
// Planets" (valid 1800–2050): a, e, I, L, long. perihelion, long. node.
const ELEMENTS = {
  Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  Venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  Earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  Mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  Jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  Saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};
// Absolute magnitude and phase coefficient, for a rough brightness (Saturn without rings).
const BRIGHTNESS = { Mercury: [-0.42, 0.038], Venus: [-4.4, 0.0009], Mars: [-1.52, 0.016], Jupiter: [-9.4, 0.005], Saturn: [-8.88, 0.044] };

// Solve Kepler's equation, M and E in degrees.
function eccentric(M, e) {
  let E = M + (e / RAD) * sin(M);
  for (let i = 0; i < 8; i++) E -= (E - (e / RAD) * sin(E) - M) / (1 - e * cos(E));
  return E;
}

// Heliocentric ecliptic J2000 position in au.
function heliocentric(name, T) {
  const [el, rate] = ELEMENTS[name];
  const [a, e, I, L, peri, node] = el.map((v, i) => v + rate[i] * T);
  const w = peri - node, E = eccentric(norm(L - peri), e);
  const xp = a * (cos(E) - e), yp = a * Math.sqrt(1 - e * e) * sin(E);
  return [
    (cos(w) * cos(node) - sin(w) * sin(node) * cos(I)) * xp + (-sin(w) * cos(node) - cos(w) * sin(node) * cos(I)) * yp,
    (cos(w) * sin(node) + sin(w) * cos(node) * cos(I)) * xp + (-sin(w) * sin(node) + cos(w) * cos(node) * cos(I)) * yp,
    sin(w) * sin(I) * xp + cos(w) * sin(I) * yp,
  ];
}

const EPS_J2000 = 23.43928;
const eclipticToEquatorial = ([x, y, z], eps) => [x, y * cos(eps) - z * sin(eps), y * sin(eps) + z * cos(eps)];

// The Moon by Paul Schlyter's method: a Keplerian orbit plus its largest perturbations.
// Returns geocentric ecliptic longitude and latitude of date, and distance in Earth radii.
function moonEcliptic(d) {
  const N = 125.1228 - 0.0529538083 * d, i = 5.1454, w = 318.0634 + 0.1643573223 * d, a = 60.2666, e = 0.0549;
  const M = norm(115.3654 + 13.0649929509 * d);
  const Ms = norm(356.047 + 0.9856002585 * d), ws = 282.9404 + 4.70935e-5 * d;
  const E = eccentric(M, e);
  const xv = a * (cos(E) - e), yv = a * Math.sqrt(1 - e * e) * sin(E);
  const v = atan2(yv, xv);
  let r = Math.hypot(xv, yv);
  const xh = r * (cos(N) * cos(v + w) - sin(N) * sin(v + w) * cos(i));
  const yh = r * (sin(N) * cos(v + w) + cos(N) * sin(v + w) * cos(i));
  const zh = r * sin(v + w) * sin(i);
  let lon = atan2(yh, xh), lat = atan2(zh, Math.hypot(xh, yh));
  const Ls = Ms + ws, Lm = M + w + N, D = Lm - Ls, F = Lm - N;
  lon += -1.274 * sin(M - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms) - 0.059 * sin(2 * M - 2 * D)
    - 0.057 * sin(M - 2 * D + Ms) + 0.053 * sin(M + 2 * D) + 0.046 * sin(2 * D - Ms) + 0.041 * sin(M - Ms)
    - 0.035 * sin(D) - 0.031 * sin(M + Ms) - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(M - 4 * D);
  lat += -0.173 * sin(F - 2 * D) - 0.055 * sin(M - F - 2 * D) - 0.046 * sin(M + F - 2 * D)
    + 0.033 * sin(F + 2 * D) + 0.017 * sin(2 * M + F);
  r += -0.58 * cos(M - 2 * D) - 0.46 * cos(2 * D);
  // The Sun's longitude of date, for the phase.
  const es = 0.016709 - 1.151e-9 * d, Es = eccentric(Ms, es);
  const sunLon = norm(atan2(Math.sqrt(1 - es * es) * sin(Es), cos(Es) - es) + ws);
  return { lon: norm(lon), lat, r, sunLon };
}

// Atmospheric refraction lifts things near the horizon by up to half a degree (Bennett).
const refract = (alt) => (alt > -1 ? alt + 1 / 60 / Math.tan((alt + 7.31 / (alt + 4.4)) * RAD) : alt);

// Everything needed to draw the sky at `date` from `place`: a function from J2000 RA/Dec
// to [azimuth from north through east, altitude], plus the Sun, Moon and planets.
export function skyAt(date, place = MELBOURNE) {
  const jd = julian(date), d = jd - 2451545, T = d / 36525;
  const P = precession(T);
  const lst = norm(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T + place.lon);
  const { lat } = place;

  // RA/Dec of date to azimuth and altitude.
  const horizontal = (ra, dec) => {
    const H = lst - ra;
    const alt = asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H));
    const az = norm(atan2(sin(H) * cos(dec), cos(H) * sin(lat) * cos(dec) - sin(dec) * cos(lat)) + 180);
    return [az, alt];
  };
  const project = (ra, dec) => {
    const [az, alt] = horizontal(...radec(apply(P, vec(ra, dec))));
    return [az, refract(alt)];
  };

  // The Sun and planets, geocentric, from the elements above.
  const earth = heliocentric('Earth', T);
  const fromEarth = (h) => {
    const g = h.map((c, i) => c - earth[i]);
    const [ra, dec] = radec(eclipticToEquatorial(g, EPS_J2000));
    return { pos: project(ra, dec), dist: Math.hypot(...g) };
  };
  const sun = fromEarth([0, 0, 0]).pos;
  const planets = Object.keys(BRIGHTNESS).map((name) => {
    const h = heliocentric(name, T), { pos, dist } = fromEarth(h);
    const r = Math.hypot(...h);
    const phase = Math.acos(Math.min(1, Math.max(-1, (r * r + dist * dist - 1) / (2 * r * dist)))) / RAD;
    const [H, k] = BRIGHTNESS[name];
    return { name, az: pos[0], alt: pos[1], mag: H + 5 * Math.log10(r * dist) + k * phase };
  });

  // The Moon, already of date; parallax lowers it by up to a degree from where we stand.
  const m = moonEcliptic(jd - 2451543.5);
  const eps = 23.4393 - 3.563e-7 * (jd - 2451543.5);
  const [mra, mdec] = radec(eclipticToEquatorial(vec(m.lon, m.lat), eps));
  let [maz, malt] = horizontal(mra, mdec);
  malt = refract(malt - asin(1 / m.r) * cos(malt));
  const elong = Math.acos(cos(m.lat) * cos(m.lon - m.sunLon)) / RAD;
  const moon = {
    az: maz, alt: malt,
    lit: (1 - cos(elong)) / 2,                  // illuminated fraction
    waxing: norm(m.lon - m.sunLon) < 180,
    // The direction of the Sun from the Moon on the sky, clockwise from straight up,
    // so the drawn crescent faces the right way.
    limb: atan2(sin(sun[0] - maz) * cos(sun[1]), cos(malt) * sin(sun[1]) - sin(malt) * cos(sun[1]) * cos(sun[0] - maz)),
  };

  return { date, project, sun: { az: sun[0], alt: sun[1] }, moon, planets };
}

const PHASES = ['new Moon', 'waxing crescent', 'first-quarter Moon', 'waxing gibbous', 'full Moon', 'waning gibbous', 'last-quarter Moon', 'waning crescent'];
export function phaseName({ lit, waxing }) {
  if (lit < 0.03) return PHASES[0];
  if (lit > 0.97) return PHASES[4];
  if (Math.abs(lit - 0.5) < 0.06) return waxing ? PHASES[2] : PHASES[6];
  return waxing ? (lit < 0.5 ? PHASES[1] : PHASES[3]) : (lit < 0.5 ? PHASES[7] : PHASES[5]);
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = (az) => POINTS[Math.round(norm(az) / 45) % 8];
