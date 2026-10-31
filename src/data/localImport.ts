import { nameFromFile } from '../core/text';
import type { Playlist, Song } from '../core/types';
import { registerFiles } from '../audio/local';

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|webm)$/i;

export const fileKeyOf = (f: File) => `${f.name}:${f.size}`;

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);
}

async function downscaleCover(data: Uint8Array, format: string, size = 256): Promise<string> {
  try {
    const bmp = await createImageBitmap(new Blob([data as BlobPart], { type: format }));
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const s = Math.min(bmp.width, bmp.height);
    c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
    bmp.close();
    return c.toDataURL('image/jpeg', 0.8);
  } catch {
    return '';
  }
}

async function readSong(f: File): Promise<Song> {
  const key = fileKeyOf(f);
  const fallback = nameFromFile(f.name);
  let title = fallback.title, artist = fallback.artist, cover = '';
  try {
    const { parseBlob } = await import('music-metadata');
    const meta = await parseBlob(f, { duration: false, skipPostHeaders: true });
    if (meta.common.title) title = meta.common.title;
    if (meta.common.artist) artist = meta.common.artist;
    const pic = meta.common.picture?.[0];
    if (pic) cover = await downscaleCover(pic.data, pic.format);
  } catch {
    /* unreadable tags: keep file-name fallback */
  }
  return { id: 'local:' + key, title, artist, cover, source: { type: 'local', fileKey: key }, startOffsetMs: null };
}

/** Reads tags for every audio file and builds a playlist; also registers the files for playback. */
export async function importLocalFiles(files: File[], onProgress?: (msg: string) => void): Promise<Playlist> {
  const audio = files.filter(isAudioFile);
  if (!audio.length) throw new Error('Không tìm thấy tệp âm thanh nào.');
  registerFiles(audio);
  const songs: Song[] = [];
  for (let i = 0; i < audio.length; i++) {
    songs.push(await readSong(audio[i]));
    onProgress?.(`Đang đọc thẻ ${i + 1}/${audio.length}...`);
  }
  const folder = (audio[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0];
  const name = folder || `Nhạc trên máy (${audio.length} bài)`;
  return {
    id: 'local:' + (folder || 'files-' + Date.now().toString(36)), name, kind: 'local', songs,
    defaultOffsetMs: 0, bestScore: 0, createdAt: Date.now(),
  };
}

/** Re-attaches files picked in a new session; returns how many playlist songs are now playable. */
export function relinkFiles(files: File[], playlist: Playlist): number {
  registerFiles(files.filter(isAudioFile));
  const keys = new Set(files.map(fileKeyOf));
  return playlist.songs.filter((s) => s.source.type === 'local' && keys.has(s.source.fileKey)).length;
}
