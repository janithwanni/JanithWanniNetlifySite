// One-time helper: prints a Nintendo session token for scripts/build-switch.mjs.
//
// Nintendo has no public API for play history. This signs in the way the Nintendo Store
// app does (its client id, the endpoints from github.com/ZekeSnider/NintendoSwitchRESTAPI),
// so it is unofficial, may stop working, and may be against Nintendo's terms of use.
//
//   1. node scripts/nintendo-auth.mjs
//   2. Open the printed URL and sign in. On the "Select this account" page, right-click
//      the red button, copy the link (it starts with npf5c38e31cd085304b://auth#), and
//      paste it into the terminal.
//   3. Put the printed NINTENDO_SESSION_TOKEN in .dev.vars. It lasts about two years and
//      can read your whole Nintendo Account, so keep it out of git and off the server.
import crypto from 'node:crypto';
import readline from 'node:readline/promises';

const CLIENT_ID = '5c38e31cd085304b';
const REDIRECT = `npf${CLIENT_ID}://auth`;
const b64url = (buf) => buf.toString('base64url');

const state = b64url(crypto.randomBytes(36));
const verifier = b64url(crypto.randomBytes(32));
const authorize = new URL('https://accounts.nintendo.com/connect/1.0.0/authorize');
authorize.search = new URLSearchParams({
  state,
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  scope: 'openid user user.mii user.email user.links[].id',
  response_type: 'session_token_code',
  session_token_code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
  session_token_code_challenge_method: 'S256',
  theme: 'login_form',
});

console.log(`Open this URL, sign in, and copy the "Select this account" link:\n\n${authorize}\n`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pasted = (await rl.question('Paste the npf… link: ')).trim();
rl.close();

if (!pasted.startsWith(`${REDIRECT}#`)) throw new Error(`Expected a link starting with ${REDIRECT}#`);
const params = new URLSearchParams(pasted.slice(pasted.indexOf('#') + 1));
if (params.get('state') !== state) throw new Error('State does not match; run the script again.');

const res = await fetch('https://accounts.nintendo.com/connect/1.0.0/api/session_token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'com.nintendo.znej/1.13.0 (Android/7.1.2)' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    session_token_code: params.get('session_token_code') ?? '',
    session_token_code_verifier: verifier,
  }),
});
const body = await res.json();
if (!res.ok || !body.session_token) throw new Error(`session_token ${res.status}: ${JSON.stringify(body)}`);
console.log(`\nNINTENDO_SESSION_TOKEN=${body.session_token}\n`);
