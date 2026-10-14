import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the built `dist/` folder works from any host path.
  base: './',
  // exceljs (Bulk Import) is a large chunk, but it is only loaded when that feature is used.
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [react()],
});
