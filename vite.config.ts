import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// A strict Content Security Policy for the packaged app. Dev mode skips it
// because the React refresh preamble is an inline script.
const csp: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'">`
    );
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), csp],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
