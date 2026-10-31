import { useEffect, useRef, useState } from 'preact/hooks';
import { playerName, setPlayerName } from '../../multi/identity';
import { RoomError, joinRoom, leaveRoom } from '../../multi/room';
import { RoomSession } from '../../multi/session';
import type { Route } from '../App';
import { ErrorBox } from '../components';
import { useSettings, useStore } from '../hooks';
import { IconBack, IconShare, IconWifiOff } from '../icons';
import { End } from './End';
import { Lobby } from './Lobby';
import { Match, ModBar } from './Match';
import { permsFor } from './parts';

export function roomLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

async function share(code: string, setMsg: (m: string) => void) {
  const url = roomLink(code);
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Tiki', text: `Vào phòng ${code} chơi Tiki`, url });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setMsg('Đã chép liên kết phòng.');
  } catch {
    setMsg(url);
  }
}

export function RoomScreen({ code, go }: { code: string; go: (r: Route) => void }) {
  const [name, setName] = useState(playerName());
  const [session, setSession] = useState<RoomSession | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const autoJoined = useRef(false);

  const join = async () => {
    const n = name.trim();
    if (!n) return;
    setPlayerName(n);
    setJoining(true);
    setErr(null);
    try {
      await joinRoom(code, n);
      const s = new RoomSession(code);
      s.start();
      setSession(s);
    } catch (e) {
      setErr(e instanceof RoomError ? e.message : 'Không vào được phòng. Kiểm tra mạng.');
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (name.trim() && !autoJoined.current) {
      autoJoined.current = true;
      void join();
    }
  }, [code]);
  useEffect(() => () => session?.stop(), [session]);

  const exit = () => {
    go({ name: 'home' });
  };

  if (!session) {
    return (
      <div class="stack">
        <button class="link-btn" onClick={exit}><IconBack size={18} /> Trang chủ</button>
        <div>
          <p class="kicker">Phòng</p>
          <h1 class="display room-code num">{code}</h1>
        </div>
        <form class="stack-sm" onSubmit={(e) => (e.preventDefault(), join())}>
          <label class="field">Tên của bạn
            <input class="input" value={name} maxLength={24} autocomplete="nickname" onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <button class="btn btn-primary btn-block" type="submit" disabled={!name.trim() || joining}>{joining ? 'Đang vào...' : 'Vào phòng'}</button>
        </form>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
    );
  }
  return <InRoom code={code} session={session} onExit={exit} />;
}

function InRoom({ code, session, onExit }: { code: string; session: RoomSession; onExit: () => void }) {
  const st = useStore((f) => session.subscribe(f), () => session.state);
  const settings = useSettings();
  const [msg, setMsg] = useState<string | null>(null);
  const room = st.room;

  // Back button / leaving the screen without "Rời phòng": still mark the player as gone.
  const left = useRef(false);
  const live = useRef(room);
  live.current = room;
  useEffect(() => () => {
    if (!left.current && live.current?.meta && !session.state.kicked) void leaveRoom(code, live.current.meta.status === 'lobby').catch(() => {});
  }, []);

  const leave = async () => {
    left.current = true;
    if (room?.meta && !st.kicked) await leaveRoom(code, room.meta.status === 'lobby').catch(() => {});
    session.stop();
    onExit();
  };

  if (st.kicked) {
    return (
      <div class="stack">
        <ErrorBox>Bạn đã được mời ra khỏi phòng</ErrorBox>
        <button class="btn btn-block" onClick={() => (session.stop(), onExit())}>Về trang chủ</button>
      </div>
    );
  }
  if (!st.loaded) return <p class="status">Đang kết nối...</p>;
  if (!room?.meta) {
    return (
      <div class="stack">
        <ErrorBox>Phòng {code} không còn tồn tại.</ErrorBox>
        <button class="btn btn-block" onClick={() => (session.stop(), onExit())}>Về trang chủ</button>
      </div>
    );
  }
  const perms = permsFor(room, session.pid, settings.devUnlocked);
  return (
    <div class="stack-sm room">
      {!st.connected && (
        <div class="banner" role="alert"><IconWifiOff size={18} /> Mất kết nối. Đang kết nối lại...</div>
      )}
      <div class="room-bar">
        <button class="icon-btn" aria-label="Rời phòng" onClick={() => confirm('Rời phòng?') && leave()}><IconBack /></button>
        <div class="grow">
          <span class="kicker">Phòng</span>
          <span class="room-code-sm num">{code}</span>
        </div>
        <button class="btn btn-small" onClick={() => share(code, setMsg)}><IconShare size={18} /> Mời</button>
      </div>
      {msg && <p class="hint">{msg}</p>}
      <ModBar code={code} room={room} perms={perms} />
      {room.meta.status === 'lobby' && <Lobby code={code} room={room} perms={perms} />}
      {(room.meta.status === 'playing' || room.meta.status === 'paused') && (
        <Match code={code} room={room} session={session} state={st} perms={perms} />
      )}
      {room.meta.status === 'ended' && <End code={code} room={room} perms={perms} />}
    </div>
  );
}
