import { useState } from 'preact/hooks';
import { THEMES, tryUnlockDev, updateSettings } from '../../data/settings';
import { Sheet } from '../components';
import { useSettings, useStore } from '../hooks';
import { IconCheck, IconDownload, IconHeart, IconLock, IconPalette, IconPlus, IconShare, IconVolume, IconVolumeOff } from '../icons';
import { installKind, isStandalone, promptInstall, subscribeInstall } from '../pwa';
import { sfx } from '../sfx';

export function InstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Cài Tiki lên iPhone/iPad" onClose={onClose}>
      <ol class="steps">
        <li>Mở trang này bằng <b>Safari</b>.</li>
        <li>Bấm nút <b>Chia sẻ</b> <IconShare size={18} /> ở thanh dưới.</li>
        <li>Chọn <b>Thêm vào MH chính</b> <IconPlus size={18} />.</li>
        <li>Mở Tiki từ biểu tượng mới trên màn hình chính.</li>
      </ol>
      <button class="btn btn-primary btn-block" onClick={onClose}>Đã hiểu</button>
    </Sheet>
  );
}

export function Settings({ onIosInstall }: { onIosInstall: () => void }) {
  const s = useSettings();
  const install = useStore(subscribeInstall, installKind);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const unlock = async (e: Event) => {
    e.preventDefault();
    const ok = await tryUnlockDev(code);
    setMsg(ok ? null : 'Mã không đúng.');
    if (ok) setCode('');
  };

  return (
    <div class="stack settings">
      <h1 class="title-lg">Cài đặt</h1>

      <section class="card stack-sm">
        <h2 class="section-title"><span class="section-icon"><IconPalette size={20} /></span> Màu giao diện</h2>
        <div class="themes" role="radiogroup" aria-label="Màu giao diện">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={s.theme === t.id} class={'theme' + (s.theme === t.id ? ' on' : '')}
              onClick={() => updateSettings({ theme: t.id })}>
              <span class="theme-swatch" style={{ background: t.bg }}>
                <i style={{ background: t.surface }} />
                <i style={{ background: t.accent }} />
                <i style={{ background: t.good }} />
                {s.theme === t.id && <span class="theme-check" style={{ color: t.accent }}><IconCheck size={16} /></span>}
              </span>
              <span class="theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section class="card stack-sm">
        <h2 class="section-title"><span class="section-icon">{s.sfx ? <IconVolume size={20} /> : <IconVolumeOff size={20} />}</span> Âm thanh giao diện</h2>
        <label class="switch-row">
          <span class="grow">Tiếng bấm, đúng/sai, đếm ngược</span>
          <input type="checkbox" class="switch" checked={s.sfx}
            onChange={(e) => (updateSettings({ sfx: e.currentTarget.checked }), sfx.toggle(e.currentTarget.checked))} />
        </label>
        <label class="field">
          <span class="row"><span class="grow">Âm lượng</span><span class="num muted">{Math.round(s.sfxVolume * 100)}%</span></span>
          <input type="range" min={0} max={1} step={0.05} value={s.sfxVolume} disabled={!s.sfx}
            onInput={(e) => updateSettings({ sfxVolume: Number(e.currentTarget.value) })} onChange={() => sfx.correct()} />
        </label>
      </section>

      <section class="card stack-sm">
        <h2 class="section-title">Ứng dụng</h2>
        {isStandalone() ? (
          <p class="muted">Tiki đang chạy như ứng dụng đã cài.</p>
        ) : install ? (
          <button class="btn btn-block" onClick={() => (install === 'ios' ? onIosInstall() : promptInstall())}>
            <IconDownload size={18} /> Cài về máy
          </button>
        ) : (
          <p class="muted">Trình duyệt này chưa cho phép cài trực tiếp. Hãy dùng menu của trình duyệt (Thêm vào màn hình chính).</p>
        )}
      </section>

      <section class="card stack-sm">
        <h2 class="section-title">Nhà phát triển</h2>
        {s.devUnlocked ? (
          <div class="row">
            <p class="grow">Đã mở khoá chế độ nhà phát triển. Nút công cụ nằm trên thanh đầu trang.</p>
            <button class="btn" onClick={() => updateSettings({ devUnlocked: false, debugOverlay: false })}>
              <IconLock size={18} /> Khoá lại
            </button>
          </div>
        ) : (
          <form class="row" onSubmit={unlock}>
            <input class="input grow" type="password" autocomplete="off" placeholder="Mã nhà phát triển" aria-label="Mã nhà phát triển"
              value={code} onInput={(e) => setCode(e.currentTarget.value)} />
            <button class="btn" type="submit" disabled={!code}>Mở khoá</button>
          </form>
        )}
        {msg && <p class="error-text">{msg}</p>}
      </section>

      <p class="credit"><IconHeart size={14} /> by Harie Dawn :3</p>
    </div>
  );
}
