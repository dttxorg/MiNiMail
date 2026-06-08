import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Code-split the heavy modules so the initial bundle stays small.
        // The settings + compose modals load Quill/DOMPurify on demand, and
        // a separate vendor chunk keeps the long-tail cache stable across
        // app updates.
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('/quill/') || id.includes('/quill-delta/') || id.includes('quill-table')) {
              return 'vendor-quill';
            }
            if (id.includes('/dompurify/')) {
              return 'vendor-sanitizer';
            }
            if (id.includes('/lucide-react/')) {
              return 'vendor-icons';
            }
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
            return 'vendor';
          }
          if (id.includes('/shared/email-ai/')) {
            return 'shared-ai';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
