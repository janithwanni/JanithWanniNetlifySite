// Builds public/c/switch.html, the homepage's Nintendo Switch shelf, from content/switch.json.
//
// `npm run switch` (--fetch) first refreshes content/switch.json from the play history the
// Nintendo Store app shows (endpoint from github.com/sibylsea-hub/ns-play-history), using NINTENDO_SESSION_TOKEN from .dev.vars (see
// scripts/nintendo-auth.mjs), and saves each game's icon to public/img/switch/<titleId>.jpg
// so visitors never contact Nintendo. It runs on this machine only; commit the results.
// Without --fetch (as in `npm run content`, since build-content.mjs clears public/c) it just
// renders the saved JSON.
//
// content/switch.json:
//   { "updated": "2026-10-23",
//     "games": [{ "title": "…", "minutes": 7200, "cover": "<titleId>.jpg" }, …] }

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../content/switch.json', import.meta.url);
const OUT = new URL('../public/c/switch.html', import.meta.url);
const COVERS = new URL('../public/img/switch/', import.meta.url);
const COVER_PX = 160; // shown at 40px; 4x for sharp high-density screens

const CLIENT_ID = '5c38e31cd085304b';
const UA = 'com.nintendo.znej/1.13.0 (Android/7.1.2)';

async function accessToken(sessionToken) {
  const res = await fetch('https://accounts.nintendo.com/connect/1.0.0/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      session_token: sessionToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function playHistories(sessionToken) {
  const res = await fetch('https://app-api.znej.nintendo.com/api/v2.0/users/me/play_histories', {
    headers: {
      Authorization: `Bearer ${await accessToken(sessionToken)}`,
      Accept: 'application/json',
      'gentry-locale': 'en-US', // required; sets the language of the titles
    },
  });
  if (!res.ok) throw new Error(`play_histories ${res.status}: ${await res.text()}`);
  return (await res.json()).playHistories ?? [];
}

// Icons are content for a title that doesn't change, so each is downloaded once.
async function saveCover(titleId, imageUrl) {
  const name = `${titleId.replace(/[^0-9a-z]/gi, '')}.jpg`;
  const file = fileURLToPath(new URL(name, COVERS));
  try {
    await access(file);
    return name;
  } catch {}
  const res = await fetch(imageUrl);
  if (!res.ok) {
    console.warn(`switch: no cover for ${titleId} (${res.status})`);
    return null;
  }
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', String(COVER_PX), file, '--out', file], { stdio: 'ignore' });
  return name;
}

if (process.argv.includes('--fetch')) {
  const token = process.env.NINTENDO_SESSION_TOKEN;
  if (!token) throw new Error('Set NINTENDO_SESSION_TOKEN in .dev.vars (run scripts/nintendo-auth.mjs).');
  await mkdir(COVERS, { recursive: true });
  // A game played on both a Switch (HAC) and a Switch 2 (BEE) has an entry for each.
  const byTitle = new Map();
  for (const h of await playHistories(token)) {
    if (!(h.totalPlayedMinutes > 0)) continue;
    const game = byTitle.get(h.titleId);
    if (game) game.minutes += h.totalPlayedMinutes;
    else byTitle.set(h.titleId, { title: h.titleName, minutes: h.totalPlayedMinutes, imageUrl: h.imageUrl });
  }
  const games = [];
  for (const [titleId, { imageUrl, ...game }] of byTitle) {
    games.push({ ...game, cover: imageUrl ? await saveCover(titleId, imageUrl) : null });
  }
  const updated = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
  await writeFile(SRC, JSON.stringify({ updated, games }, null, 2) + '\n');
  console.log(`switch: fetched ${games.length} games -> content/switch.json`);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = new Intl.NumberFormat('en-AU');
const played = (min) => (min < 60 ? `${min} min` : `${num.format(Math.round(min / 60))} h`);

const { updated, games = [] } = JSON.parse(await readFile(SRC, 'utf8'));
const shelf = games.filter((g) => g.title && g.minutes > 0).sort((a, b) => b.minutes - a.minutes);

const cover = (g) => g.cover
  ? `<img src="/img/switch/${esc(g.cover)}" alt="" width="40" height="40" loading="lazy" decoding="async">`
  : '<span class="cover-none"></span>';

// An empty fragment leaves the homepage row empty, like the other rows when they fail.
let html = '';
if (shelf.length) {
  const total = Math.round(shelf.reduce((sum, g) => sum + g.minutes, 0) / 60);
  const most = shelf[0].minutes;
  const asOf = updated
    ? ` as of <time datetime="${esc(updated)}">${new Date(updated).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</time>`
    : '';
  html = `<h3 class="small-head">On the Switch</h3>
<p class="playtime-total"><strong>${num.format(total)} hours</strong> across ${shelf.length} ${shelf.length === 1 ? 'game' : 'games'}${asOf}.</p>
<ul class="lately playtime">
${shelf.map((g) => `<li style="--share: ${((g.minutes / most) * 100).toFixed(1)}%">${cover(g)}` +
  `<span class="track">${esc(g.title)}</span><span class="hours">${played(g.minutes)}</span></li>`).join('\n')}
</ul>
`;
}

await writeFile(OUT, html);
console.log(`switch: ${shelf.length} games -> public/c/switch.html`);
