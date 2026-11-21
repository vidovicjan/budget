import { useEffect, useState } from 'react';
import type { UpdateState } from '../lib/files';
import { Icon } from './Icon';

/** Live auto-update status from the desktop app; null in the browser build. */
export function useUpdate(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    const d = window.desktop;
    if (!d?.getUpdate) return;
    d.getUpdate().then(setState).catch(() => {});
    return d.onUpdate?.(setState);
  }, []);
  return state;
}

/** Small card in the corner once a new version has downloaded. */
export function UpdateBanner() {
  const u = useUpdate();
  const [hidden, setHidden] = useState<string | null>(null);
  if (!u || u.status !== 'ready' || hidden === u.next) return null;
  return (
    <div className="update-banner" role="status">
      <Icon name="download" size={18} />
      <span className="update-text">
        <strong>Version {u.next} is ready</strong>
        <span>Restart to update. Your data stays as it is.</span>
      </span>
      <button type="button" className="btn btn-dark" onClick={() => window.desktop?.installUpdate?.()}>
        Restart now
      </button>
      <button type="button" className="icon-btn" aria-label="Later" onClick={() => setHidden(u.next ?? '')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
