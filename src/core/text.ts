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
  /** Words of title and artist, and both without spaces ("son tung" -> "sontung"). */
  words: string[];
  compact: string;
  /** Normalized individual artist names ("A ft. B" -> ["a", "b"]). */
  artists: string[];
}

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });
const ARTIST_SPLIT = /\s*(?:,|&|\+|\/|;|\bx\b|\bft\b\.?|\bfeat\b\.?|\bfeaturing\b|\bvs\b\.?|\swith\s|\svà\s)\s*/i;

/** Display names of the artists credited on a song. */
export function splitArtists(artist: string): string[] {
  return artist.split(ARTIST_SPLIT).map((a) => a.trim()).filter(Boolean);
}

/** Builds an alphabetically sorted index; build once per playlist. */
export function buildIndex(songs: Song[]): SearchIndexEntry[] {
  return songs
    .map((song) => {
      const title = normalize(song.title), artist = normalize(song.artist);
      const words = [...new Set(`${title} ${artist}`.split(' ').filter(Boolean))];
      return {
        song, title, artist, words, compact: (title + artist).replace(/ /g, ''),
        artists: splitArtists(song.artist).map(normalize).filter(Boolean),
      };
    })
    .sort((a, b) => collator.compare(a.song.title, b.song.title) || collator.compare(a.song.artist, b.song.artist));
}

/** Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps), capped at `max + 1`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = b.length;
  let prev2 = new Array<number>(n + 1).fill(0);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** Typos allowed for a query word of this length. */
const allowed = (len: number) => (len <= 2 ? 0 : len <= 4 ? 1 : len <= 7 ? 2 : 3);

/** Best distance of a query word to any word (whole word, or its prefix while still typing). */
function wordDistance(q: string, words: string[]): number {
  const max = allowed(q.length);
  let best = max + 1;
  for (const w of words) {
    if (w.startsWith(q)) return 0;
    if (max === 0) continue;
    best = Math.min(best, editDistance(q, w, max));
    if (w.length > q.length) best = Math.min(best, editDistance(q, w.slice(0, q.length), max) + 0.5);
    if (best === 0) break;
  }
  return best;
}

/**
 * Ranks: 0 title prefix, 1 artist or word prefix, 2 substring (also ignoring spaces), 3 fuzzy (typos,
 * swapped letters, missing letters), best first. Alphabetical within a rank. Empty query: everything.
 */
export function search(index: SearchIndexEntry[], query: string): Song[] {
  const q = normalize(query);
  if (!q) return index.map((e) => e.song);
  const qWords = q.split(' ');
  const qc = q.replace(/ /g, '');
  const wq = ' ' + q;
  const hits: { song: Song; rank: number; i: number }[] = [];
  index.forEach((e, i) => {
    let rank = -1;
    if (e.title.startsWith(q)) rank = 0;
    else if (e.artist.startsWith(q) || (' ' + e.title).includes(wq) || (' ' + e.artist).includes(wq)) rank = 1;
    else if ((e.title + ' ' + e.artist).includes(q) || (qc.length > 2 && e.compact.includes(qc))) rank = 2;
    else {
      let sum = 0;
      for (const w of qWords) {
        const d = wordDistance(w, e.words);
        if (d > allowed(w.length)) return;
        sum += d;
      }
      rank = 3 + sum / qWords.length;
    }
    hits.push({ song: e.song, rank, i });
  });
  return hits.sort((a, b) => a.rank - b.rank || a.i - b.i).map((h) => h.song);
}

export interface ArtistHit {
  key: string;
  name: string;
  count: number;
}

/** Artists matching the query (same typo tolerance), with how many songs each has. */
export function searchArtists(index: SearchIndexEntry[], query: string, limit = 6): ArtistHit[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const all = new Map<string, ArtistHit>();
  for (const e of index) {
    const names = splitArtists(e.song.artist);
    e.artists.forEach((key, i) => {
      const hit = all.get(key) ?? { key, name: names[i] ?? key, count: 0 };
      hit.count++;
      all.set(key, hit);
    });
  }
  const qWords = q.split(' ');
  const scored: { hit: ArtistHit; d: number }[] = [];
  for (const hit of all.values()) {
    const words = hit.key.split(' ');
    let d = 0;
    if (hit.key.startsWith(q) || hit.key.replace(/ /g, '').startsWith(q.replace(/ /g, ''))) d = 0;
    else {
      for (const w of qWords) {
        const x = wordDistance(w, words);
        if (x > allowed(w.length)) { d = -1; break; }
        d += x + 0.1;
      }
      if (d < 0) continue;
    }
    scored.push({ hit, d });
  }
  return scored.sort((a, b) => a.d - b.d || b.hit.count - a.hit.count).slice(0, limit).map((x) => x.hit);
}

/** Songs credited to an artist key from `searchArtists`. */
export const songsByArtist = (index: SearchIndexEntry[], key: string): Song[] =>
  index.filter((e) => e.artists.includes(key)).map((e) => e.song);

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
