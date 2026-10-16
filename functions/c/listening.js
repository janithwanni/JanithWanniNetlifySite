// GET /c/listening -> an htmx fragment of the 5 tracks most recently played on Spotify.
// Spotify is only ever called from here, never from the visitor's browser. Responses
// are kept in the edge cache, so Spotify is hit at most once per TTL per data centre.
//
// Secrets (Pages project settings, or .dev.vars locally):
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN (see scripts/spotify-auth.mjs)

const TTL = 300;
const COUNT = 5;

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
  const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=20', {
    headers: { Authorization: `Bearer ${await accessToken(env)}` },
  });
  if (!res.ok) throw new Error(`recently-played ${res.status}`);
  // A song on loop shows up once per play; keep each track once.
  const seen = new Set();
  return (await res.json()).items
    .map((item) => item.track)
    .filter((t) => t && !seen.has(t.id) && seen.add(t.id))
    .slice(0, COUNT);
}

const render = (tracks) => `<h3 class="small-head">On the record player</h3>
<ul class="lately listening">
${tracks.map((t) => `<li><a href="${esc(t.external_urls.spotify)}" rel="noopener">${esc(t.name)}</a>` +
  `<span class="kind">${esc(t.artists.map((a) => a.name).join(', '))}</span></li>`).join('\n')}
</ul>`;

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  let tracks;
  try {
    tracks = await recentTracks(env);
  } catch (err) {
    console.error('spotify:', err.message);
    tracks = [];
  }
  // htmx leaves the placeholder untouched on a 204, so failures stay invisible.
  if (!tracks.length) return new Response(null, { status: 204 });

  const res = new Response(render(tracks), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${TTL}` },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
