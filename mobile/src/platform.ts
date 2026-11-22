import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Gives the shared app code the same `window.desktop` bridge the Electron app has,
 * backed by Android: saved files go through the share sheet (Drive, Files, email…),
 * opened files use the system picker, and price lookups skip the WebView's CORS rules.
 */
export function installPlatform() {
  const native = Capacitor.isNativePlatform();
  document.documentElement.classList.add('mobile', `platform-${Capacitor.getPlatform()}`);

  window.desktop = {
    async saveFile(name, content) {
      if (!native) return downloadInBrowser(name, content);
      const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
      try {
        await Share.share({ title: name, files: [uri], dialogTitle: `Save ${name}` });
        return name;
      } catch (e) {
        // Closing the share sheet is a cancel, not an error.
        if (/cancel/i.test(String((e as Error)?.message ?? e))) return null;
        throw e;
      }
    },

    openFile(exts) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        // Android's picker doesn't know .csv/.json well; MIME types match more files.
        input.accept = [...exts.map((e) => '.' + e), ...exts.map(mimeFor)].join(',');
        input.onchange = async () => {
          const f = input.files?.[0];
          resolve(f ? { name: f.name, content: await f.text() } : null);
        };
        input.oncancel = () => resolve(null);
        input.click();
      });
    },

    async fetchJson(url) {
      const res = await CapacitorHttp.get({ url, headers: { Accept: 'application/json' }, responseType: 'json' });
      if (res.status < 200 || res.status >= 300) throw new Error(`Request failed (${res.status})`);
      return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    },
  };
}

function mimeFor(ext: string) {
  return ext === 'json' ? 'application/json' : ext === 'csv' ? 'text/csv,text/comma-separated-values,text/plain' : '*/*';
}

function downloadInBrowser(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
