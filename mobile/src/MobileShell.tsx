import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Logo } from '../../src/components/Icon';

/**
 * Phone frame around the app: a top bar with a menu button, and the app's sidebar
 * turned into a slide-in drawer (see mobile.css). Also handles the Android back button.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    document.documentElement.classList.toggle('nav-open', open);
  }, [open]);

  // Picking a page in the drawer closes it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('.sidebar .nav-item, .sidebar .btn-ghost-dark')) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    const sub = CapApp.addListener('backButton', () => {
      // 1. Close the top dialog (dialogs close on Escape).
      const overlay = document.querySelector('.confirm-overlay') ?? [...document.querySelectorAll('.overlay')].pop();
      if (overlay) {
        (overlay.querySelector('.modal') ?? overlay).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      // 2. Close the menu.
      if (openRef.current) return setOpen(false);
      // 3. Go back to Overview, 4. then leave the app.
      const items = document.querySelectorAll<HTMLElement>('.sidebar .nav-item');
      if (items.length && items[0].getAttribute('aria-current') !== 'page') return items[0].click();
      CapApp.minimizeApp();
    });
    return () => {
      sub.then((s) => s.remove());
    };
  }, []);

  return (
    <div className="m-shell">
      <header className="m-bar">
        <button type="button" className="m-menu" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="m-brand">
          <Logo />
          Budget Tracker
        </span>
      </header>
      {children}
      <div className="m-scrim" aria-hidden="true" onClick={() => setOpen(false)} />
    </div>
  );
}
