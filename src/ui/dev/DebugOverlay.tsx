import { getDebug, subscribeDebug } from '../../audio/debug';
import { useStore } from '../hooks';

export function DebugOverlay() {
  const d = useStore(subscribeDebug, getDebug);
  return (
    <div class="debug num" aria-hidden="true">
      <div>engine {d.engine ?? '-'} · state {d.state ?? '-'}</div>
      <div>start {d.startMs ?? '-'} ms</div>
      <div>clip yêu cầu {d.requestedMs ?? '-'} ms · đo {d.measuredMs ?? '-'} ms</div>
      {d.note && <div>{d.note}</div>}
    </div>
  );
}
