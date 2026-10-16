// GET /c/cover/<id> -> a Spotify album thumbnail, proxied so visitors never contact
// Spotify. Image ids are content hashes, so responses never change and are cached
// for a year at the edge and in the browser.

export async function onRequestGet({ request, params, waitUntil }) {
  // Only Spotify image ids, so this can't be used as an open proxy.
  if (!/^[0-9a-f]{16,64}$/.test(params.id)) return new Response(null, { status: 404 });

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const upstream = await fetch(`https://i.scdn.co/image/${params.id}`);
  if (!upstream.ok) return new Response(null, { status: 404 });

  const res = new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}
