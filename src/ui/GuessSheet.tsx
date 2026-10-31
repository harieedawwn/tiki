import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { buildIndex, findExactTitle, search, type SearchIndexEntry } from '../core/text';
import type { Song } from '../core/types';
import { Cover } from './components';
import { useVisualViewport } from './hooks';
import { IconSearch, IconX } from './icons';

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

/** Bottom sheet (~70% of the screen) with pinned search, alphabetical grid and a "Chốt" button. */
export function GuessSheet({ songs, wrong = [], disabled, disabledLabel, onSubmit, onClose }: Props) {
  const index = indexFor(songs);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const results = useMemo(() => search(index, q), [index, q]);
  const vv = useVisualViewport();
  const input = useRef<HTMLInputElement>(null);
  const height = Math.min(Math.round(window.innerHeight * 0.7), vv.height - 8);
  const top = vv.top + vv.height - height;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet guess-sheet" role="dialog" aria-label="Đoán bài hát" style={{ top: top + 'px', height: height + 'px' }}>
        <div class="guess-head">
          <label class="search">
            <IconSearch size={20} />
            <input ref={input} type="search" enterKeyHint="go" autocomplete="off" autocorrect="off" spellcheck={false}
              placeholder="Tìm tên bài hoặc ca sĩ" value={q}
              onInput={(e) => setQ(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onEnter())} />
          </label>
          <button class="icon-btn" aria-label="Đóng" onClick={onClose}><IconX /></button>
        </div>
        <div class="guess-count num">{results.length} / {songs.length} bài</div>
        <div class="guess-grid" role="listbox" aria-label="Danh sách bài hát">
          {results.map((s) => (
            <button key={s.id} role="option" aria-selected={sel === s.id}
              class={'tile' + (sel === s.id ? ' selected' : '') + (wrong.includes(s.id) ? ' wrong' : '')}
              onClick={() => setSel(s.id)} onDblClick={() => submit(s.id)}>
              <span class="tile-title">{s.title}</span>
              <Cover song={s} />
              <span class="tile-artist">{s.artist || ' '}</span>
            </button>
          ))}
          {!results.length && <p class="muted pad">Không có bài nào khớp.</p>}
        </div>
        <div class="guess-foot">
          <button class="btn btn-primary btn-block" disabled={!sel || disabled} onClick={() => submit(sel)}>
            {disabled && disabledLabel ? disabledLabel : 'Chốt'}
          </button>
        </div>
      </div>
    </div>
  );
}
