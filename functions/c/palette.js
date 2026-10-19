// GET /c/palette -> JSON { palettes: [[{ hex, share }, ...], ...] }, one palette per recent
// photo, for the homepage garden (src/garden.js). Cached at the edge like /c/colours.

import { photos } from '../_lib/photos.js';

const TTL = 300;

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  let list;
  try {
    list = await photos();
  } catch (err) {
    console.error('palette:', err.message);
    list = [];
  }
  // The garden falls back to its own palette on a 204.
  if (!list.length) return new Response(null, { status: 204 });

  const palettes = list.map((p) => p.palette.map(({ hex, share }) => ({ hex: hex.toLowerCase(), share: +share })));
  const res = new Response(JSON.stringify({ palettes }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=60, s-maxage=${TTL}` },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
