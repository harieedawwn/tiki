import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { serverNow } from '../../multi/firebase';
import { playerId } from '../../multi/identity';
import { ensureSticker, sendEmote } from '../../multi/room';
import type { Room } from '../../multi/types';
import { IconCheck, IconImage, IconSticker, IconTrash, IconX } from '../icons';
import { useBackClose } from '../nav';
import { sfx } from '../sfx';
import { MAX_CUSTOM, PRESET_STICKERS, customStickers, newStickerId, presetSticker, saveCustomStickers, type CustomSticker } from '../stickers';

const COOLDOWN_MS = 1200;
const SHOW_MS = 2800;

/** One sticker, preset or custom (custom images come from /stickers/{pid}). */
function StickerView({ k, pid, room, mine }: { k: string; pid: string; room: Room; mine?: CustomSticker[] }) {
  if (k.startsWith('c:')) {
    const id = k.slice(2);
    const src = room.stickers?.[pid]?.[id] ?? mine?.find((m) => m.id === id)?.data;
    return src ? <img class="sticker-img" src={src} alt="" draggable={false} /> : null;
  }
  const p = presetSticker(k);
  return p ? <>{p.art()}</> : null;
}

/** Floating stickers thrown by everyone in the room. */
export function EmoteLayer({ room }: { room: Room }) {
  const seen = useRef(new Set<string>());
  const [shown, setShown] = useState<{ key: string; k: string; pid: string; x: number; tilt: number }[]>([]);
  useEffect(() => {
    const now = serverNow();
    const fresh = Object.entries(room.emotes ?? {}).filter(([key, e]) => !seen.current.has(key) && e?.k && e.at > now - 4000);
    if (!fresh.length) return;
    fresh.forEach(([key]) => seen.current.add(key));
    const add = fresh.slice(-6).map(([key, e]) => ({ key, k: e.k, pid: e.pid, x: 8 + Math.random() * 64, tilt: Math.round(Math.random() * 16 - 8) }));
    setShown((s) => [...s, ...add].slice(-10));
    sfx.pop();
    const keys = new Set(add.map((a) => a.key));
    setTimeout(() => setShown((s) => s.filter((x) => !keys.has(x.key))), SHOW_MS + 100);
  }, [room.emotes]);
  return (
    <div class="emote-layer" aria-hidden="true">
      {shown.map((e) => (
        <div key={e.key} class="emote-fly" style={{ left: e.x + '%', '--tilt': e.tilt + 'deg' }}>
          <div class="emote-art"><StickerView k={e.k} pid={e.pid} room={room} mine={e.pid === playerId() ? customStickers() : undefined} /></div>
          <span class="emote-name">{room.players?.[e.pid]?.name ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

/** The sticker button and its tray (presets, your images, "Thêm ảnh"). */
export function EmoteDock({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<CustomSticker[]>(customStickers);
  const [editing, setEditing] = useState(false);
  const [crop, setCrop] = useState<string | null>(null);
  const [cool, setCool] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const send = async (k: string, custom?: CustomSticker) => {
    if (Date.now() < cool) return;
    setCool(Date.now() + COOLDOWN_MS);
    setTimeout(() => setCool(0), COOLDOWN_MS);
    setOpen(false);
    try {
      if (custom) await ensureSticker(code, custom.id, custom.data);
      await sendEmote(code, k);
    } catch {
      /* offline: the sticker simply does not appear */
    }
  };
  const pick = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return setErr('Hãy chọn một tệp ảnh.');
    setErr(null);
    setCrop(URL.createObjectURL(f));
  };
  const saved = (data: string) => {
    const next = [{ id: newStickerId(), data }, ...mine].slice(0, MAX_CUSTOM);
    if (!saveCustomStickers(next)) setErr('Bộ nhớ trình duyệt đã đầy, xoá bớt ảnh cũ.');
    else setMine(next);
    setCrop(null);
  };
  const remove = (id: string) => {
    const next = mine.filter((m) => m.id !== id);
    saveCustomStickers(next);
    setMine(next);
  };

  return (
    <>
      <button class={'emote-btn' + (cool ? ' cooling' : '')} aria-label="Thả sticker" data-sfx="none"
        onClick={() => (sfx.open(), setOpen(true), setEditing(false), setErr(null))}>
        <IconSticker size={26} />
        {cool > 0 && <span class="emote-cool" style={{ animationDuration: COOLDOWN_MS + 'ms' }} />}
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
      {open && !crop && <Tray onClose={() => setOpen(false)}>
        <div class="tray-head">
          <h2 class="sheet-title grow">Thả sticker</h2>
          {mine.length > 0 && (
            <button class={'chip' + (editing ? ' chip-on' : '')} onClick={() => setEditing(!editing)}>
              {editing ? <><IconCheck size={16} /> Xong</> : <><IconTrash size={16} /> Sửa</>}
            </button>
          )}
        </div>
        <div class="sticker-grid">
          {PRESET_STICKERS.map((p, i) => (
            <button key={p.id} class="sticker" aria-label={p.label} style={{ animationDelay: i * 22 + 'ms' }} disabled={editing}
              onClick={() => send(p.id)} data-sfx="none">{p.art()}</button>
          ))}
          {mine.map((m, i) => (
            <button key={m.id} class={'sticker sticker-custom' + (editing ? ' editing' : '')} aria-label={editing ? 'Xoá ảnh này' : 'Sticker của bạn'}
              style={{ animationDelay: (PRESET_STICKERS.length + i) * 22 + 'ms' }}
              onClick={() => (editing ? remove(m.id) : send('c:' + m.id, m))} data-sfx="none">
              <img class="sticker-img" src={m.data} alt="" draggable={false} />
              {editing && <span class="sticker-del"><IconX size={16} /></span>}
            </button>
          ))}
          {mine.length < MAX_CUSTOM && !editing && (
            <button class="sticker sticker-add" onClick={() => file.current?.click()}>
              <IconImage size={26} /><span>Thêm ảnh</span>
            </button>
          )}
        </div>
        {err && <p class="error-text">{err}</p>}
      </Tray>}
      {crop && <CropSheet src={crop} onDone={saved} onClose={() => (URL.revokeObjectURL(crop), setCrop(null))} />}
    </>
  );
}

function Tray({ onClose, children }: { onClose: () => void; children: ComponentChildren }) {
  useBackClose(onClose);
  return (
    <div class="scrim scrim-light" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet sheet-auto tray" role="dialog" aria-label="Thả sticker">
        <span class="sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

const OUT = 160;

/** Square (1:1) crop like setting an avatar: drag to move, slider or wheel/pinch to zoom. */
function CropSheet({ src, onDone, onClose }: { src: string; onDone: (data: string) => void; onClose: () => void }) {
  useBackClose(onClose);
  const view = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [V, setV] = useState(280);
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setErr('Không mở được ảnh này.');
    i.src = src;
    if (view.current) setV(view.current.clientWidth);
  }, [src]);

  const base = img ? Math.max(V / img.naturalWidth, V / img.naturalHeight) : 1;
  const s = base * zoom;
  const clamp = (o: { x: number; y: number }, z = zoom) => {
    if (!img) return o;
    const sc = base * z;
    const mx = Math.max(0, (img.naturalWidth * sc - V) / 2), my = Math.max(0, (img.naturalHeight * sc - V) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const setZ = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    setZoom(nz);
    setOff((o) => clamp(o, nz));
  };

  const down = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
      drag.current = null;
    } else drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const move = (e: PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      setZ(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
    } else if (drag.current) {
      const d = drag.current;
      setOff(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
    }
  };
  const up = (e: PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (!pts.current.size) drag.current = null;
  };

  const save = () => {
    if (!img) return;
    const left = V / 2 - (img.naturalWidth * s) / 2 + off.x;
    const top = V / 2 - (img.naturalHeight * s) / 2 + off.y;
    const c = document.createElement('canvas');
    c.width = c.height = OUT;
    const g = c.getContext('2d');
    if (!g) return setErr('Trình duyệt không hỗ trợ cắt ảnh.');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, -left / s, -top / s, V / s, V / s, 0, 0, OUT, OUT);
    let data = c.toDataURL('image/webp', 0.82);
    if (!data.startsWith('data:image/webp') || data.length > 60000) data = c.toDataURL('image/jpeg', 0.82);
    URL.revokeObjectURL(src);
    onDone(data);
  };

  return (
    <div class="scrim">
      <div class="sheet sheet-auto crop-sheet" role="dialog" aria-label="Cắt ảnh">
        <span class="sheet-grip" aria-hidden="true" />
        <div class="tray-head">
          <h2 class="sheet-title grow">Cắt ảnh vuông</h2>
          <button class="icon-btn" aria-label="Huỷ" onClick={onClose}><IconX /></button>
        </div>
        <div ref={view} class="crop-view" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onWheel={(e) => (e.preventDefault(), setZ(zoom * (e.deltaY < 0 ? 1.08 : 0.93)))}>
          {img && (
            <img src={src} alt="" draggable={false} style={{
              width: img.naturalWidth * s + 'px', height: img.naturalHeight * s + 'px',
              transform: `translate(${V / 2 - (img.naturalWidth * s) / 2 + off.x}px, ${V / 2 - (img.naturalHeight * s) / 2 + off.y}px)`,
            }} />
          )}
          <span class="crop-frame" aria-hidden="true" />
        </div>
        <label class="field">
          <span class="row"><span class="grow">Phóng to</span><span class="num muted">{zoom.toFixed(1)}x</span></span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onInput={(e) => setZ(Number(e.currentTarget.value))} />
        </label>
        <p class="hint">Kéo ảnh để chọn phần muốn giữ.</p>
        {err && <p class="error-text">{err}</p>}
        <button class="btn btn-primary btn-block" disabled={!img} onClick={save}><IconCheck size={18} /> Lưu sticker</button>
      </div>
    </div>
  );
}
