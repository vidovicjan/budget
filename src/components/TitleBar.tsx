import { useEffect, useState } from 'react';

type Action = 'minimize' | 'maximize' | 'close';

/** Windows-style title bar in the app's colors: name on the left, caption buttons on the right. */
export function TitleBar() {
  const [focused, setFocused] = useState(() => document.hasFocus());
  const [maximized, setMaximized] = useState(false);
  const desktop = window.desktop;

  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener('focus', on);
    window.addEventListener('blur', off);
    const stop = desktop?.onWindowState?.((s) => {
      setFocused(s.focused);
      setMaximized(s.maximized);
    });
    return () => {
      window.removeEventListener('focus', on);
      window.removeEventListener('blur', off);
      stop?.();
    };
  }, [desktop]);

  const act = (a: Action) => desktop?.windowControl?.(a);

  return (
    <div className={`titlebar ${focused ? '' : 'blurred'}`}>
      <div className="titlebar-side">
        <span className="titlebar-logo" aria-hidden="true">
          <span style={{ height: 4 }} />
          <span style={{ height: 8 }} />
          <span style={{ height: 6 }} />
        </span>
        <span className="titlebar-name">Budget Tracker</span>
      </div>
      <div className="titlebar-fill" />
      {desktop?.windowControl && (
        <div className="caption-buttons">
          <button type="button" className="caption-btn" aria-label="Minimize" title="Minimize" tabIndex={-1} onClick={() => act('minimize')}>
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
              <path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            type="button"
            className="caption-btn"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            title={maximized ? 'Restore Down' : 'Maximize'}
            tabIndex={-1}
            onClick={() => act('maximize')}
          >
            {maximized ? (
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
                <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
              </svg>
            )}
          </button>
          <button type="button" className="caption-btn close" aria-label="Close" title="Close" tabIndex={-1} onClick={() => act('close')}>
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
