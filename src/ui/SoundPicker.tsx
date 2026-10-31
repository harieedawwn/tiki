import type { CSSProperties } from 'preact';
import { IconCheck, IconPlay, IconVolume, IconX } from './icons';

export interface SoundOption {
  id: string;
}

/**
 * "Xem ảnh, chọn nhạc": numbered clip buttons. Tapping plays the clip and selects it; "Chốt" submits.
 * `playing`/`loading` are option indexes; `progress` restarts the ring animation per play.
 */
export function SoundPicker({ options, sel, playing, loading, wrong, disabled, clipMs, playKey, onPick, onSubmit }: {
  options: SoundOption[]; sel: number | null; playing: number | null; loading: number | null; wrong: string[];
  disabled?: boolean; clipMs: number; playKey: number;
  onPick: (i: number) => void; onSubmit: () => void;
}) {
  return (
    <div class="stack-sm">
      <div class="sound-grid" role="listbox" aria-label="Các đoạn nhạc" data-sfx="none">
        {options.map((o, i) => {
          const isWrong = wrong.includes(o.id);
          return (
            <button key={o.id} role="option" aria-selected={sel === i} disabled={isWrong} aria-label={`Đoạn số ${i + 1}`}
              style={{ animationDelay: i * 25 + 'ms' } as CSSProperties}
              class={'sound-opt' + (sel === i ? ' selected' : '') + (playing === i ? ' playing' : '') + (loading === i ? ' loading' : '') + (isWrong ? ' wrong' : '')}
              onClick={() => onPick(i)}>
              <span class="sound-num num">{i + 1}</span>
              <span class="sound-ico">{isWrong ? <IconX size={18} /> : playing === i ? <IconVolume size={18} /> : sel === i ? <IconCheck size={18} /> : <IconPlay size={16} />}</span>
              {playing === i && <span key={playKey} class="sound-progress" style={{ animationDuration: clipMs + 'ms' }} />}
            </button>
          );
        })}
      </div>
      <button class="btn btn-primary btn-block btn-lg" disabled={sel === null || disabled} onClick={onSubmit}>
        {sel === null ? 'Chạm một số để nghe' : `Chốt đoạn số ${sel + 1}`}
      </button>
    </div>
  );
}
