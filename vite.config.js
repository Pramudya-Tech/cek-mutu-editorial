import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production build goes to server/static, where the Python server serves it.
// base './' keeps asset paths relative, so the app also works under a sub-path
// such as https://jurnal.ac.id/cekmutu/.
// During `npm run dev`, API calls are passed to the Python server on port 5000.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'server/static', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:5000' } },
});
