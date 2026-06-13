import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the site is served from /<repo>/, so assets need that base.
// Everywhere else (Vercel, local dev, custom domain) it stays at the root.
// The Pages workflow sets GITHUB_PAGES=true at build time.
const base = process.env.GITHUB_PAGES ? '/family-wc2026/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
});
