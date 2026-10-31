import { YOUTUBE_API_KEY, hasYouTubeKey } from '../config';
import { parsePlaylistLink } from '../core/playlistLink';
import { cleanYouTubeName } from '../core/text';
import type { Playlist, Song } from '../core/types';

export class ImportError extends Error {}

const API = 'https://www.googleapis.com/youtube/v3/';

const REASON_MESSAGES: Record<string, string> = {
  quotaExceeded: 'Đã hết hạn mức YouTube API trong hôm nay. Thử lại vào ngày mai.',
  dailyLimitExceeded: 'Đã hết hạn mức YouTube API trong hôm nay. Thử lại vào ngày mai.',
  rateLimitExceeded: 'Gửi yêu cầu quá nhanh. Đợi một lát rồi thử lại.',
  playlistNotFound: 'Không tìm thấy danh sách phát. Danh sách có thể đang ở chế độ riêng tư hoặc đã bị xoá.',
  playlistItemsNotAccessible: 'Danh sách phát này đang ở chế độ riêng tư.',
  playlistForbidden: 'Danh sách phát này đang ở chế độ riêng tư.',
  keyInvalid: 'Khoá YouTube API không hợp lệ. Kiểm tra lại src/config.ts.',
  accessNotConfigured: 'Khoá API chưa bật YouTube Data API v3 trong Google Cloud.',
  ipRefererBlocked: 'Khoá API không cho phép tên miền này. Thêm tên miền vào giới hạn của khoá.',
  forbidden: 'YouTube từ chối yêu cầu (403).',
};

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!hasYouTubeKey()) throw new ImportError('Chưa có khoá YouTube Data API. Dán khoá vào src/config.ts rồi build lại.');
  const qs = new URLSearchParams({ ...params, key: YOUTUBE_API_KEY });
  let res: Response;
  try {
    res = await fetch(API + path + '?' + qs.toString());
  } catch {
    throw new ImportError('Không kết nối được tới YouTube. Kiểm tra mạng.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason: string = body?.error?.errors?.[0]?.reason ?? '';
    const msg = REASON_MESSAGES[reason] ??
      (/API key not valid/i.test(body?.error?.message ?? '') ? REASON_MESSAGES.keyInvalid : `Lỗi YouTube API (${res.status}${reason ? ', ' + reason : ''}).`);
    throw new ImportError(msg);
  }
  return body as T;
}

interface Thumbs { [k: string]: { url: string; width?: number } | undefined }
interface PlaylistsResp { items: { snippet: { title: string } }[] }
interface ItemsResp { nextPageToken?: string; items: { contentDetails: { videoId: string } }[] }
interface VideosResp {
  items: {
    id: string;
    snippet: { title: string; channelTitle: string; thumbnails: Thumbs };
    status: { privacyStatus: string; embeddable: boolean; uploadStatus: string };
  }[];
}

function bestThumb(t: Thumbs): string {
  for (const k of ['maxres', 'standard', 'high', 'medium', 'default']) if (t[k]?.url) return t[k]!.url;
  return '';
}

export function linkErrorMessage(err: 'invalid' | 'mix'): string {
  return err === 'mix'
    ? 'Danh sách Mix (mã bắt đầu bằng RD) do YouTube tự tạo nên không hỗ trợ. Hãy dùng danh sách phát thường.'
    : 'Liên kết không hợp lệ. Dán liên kết youtube.com hoặc music.youtube.com có tham số list=.';
}

export async function importYouTubePlaylist(link: string, onProgress?: (msg: string) => void): Promise<Playlist> {
  const parsed = parsePlaylistLink(link);
  if (!parsed.ok) throw new ImportError(linkErrorMessage(parsed.error));
  const listId = parsed.listId;

  const meta = await get<PlaylistsResp>('playlists', { part: 'snippet', id: listId });
  if (!meta.items?.length) throw new ImportError(REASON_MESSAGES.playlistNotFound);
  const name = meta.items[0].snippet.title;

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await get<ItemsResp>('playlistItems', {
      part: 'contentDetails', playlistId: listId, maxResults: '50', ...(pageToken ? { pageToken } : {}),
    });
    for (const it of page.items) ids.push(it.contentDetails.videoId);
    pageToken = page.nextPageToken;
    onProgress?.(`Đã đọc ${ids.length} video...`);
  } while (pageToken && ids.length < 5000);

  const unique = [...new Set(ids)];
  const songs: Song[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = await get<VideosResp>('videos', { part: 'snippet,status', id: unique.slice(i, i + 50).join(','), maxResults: '50' });
    for (const v of batch.items) {
      if (v.status.privacyStatus === 'private' || !v.status.embeddable || v.status.uploadStatus !== 'processed') continue;
      const { artist, title } = cleanYouTubeName(v.snippet.title, v.snippet.channelTitle);
      songs.push({
        id: 'yt:' + v.id, title, artist, cover: bestThumb(v.snippet.thumbnails),
        source: { type: 'youtube', videoId: v.id }, startOffsetMs: null,
      });
    }
    onProgress?.(`Đã kiểm tra ${Math.min(i + 50, unique.length)}/${unique.length} video...`);
  }
  if (!songs.length) throw new ImportError('Danh sách không có video nào phát nhúng được.');
  return { id: 'yt:' + listId, name, kind: 'youtube', songs, defaultOffsetMs: 0, bestScore: 0, createdAt: Date.now(), youtubeListId: listId };
}
