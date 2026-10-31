import type { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { multiplayerAvailable } from '../../config';

/** Dev panel "Phòng" tab. Loads the multiplayer chunk (Firebase) only when opened. */
export function RoomModerationSlot() {
  const [Tab, setTab] = useState<FunctionComponent | null>(null);
  useEffect(() => {
    if (multiplayerAvailable()) void import('../multi/DevRoomTab').then((m) => setTab(() => m.DevRoomTab));
  }, []);
  if (!multiplayerAvailable()) return <p class="hint">Chưa cấu hình Firebase trong src/config.ts.</p>;
  return Tab ? <Tab /> : <p class="muted">Đang tải...</p>;
}
