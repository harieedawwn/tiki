import type { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ROOM_CODE_RE, normalizeRoomCode } from '../core/match';
import type { GameKind, PresetId } from '../core/types';
import { DebugOverlay } from './dev/DebugOverlay';
import { DevPanel } from './dev/DevPanel';
import { useSettings, useStore } from './hooks';
import { IconSettings, IconWrench, IconDownload, Logo } from './icons';
import { installKind, promptInstall, subscribeInstall } from './pwa';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { InstallSheet, Settings } from './screens/Settings';
import { Setup } from './screens/Setup';

export type Route =
  | { name: 'home' }
  | { name: 'setup'; playlistId: string }
  | { name: 'game'; playlistId: string; count: number | 'all'; presetId: PresetId; kind: GameKind; choices: number }
  | { name: 'settings' }
  | { name: 'dev' }
  | { name: 'room'; code: string };

function initialRoute(): Route {
  const code = normalizeRoomCode(new URLSearchParams(location.search).get('room') ?? '');
  return ROOM_CODE_RE.test(code) ? { name: 'room', code } : { name: 'home' };
}

type RoomScreenT = FunctionComponent<{ code: string; go: (r: Route) => void }>;

export function App() {
  const [route, setRoute] = useState<Route>(initialRoute);
  // The multiplayer chunk (Firebase SDK) loads only when a room is opened.
  const [RoomScreen, setRoomScreen] = useState<RoomScreenT | null>(null);
  useEffect(() => {
    if (route.name === 'room' && !RoomScreen) void import('./multi/RoomScreen').then((m) => setRoomScreen(() => m.RoomScreen));
  }, [route.name]);
  const settings = useSettings();
  const install = useStore(subscribeInstall, installKind);
  const [iosSheet, setIosSheet] = useState(false);
  const go = (r: Route) => {
    setRoute(r);
    window.scrollTo(0, 0);
  };

  const inGame = route.name === 'game' || route.name === 'room';
  return (
    <div class="app">
      {!inGame && (
        <header class="topbar">
          <button class="wordmark" onClick={() => go({ name: 'home' })} aria-label="Trang chủ">
            <Logo size={34} />
            Tiki
          </button>
          <div class="topbar-actions">
            {install && (
              <button class="btn btn-small" onClick={() => (install === 'ios' ? setIosSheet(true) : promptInstall())}>
                <IconDownload size={18} /> Cài về máy
              </button>
            )}
            {settings.devUnlocked && (
              <button class="icon-btn" aria-label="Bảng nhà phát triển" onClick={() => go({ name: 'dev' })}><IconWrench /></button>
            )}
            <button class="icon-btn" aria-label="Cài đặt" onClick={() => go({ name: 'settings' })}><IconSettings /></button>
          </div>
        </header>
      )}
      <main key={route.name} class={inGame ? 'screen screen-game' : 'screen'}>
        {route.name === 'home' && <Home go={go} />}
        {route.name === 'setup' && <Setup playlistId={route.playlistId} go={go} />}
        {route.name === 'game' && <Game {...route} go={go} />}
        {route.name === 'settings' && <Settings onIosInstall={() => setIosSheet(true)} />}
        {route.name === 'dev' && <DevPanel go={go} />}
        {route.name === 'room' && (RoomScreen ? <RoomScreen key={route.code} code={route.code} go={go} /> : <p class="status">Đang tải...</p>)}
      </main>
      {iosSheet && <InstallSheet onClose={() => setIosSheet(false)} />}
      {settings.devUnlocked && settings.debugOverlay && <DebugOverlay />}
    </div>
  );
}
