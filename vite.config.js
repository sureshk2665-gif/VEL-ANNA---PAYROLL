import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the built `dist/` folder works from any host path.
  base: './',
  plugins: [react()],
});
