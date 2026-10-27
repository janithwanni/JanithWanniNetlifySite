// Recent photographs and their colour palettes, from the getcolors function on hear.
// Shared by /c/colours (the shelf), /c/palette (the garden) and /c/exhibition (the
// museum). The leading underscore keeps this folder out of Pages Functions routing.

const SOURCE = 'https://hear.janithwanni.com/.netlify/functions/getcolors';

// Colours go straight into style="" and SVG fills, so only plain hex is let through.
export const isHex = (h) => typeof h === 'string' && /^#(?:[0-9a-f]{3}){1,2}$/i.test(h);

export async function photos(limit = 12) {
  const res = await fetch(`${SOURCE}?limit=${limit}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`getcolors ${res.status}`);
  return ((await res.json()).images ?? [])
    .map((p) => ({ ...p, palette: (p.palette ?? []).filter((c) => isHex(c.hex) && c.share > 0) }))
    .filter((p) => p.palette.length);
}
