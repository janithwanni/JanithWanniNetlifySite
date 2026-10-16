import { defineConfig } from 'vite';

export default defineConfig({
  // Only the shell is an entry; don't crawl the Quarto output or fragments.
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/content/**'] } },
  build: {
    modulePreload: { polyfill: false },
    rolldownOptions: {
      // htmx ships an eval() path; it's disabled via htmx-config allowEval:false.
      onLog: (level, log, handler) => log.code !== 'EVAL' && handler(level, log),
    },
  },
});
