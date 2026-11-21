/** Auto-update status sent by the desktop app (electron/main.cjs). */
export interface UpdateState {
  status: 'idle' | 'dev' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error';
  /** Version running now. */
  version: string;
  /** Version being downloaded or ready to install. */
  next?: string;
  percent?: number;
  error?: string;
  checkedAt?: number;
}

declare global {
  interface Window {
    desktop?: {
      /** The window has no native title bar; the page draws one. */
      customTitleBar?: boolean;
      windowControl?(action: 'minimize' | 'maximize' | 'close'): void;
      onWindowState?(cb: (s: { maximized: boolean; focused: boolean }) => void): () => void;
      saveFile(name: string, content: string): Promise<string | null>;
      openFile(exts: string[]): Promise<{ name: string; content: string } | null>;
      fetchJson(url: string): Promise<unknown>;
      getUpdate?(): Promise<UpdateState>;
      checkForUpdates?(): Promise<UpdateState>;
      installUpdate?(): void;
      onUpdate?(cb: (s: UpdateState) => void): () => void;
    };
  }
}

/** Saves text with the system save dialog. Returns the path, or null if cancelled. */
export async function saveTextFile(name: string, content: string, mime: string): Promise<string | null> {
  if (window.desktop) return window.desktop.saveFile(name, content);
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** Opens a text file with the system open dialog. Returns null if cancelled. */
export async function openTextFile(exts: string[]): Promise<{ name: string; content: string } | null> {
  if (window.desktop) return window.desktop.openFile(exts);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = exts.map((e) => '.' + e).join(',');
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, content: await f.text() } : null);
    };
    input.click();
  });
}
