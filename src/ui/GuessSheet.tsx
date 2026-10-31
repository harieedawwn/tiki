import { useEffect, useMemo, useState } from 'preact/hooks';
import { buildIndex, findExactTitle, search, searchArtists, songsByArtist, type ArtistHit, type SearchIndexEntry } from '../core/text';
import type { Song } from '../core/types';
import { Cover } from './components';
import { useVisualViewport } from './hooks';
import { IconCheck, IconSearch, IconUser, IconX } from './icons';
import { useBackClose } from './nav';
import { sfx } from './sfx';

const indexCache = new WeakMap<Song[], SearchIndexEntry[]>();
function indexFor(songs: Song[]) {
  let idx = indexCache.get(songs);
  if (!idx) indexCache.set(songs, (idx = buildIndex(songs)));
  return idx;
}

interface Props {
  songs: Song[];
  /** Song ids already guessed wrong this round (shown struck through). */
  wrong?: string[];
  disabled?: boolean;
  disabledLabel?: string;
  onSubmit: (songId: string) => void;
  onClose: () => void;
}

/** Keeps sheets above the on-screen keyboard: ~72% of the visible viewport. */
function useSheetBox(frac = 0.72) {
  const vv = useVisualViewport();
  const height = Math.min(Math.round(window.innerHeight * frac), vv.height - 8);
  return { top: vv.top + vv.height - height, height };
}

function useEscape(onClose: () => void) {
  useBackClose(onClose);
  useEffect(() => {
    sfx.open();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Bottom sheet with smart search (typos, artists), a cover grid and a "Chốt" button. */
export function GuessSheet({ songs, wrong = [], disabled, disabledLabel, onSubmit, onClose }: Props) {
  const index = indexFor(songs);
  const [q, setQ] = useState('');
  const [artist, setArtist] = useState<ArtistHit | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const results = useMemo(() => (artist ? songsByArtist(index, artist.key) : search(index, q)), [index, q, artist]);
  const artists = useMemo(() => (artist ? [] : searchArtists(index, q, 5)), [index, q, artist]);
  const box = useSheetBox();
  useEscape(onClose);

  const submit = (id: string | null) => {
    if (!id || disabled) return;
    onSubmit(id);
  };
  const onEnter = () => {
    const exact = findExactTitle(index, q);
    if (exact.length) return submit((exact.find((s) => s.id === sel) ?? exact[0]).id);
    if (sel) return submit(sel);
    if (results.length === 1) setSel(results[0].id);
  };
  const wrongKey = wrong.join('|');
  const grid = useMemo(() => (
    <div class="guess-grid" role="listbox" aria-label="Danh sách bài hát">
      {results.map((s, i) => (
        <button key={s.id} role="option" aria-selected={sel === s.id} style={i < 18 ? { animationDelay: i * 18 + 'ms' } : undefined}
          class={'tile' + (sel === s.id ? ' selected' : '') + (wrong.includes(s.id) ? ' wrong' : '')}
          onClick={() => setSel(s.id)} onDblClick={() => submit(s.id)}>
          <span class="tile-art"><Cover song={s} eager={i < 15} />{sel === s.id && <span class="tile-check"><IconCheck size={16} /></span>}</span>
          <span class="tile-title">{s.title}</span>
          <span class="tile-artist">{s.artist || ' '}</span>
        </button>
      ))}
      {!results.length && <p class="muted pad">Không có bài nào khớp. Thử gõ ít chữ hơn.</p>}
    </div>
  ), [results, sel, wrongKey, disabled]);

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet guess-sheet" role="dialog" aria-label="Đoán bài hát" style={{ top: box.top + 'px', height: box.height + 'px' }}>
        <span class="sheet-grip" aria-hidden="true" />
        <div class="guess-head">
          <label class="search">
            <IconSearch size={20} />
            <input type="search" enterKeyHint="go" autocomplete="off" autocorrect="off" spellcheck={false}
              placeholder="Tên bài hoặc ca sĩ, gõ sai vẫn được" value={q}
              onInput={(e) => (setQ(e.currentTarget.value), setArtist(null))}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onEnter())} />
            {q && <button class="search-clear" aria-label="Xoá" onClick={() => (setQ(''), setArtist(null))}><IconX size={18} /></button>}
          </label>
          <button class="icon-btn" aria-label="Đóng" onClick={onClose}><IconX /></button>
        </div>
        {(artists.length > 0 || artist) && (
          <div class="artist-row" role="group" aria-label="Ca sĩ">
            {artist ? (
              <button class="chip chip-on" onClick={() => setArtist(null)}>
                <IconUser size={16} /> {artist.name} <IconX size={14} />
              </button>
            ) : artists.map((a) => (
              <button key={a.key} class="chip" onClick={() => (setArtist(a), setSel(null))}>
                <IconUser size={16} /> {a.name} <span class="chip-count num">{a.count}</span>
              </button>
            ))}
          </div>
        )}
        <div class="guess-count num">{artist ? 'Các bài của ca sĩ này' : q ? 'Kết quả' : 'Tất cả'} · {results.length} / {songs.length} bài</div>
        {grid}
        <div class="guess-foot">
          <button class="btn btn-primary btn-block" disabled={!sel || disabled} onClick={() => submit(sel)}>
            {disabled && disabledLabel ? disabledLabel : 'Chốt'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Nghe nhạc, chọn ảnh": covers only, no names and no search. */
export function CoverPicker({ songs, wrong = [], disabled, disabledLabel, onSubmit, onClose }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const box = useSheetBox(0.78);
  useEscape(onClose);
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet guess-sheet" role="dialog" aria-label="Chọn ảnh bìa" style={{ top: box.top + 'px', height: box.height + 'px' }}>
        <span class="sheet-grip" aria-hidden="true" />
        <div class="guess-head">
          <h2 class="sheet-title grow">Ảnh bìa nào?</h2>
          <button class="icon-btn" aria-label="Đóng" onClick={onClose}><IconX /></button>
        </div>
        <div class="cover-grid" role="listbox" aria-label="Ảnh bìa">
          {songs.map((s, i) => (
            <button key={s.id} role="option" aria-selected={sel === s.id} aria-label={`Ảnh ${i + 1}`} style={{ animationDelay: Math.min(i, 24) * 14 + 'ms' }}
              class={'cover-opt' + (sel === s.id ? ' selected' : '') + (wrong.includes(s.id) ? ' wrong' : '')}
              disabled={wrong.includes(s.id)} onClick={() => setSel(s.id)} onDblClick={() => !disabled && onSubmit(s.id)}>
              <Cover song={s} anonymous eager={i < 20} />
              {sel === s.id && <span class="tile-check"><IconCheck size={16} /></span>}
              {wrong.includes(s.id) && <span class="cover-x"><IconX size={28} /></span>}
            </button>
          ))}
        </div>
        <div class="guess-foot">
          <button class="btn btn-primary btn-block" disabled={!sel || disabled} onClick={() => sel && onSubmit(sel)}>
            {disabled && disabledLabel ? disabledLabel : 'Chốt ảnh này'}
          </button>
        </div>
      </div>
    </div>
  );
}
