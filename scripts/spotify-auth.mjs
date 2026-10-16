// One-time helper: prints a Spotify refresh token for functions/c/listening.js.
//
//   1. Create an app at https://developer.spotify.com/dashboard and add the
//      redirect URI http://127.0.0.1:8888/callback
//   2. SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/spotify-auth.mjs
//   3. Open the printed URL, approve, and copy the refresh token into the
//      Cloudflare Pages secrets (and .dev.vars for local testing).
import http from 'node:http';

const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.');
  process.exit(1);
}

const REDIRECT = 'http://127.0.0.1:8888/callback';
const authorize = new URL('https://accounts.spotify.com/authorize');
authorize.search = new URLSearchParams({
  client_id: id,
  response_type: 'code',
  redirect_uri: REDIRECT,
  scope: 'user-read-recently-played',
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  const code = url.searchParams.get('code');
  if (!code) return res.end(`Authorisation failed: ${url.searchParams.get('error')}`);

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
  });
  const body = await tokenRes.json();
  if (!tokenRes.ok) {
    res.end('Token exchange failed, see terminal.');
    console.error(body);
  } else {
    res.end('Done. You can close this tab.');
    console.log(`\nSPOTIFY_REFRESH_TOKEN=${body.refresh_token}\n`);
  }
  server.close();
});

server.listen(8888, '127.0.0.1', () => console.log(`Open this URL to authorise:\n\n${authorize}\n`));
