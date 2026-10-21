"""Janith Hand: turn the scanned alphabet sheet into a web font.

    pip install opencv-python-headless numpy fonttools brotli potracer
    python scripts/handwriting/build_font.py scripts/handwriting/sheet.png public/fonts/janith-hand

Writes <out>.otf and <out>.woff2 (only the .woff2 is served). Each letter on the sheet is
one ink blob; fused baseline dashes are stripped, the blob is traced with potrace, and the
punctuation (. , - ') is made from the i's dot and one of the sheet's own dashes.
"""
import sys, math
import cv2, numpy as np, potrace
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

SRC, OUT = sys.argv[1], sys.argv[2]

img = cv2.imread(SRC, 0)
THR = 86
bw = (img < THR).astype(np.uint8) * 255
n, lab, st, cen = cv2.connectedComponentsWithStats(bw, 8)

# ---- order the 52 letters: rows by y, then x ----
big = sorted([i for i in range(1, n) if st[i, 4] > 800], key=lambda i: cen[i][1])
rows, cur = [], [big[0]]
for i in big[1:]:
    if cen[i][1] - cen[cur[-1]][1] > 120:
        rows.append(cur); cur = [i]
    else:
        cur.append(i)
rows.append(cur)
order = [i for r in rows for i in sorted(r, key=lambda i: cen[i][0])]
NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
assert len(order) == 52, len(order)
comp = dict(zip(NAMES, order))

# Grid dashes: small, wide, flat components.
dashes = [i for i in range(1, n) if 60 < st[i, 4] < 800 and st[i, 2] > 1.8 * st[i, 3]]
# Dots: small, roughly round components.
dots = [i for i in range(1, n) if 40 < st[i, 4] < 600 and 0.5 < st[i, 2] / max(st[i, 3], 1) < 2.0]


def guide_y(i):
    """Median y of baseline dashes beside letter i (None if there are none)."""
    x, y, w, h, _ = st[i]
    ys = [cen[d][1] for d in dashes
          if x - 200 < cen[d][0] < x + w + 200 and y + h * 0.3 < cen[d][1] < y + h + 40]
    return float(np.median(ys)) if ys else None


def letter_mask(ch):
    i = comp[ch]
    m = (lab == i).astype(np.uint8) * 255
    base = None
    if ch.islower():
        base = guide_y(i)
        if base is not None:
            # strip thin horizontal runs (fused dashes) in a band around the guide line
            horiz = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (29, 1)))
            vert_thick = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 17)))
            band = np.zeros_like(m); b = int(base)
            band[b - 14:b + 15] = 255
            kill = cv2.bitwise_and(cv2.bitwise_and(horiz, band), cv2.bitwise_not(vert_thick))
            kill = cv2.dilate(kill, np.ones((3, 3), np.uint8))
            m = cv2.bitwise_and(m, cv2.bitwise_not(kill))
            # keep only substantial pieces
            k, l2, s2, _ = cv2.connectedComponentsWithStats(m, 8)
            m = np.isin(l2, [j for j in range(1, k) if s2[j, 4] > 150]).astype(np.uint8) * 255
        if ch in 'ij':
            x, y, w, h, _ = st[i]
            cand = [d for d in dots if x - 40 < cen[d][0] < x + w + 80 and y - 160 < cen[d][1] < y]
            if cand:
                d = min(cand, key=lambda d: y - cen[d][1])
                m |= ((lab == d).astype(np.uint8) * 255)
    return m, base


def smooth(mask):
    """Anti-aliased upsample of the inked region, for cleaner tracing."""
    ys, xs = np.nonzero(mask)
    p = 12
    y0, y1, x0, x1 = ys.min() - p, ys.max() + p, xs.min() - p, xs.max() + p
    g = img[y0:y1, x0:x1].astype(np.float32)
    keep = cv2.dilate(mask[y0:y1, x0:x1], np.ones((5, 5), np.uint8)) > 0
    g[~keep] = 165
    g = np.minimum(g, np.where(mask[y0:y1, x0:x1] > 0, 0, 255).astype(np.float32))
    g = cv2.resize(g, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    g = cv2.GaussianBlur(g, (0, 0), 1.6)
    return g < THR, x0, y0


glyphs = {}
info = {}
for ch in NAMES:
    m, base = letter_mask(ch)
    ys, xs = np.nonzero(m)
    info[ch] = dict(mask=m, base=base, top=ys.min(), bot=ys.max(), h=ys.max() - ys.min())

# ---- vertical metrics ----
xh_letters = 'acemnorsuvwxz'
cap_plain = 'ABCDEFHIKLMNORSTUVWXZ'
xh_px = np.median([info[c]['h'] for c in xh_letters])
cap_px = np.median([info[c]['h'] for c in cap_plain])
X_HEIGHT, CAP_HEIGHT = 400, 700
# Letters rest a little above the drawn guide; measure that gap on letters without descenders.
DESC = set('fgjpqyY')
gap = np.median([info[c]['base'] - info[c]['bot'] for c in NAMES
                 if c.islower() and c not in DESC and info[c]['base'] is not None])
print('guide gap px', gap)
for ch in NAMES:
    d = info[ch]
    if ch not in DESC:
        d['base'] = d['bot']
    elif d['base'] is not None:
        d['base'] -= gap
    else:  # descender but no guide: sit the body on the baseline
        d['base'] = d['top'] + (cap_px if ch.isupper() else xh_px)
    d['scale'] = (CAP_HEIGHT / cap_px if ch.isupper() else X_HEIGHT / xh_px) / 2  # /2: upsampled

print('x-height px', xh_px, 'cap px', cap_px)

SLANT = math.tan(math.radians(22))
SB = 28


def trace(ch):
    d = info[ch]
    bmp, x0, y0 = smooth(d['mask'])
    path = potrace.Bitmap(~bmp).trace(turdsize=30, alphamax=1.0, opticurve=True, opttolerance=0.3)
    s = d['scale']
    def T(pt):
        X = (pt.x + 2 * x0) * s
        Y = (2 * d["base"] - (pt.y + 2 * y0)) * s
        return X, Y
    contours = []
    for c in path:
        segs = [('M', [T(c.start_point)])]
        for sg in c.segments:
            if sg.is_corner:
                segs.append(('L', [T(sg.c), T(sg.end_point)]))
            else:
                segs.append(('C', [T(sg.c1), T(sg.c2), T(sg.end_point)]))
        contours.append(segs)
    return contours


def pts(contours):
    return [p for c in contours for _, ps in c for p in ps]


def place(contours, sb=SB):
    """Shift so the de-slanted ink starts at sb; return (contours, advance)."""
    P = pts(contours)
    us = [x - y * SLANT for x, y in P]
    lo, hi = min(us), max(us)
    dx = sb - lo
    out = [[(op, [(x + dx, y) for x, y in ps]) for op, ps in c] for c in contours]
    return out, round(hi - lo + 2 * sb)


def draw(contours, pen):
    for c in contours:
        for op, ps in c:
            ps = [(round(x), round(y)) for x, y in ps]
            if op == 'M': pen.moveTo(ps[0])
            elif op == 'L': pen.lineTo(ps[0]); pen.lineTo(ps[1])
            else: pen.curveTo(*ps)
        pen.closePath()


shapes = {}
for ch in NAMES:
    shapes[ch] = place(trace(ch))

# ---- punctuation from the same ink ----
i_dot = None
xi, yi, wi, hi_, _ = st[comp['i']]
for d in dots:
    if xi - 40 < cen[d][0] < xi + wi + 80 and yi - 160 < cen[d][1] < yi:
        i_dot = d
dot_mask = (lab == i_dot).astype(np.uint8) * 255
dx_, dy_, dw, dh, _ = st[i_dot]


def synth(mask, base_y, scale):
    info['_'] = dict(mask=mask, base=base_y, scale=scale)
    return trace('_')


lsc = X_HEIGHT / xh_px / 2
# period: the i-dot, enlarged a touch, sitting on the baseline
pm = np.zeros_like(bw)
c = (int(cen[i_dot][0]), int(cen[i_dot][1]))
r = max(dw, dh) // 2 + 2
cv2.circle(pm, c, r, 255, -1, cv2.LINE_AA)
pm = cv2.bitwise_and(pm, cv2.dilate(dot_mask, np.ones((7, 7), np.uint8)))
pm = cv2.dilate(pm, np.ones((3, 3), np.uint8))
shapes['.'] = place(synth(pm, c[1] + r + 1, lsc), sb=40)
# comma: the dot with a short pen tail
cm = pm.copy()
cv2.line(cm, (c[0] + 2, c[1] + 2), (c[0] - 9, c[1] + 26), 255, 8, cv2.LINE_AA)
shapes[','] = place(synth(cm, c[1] + r + 1, lsc), sb=40)
# apostrophe: comma raised to x-height-ish
ap = place(synth(cm, c[1] + r + 1, lsc), sb=40)
ap = ([[(op, [(x, y + 420) for x, y in ps]) for op, ps in cc] for cc in ap[0]], ap[1])
shapes['quoteright'] = ap
# hyphen: a dash from the guide lines (a clean, isolated one)
hd = max(dashes, key=lambda d: st[d, 4] if st[d, 2] < 70 else 0)
hm = (lab == hd).astype(np.uint8) * 255
hm = cv2.erode(hm, np.ones((2, 2), np.uint8))
shapes['hyphen'] = place(synth(hm, int(cen[hd][1]) + 50, lsc * 0.9), sb=40)

# ---- assemble font ----
gname = {ch: ch for ch in NAMES}
gname.update({'.': 'period', ',': 'comma'})
cmap = {ord(ch): gname[ch] for ch in NAMES}
cmap.update({ord('.'): 'period', ord(','): 'comma', ord('-'): 'hyphen', ord("'"): 'quoteright',
             0x2019: 'quoteright', ord(' '): 'space', 0xA0: 'space'})

order_names = ['.notdef', 'space'] + [gname[c] for c in NAMES] + ['period', 'comma', 'hyphen', 'quoteright']
fb = FontBuilder(1000, isTTF=False)
fb.setupGlyphOrder(order_names)
fb.setupCharacterMap(cmap)
charstrings, metrics = {}, {}

pen = T2CharStringPen(500, None); pen.moveTo((50, 0)); pen.lineTo((450, 0)); pen.lineTo((450, 700)); pen.lineTo((50, 700)); pen.closePath()
pen.moveTo((100, 50)); pen.lineTo((100, 650)); pen.lineTo((400, 650)); pen.lineTo((400, 50)); pen.closePath()
charstrings['.notdef'] = pen.getCharString(); metrics['.notdef'] = (500, 50)
pen = T2CharStringPen(300, None); charstrings['space'] = pen.getCharString(); metrics['space'] = (300, 0)

key = {gname[c]: c for c in NAMES}
key.update({'period': '.', 'comma': ',', 'hyphen': 'hyphen', 'quoteright': 'quoteright'})
ymin, ymax = 0, 0
for g in order_names[2:]:
    contours, adv = shapes[key[g]]
    P = pts(contours)
    ymin = min(ymin, min(y for _, y in P)); ymax = max(ymax, max(y for _, y in P))
    pen = T2CharStringPen(adv, None)
    draw(contours, pen)
    charstrings[g] = pen.getCharString()
    metrics[g] = (adv, round(min(x for x, _ in P)))

fb.setupCFF('JanithHand-Regular', {'FullName': 'Janith Hand'}, charstrings, {})
fb.setupHorizontalMetrics(metrics)
asc, desc = round(max(ymax, 900)), round(min(ymin, -300))
fb.setupHorizontalHeader(ascent=asc, descent=desc)
fb.setupNameTable({'familyName': 'Janith Hand', 'styleName': 'Regular',
                   'copyright': 'Handwriting of Janith Wanniarachchi',
                   'uniqueFontIdentifier': 'JanithHand-Regular-1.0', 'version': 'Version 1.000'})
fb.setupOS2(sTypoAscender=asc, sTypoDescender=desc, sTypoLineGap=0, usWinAscent=asc, usWinDescent=-desc,
            sxHeight=X_HEIGHT, sCapHeight=CAP_HEIGHT, achVendID='JWAN')
fb.setupPost(italicAngle=0)
fb.save(OUT + '.otf')
f = TTFont(OUT + '.otf'); f.flavor = 'woff2'; f.save(OUT + '.woff2')
print('ascent', asc, 'descent', desc)
