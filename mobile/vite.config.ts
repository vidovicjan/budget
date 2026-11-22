import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Android app reuses the desktop app's code in ../src and adds a phone
// shell (./src). Output goes to www/, which Capacitor copies into android/.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, fs: { allow: ['..'] } },
  build: { outDir: 'www', emptyOutDir: true },
});
