import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server runs on localhost (not 127.0.0.1) to match Firebase Auth
// authorized domains and the OAuth redirect configuration.
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173
  },
  build: {
    outDir: 'dist'
  }
});
