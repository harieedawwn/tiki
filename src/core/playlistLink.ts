export type LinkParse = { ok: true; listId: string } | { ok: false; error: 'invalid' | 'mix' };

const ID_RE = /^[A-Za-z0-9_-]{10,64}$/;

/** Extracts a playlist id from youtube.com / music.youtube.com / youtu.be links or a bare id. */
export function parsePlaylistLink(input: string): LinkParse {
  const raw = input.trim();
  let id: string | null = null;
  if (ID_RE.test(raw)) id = raw;
  else {
    try {
      const url = new URL(raw.includes('://') ? raw : 'https://' + raw);
      const host = url.hostname.replace(/^(www|m)\./, '');
      if (!['youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) return { ok: false, error: 'invalid' };
      id = url.searchParams.get('list');
      const browse = url.pathname.match(/^\/browse\/VL([A-Za-z0-9_-]+)/);
      if (!id && browse) id = browse[1];
    } catch {
      return { ok: false, error: 'invalid' };
    }
  }
  if (!id || !ID_RE.test(id)) return { ok: false, error: 'invalid' };
  if (id.startsWith('RD')) return { ok: false, error: 'mix' };
  return { ok: true, listId: id };
}
