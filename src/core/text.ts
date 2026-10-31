import type { Song } from './types';

/** Lowercase, strip Vietnamese diacritics (NFD + combining marks, đ→d), collapse non-alphanumerics. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface SearchIndexEntry {
  song: Song;
  title: string;
  artist: string;
}

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

/** Builds an alphabetically sorted index; build once per playlist. */
export function buildIndex(songs: Song[]): SearchIndexEntry[] {
  return songs
    .map((song) => ({ song, title: normalize(song.title), artist: normalize(song.artist) }))
    .sort((a, b) => collator.compare(a.song.title, b.song.title) || collator.compare(a.song.artist, b.song.artist));
}

/**
 * Ranks: 0 title prefix, 1 artist prefix or word prefix, 2 substring. Alphabetical within a rank.
 * An empty query returns every song alphabetically.
 */
export function search(index: SearchIndexEntry[], query: string): Song[] {
  const q = normalize(query);
  if (!q) return index.map((e) => e.song);
  const buckets: Song[][] = [[], [], []];
  const wq = ' ' + q;
  for (const e of index) {
    if (e.title.startsWith(q)) buckets[0].push(e.song);
    else if (e.artist.startsWith(q) || (' ' + e.title).includes(wq) || (' ' + e.artist).includes(wq)) buckets[1].push(e.song);
    else if ((e.title + ' ' + e.artist).includes(q)) buckets[2].push(e.song);
  }
  return buckets[0].concat(buckets[1], buckets[2]);
}

export function findExactTitle(index: SearchIndexEntry[], query: string): Song[] {
  const q = normalize(query);
  return q ? index.filter((e) => e.title === q).map((e) => e.song) : [];
}

const TAG_WORDS =
  /\b(official|mv|m\/v|music video|video|lyrics?|audio|visuali[sz]er|hd|4k|karaoke|vietsub|engsub|teaser|live|performance|clip)\b/i;

/** Cleans a YouTube video title into { artist, title }. */
export function cleanYouTubeName(videoTitle: string, channel: string): { artist: string; title: string } {
  const ch = channel.trim();
  if (/ - Topic$/.test(ch)) return { artist: ch.replace(/ - Topic$/, '').trim(), title: videoTitle.trim() };
  const t = videoTitle
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\(([^)]*)\)/g, (m, inner: string) => (TAG_WORDS.test(inner) ? ' ' : m))
    .replace(/\s*[|｜].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  const artist = ch.replace(/VEVO$/i, '').replace(/\s*Official$/i, '').trim();
  return { artist, title: t || videoTitle.trim() };
}

/** Parses "Artist - Title.ext" file names. */
export function nameFromFile(fileName: string): { artist: string; title: string } {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(?:\d{1,3}[.\s-]+)?(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: '', title: base };
}
