import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * In-app replacement for window.confirm / window.alert, styled like the rest of the app.
 *   if (!(await confirmDialog({ title: 'Delete note?', message: '…', confirmLabel: 'Delete', danger: true }))) return;
 * Works from anywhere (pages, dialogs, callbacks); <ConfirmHost /> is mounted once in App.
 */
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red button and trash icon. */
  danger?: boolean;
  /** Only an OK button (an alert). */
  alert?: boolean;
  icon?: 'trash' | 'alert' | 'refresh' | 'userPlus';
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let push: ((p: Pending) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(opts.title));
    push({ ...opts, resolve });
  });
}

export function alertDialog(opts: Omit<ConfirmOptions, 'alert' | 'danger' | 'cancelLabel'>): Promise<void> {
  return confirmDialog({ icon: 'alert', ...opts, alert: true }).then(() => undefined);
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Pending[]>([]);
  useEffect(() => {
    push = (p) => setQueue((q) => [...q, p]);
    return () => {
      push = null;
    };
  }, []);
  const current = queue[0];
  if (!current) return null;
  const done = (ok: boolean) => {
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };
  return <ConfirmView key={queue.length + current.title} opts={current} onDone={done} />;
}

function ConfirmView({ opts, onDone }: { opts: ConfirmOptions; onDone: (ok: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Destructive actions start on Cancel so a stray Enter doesn't delete anything.
    (opts.danger && !opts.alert ? cancelRef.current : okRef.current)?.focus();
    return () => opener?.focus?.();
  }, [opts.danger, opts.alert]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onDone(false);
    } else if (e.key === 'Tab') {
      const items = [cancelRef.current, okRef.current].filter(Boolean) as HTMLElement[];
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
    }
  };

  const icon = opts.icon ?? (opts.danger ? 'trash' : 'alert');
  return (
    <div className="overlay confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onDone(false)} onKeyDown={onKeyDown}>
      <div className="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" ref={ref}>
        <span className={`confirm-icon ${opts.danger ? 'danger' : ''}`} aria-hidden="true">
          <Icon name={icon} size={22} strokeWidth={2} />
        </span>
        <h2 id="confirm-title">{opts.title}</h2>
        {opts.message && (
          <div id="confirm-msg" className="confirm-msg">
            {opts.message}
          </div>
        )}
        <div className="confirm-actions">
          {!opts.alert && (
            <button type="button" ref={cancelRef} className="btn btn-secondary" onClick={() => onDone(false)}>
              {opts.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button type="button" ref={okRef} className={`btn ${opts.danger ? 'btn-destructive' : 'btn-dark'}`} onClick={() => onDone(true)}>
            {opts.confirmLabel ?? (opts.alert ? 'OK' : opts.danger ? 'Delete' : 'Continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
