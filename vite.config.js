import { defineConfig } from 'vite';

// Cloudflare Pages serves /c/talks from c/talks.html and /c/ from c/index.html;
// mirror that in dev. (/c/listening is a Pages Function, only run by `npm run pages:dev`.)
const pagesFragments = {
  name: 'pages-fragments',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = req.url.split('?');
      if (path.startsWith('/c/') && !/\.[a-z0-9]+$/i.test(path)) {
        req.url = `${path.endsWith('/') ? `${path}index` : path}.html${query && `?${query}`}`;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [pagesFragments],
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
