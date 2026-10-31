import { useState } from 'preact/hooks';
import { tryUnlockDev, updateSettings } from '../../data/settings';
import { Sheet } from '../components';
import { useSettings, useStore } from '../hooks';
import { IconDownload, IconLock, IconShare, IconPlus } from '../icons';
import { installKind, isStandalone, promptInstall, subscribeInstall } from '../pwa';

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
    <div class="stack">
      <h1 class="display display-sm">Cài đặt</h1>

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
    </div>
  );
}
