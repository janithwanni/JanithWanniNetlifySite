// GET /c/listening -> an htmx fragment of the 10 tracks most recently played on Spotify.
// Spotify is only ever called from here, never from the visitor's browser. Responses
// are kept in the edge cache, so Spotify is hit at most once per TTL per data centre.
//
// Secrets (Pages project settings, or .dev.vars locally):
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN (see scripts/spotify-auth.mjs)

const TTL = 300;
const COUNT = 10;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function accessToken(env) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.SPOTIFY_REFRESH_TOKEN }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  return (await res.json()).access_token;
}

async function recentTracks(env) {
  const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
    headers: { Authorization: `Bearer ${await accessToken(env)}` },
  });
  if (!res.ok) throw new Error(`recently-played ${res.status}`);
  // A song on loop shows up once per play; keep each track once, at its latest play.
  const seen = new Set();
  return (await res.json()).items
    .filter(({ track: t }) => t && !seen.has(t.id) && seen.add(t.id))
    .slice(0, COUNT);
}

// Spotify lists album art largest first; the last is the 64px thumbnail. It is served
// through /c/cover so visitors' browsers never contact Spotify.
const cover = (track) => {
  const id = track.album?.images?.at(-1)?.url.match(/\/image\/([0-9a-f]+)$/)?.[1];
  return id
    ? `<img src="/c/cover/${id}" alt="" width="32" height="32" loading="lazy" decoding="async">`
    : '<span class="cover-none"></span>';
};

// Relative to when the fragment is rendered; it is cached for TTL, so "now" is approximate.
function ago(iso, now) {
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 5) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const render = (plays, now = Date.now()) => `<h3 class="small-head">On the record player</h3>
<ul class="lately listening">
${plays.map(({ track: t, played_at }) => `<li>${cover(t)}<span class="track">` +
  `<a href="${esc(t.external_urls.spotify)}" rel="noopener">${esc(t.name)}</a>` +
  `<span class="kind">${esc(t.artists.map((a) => a.name).join(', '))}</span></span>` +
  `<time datetime="${esc(played_at)}">${ago(played_at, now)}</time></li>`).join('\n')}
</ul>`;

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  let plays;
  try {
    plays = await recentTracks(env);
  } catch (err) {
    console.error('spotify:', err.message);
    plays = [];
  }
  // htmx leaves the placeholder untouched on a 204, so failures stay invisible.
  if (!plays.length) return new Response(null, { status: 204 });

  const res = new Response(render(plays), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${TTL}` },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
