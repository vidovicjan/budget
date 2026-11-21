import { useEffect, useRef, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { addMonths, monthLabel } from '../lib/dates';

export function MonthSwitch({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  return (
    <div className="month-switch">
      <button type="button" aria-label="Previous month" onClick={() => onChange(addMonths(month, -1))}>
        <Icon name="chevL" strokeWidth={2} />
      </button>
      <span aria-live="polite">{monthLabel(month)}</span>
      <button type="button" aria-label="Next month" disabled={!!max && month >= max} onClick={() => onChange(addMonths(month, 1))}>
        <Icon name="chevR" strokeWidth={2} />
      </button>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: ReactNode; title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="page-title">{title}</h1>
      </div>
      {children && <div className="header-actions">{children}</div>}
    </header>
  );
}

export function SelectBox({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="select-wrap">
      <select {...props} className={`select ${props.className ?? ''}`}>
        {children}
      </select>
      <Icon name="chevD" size={16} strokeWidth={2} />
    </div>
  );
}

/** Accessible dialog: focus moves in, Escape and the backdrop close it, Tab stays inside. */
export function Modal({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const first =
      ref.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.icon-btn)');
    first?.focus();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')].filter((el) => !el.hasAttribute('disabled'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={onKeyDown}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} style={{ width }}>
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={20} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Progress({ value, over, variant }: { value: number; over?: boolean; variant?: 'thin' | 'dark' }) {
  return (
    <div className={`progress ${over ? 'over' : ''} ${variant ?? ''}`} aria-hidden="true">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
