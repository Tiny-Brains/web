import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// With its attribute: this file is checked under nodenext resolution, which takes a JSON module
// only as one, and the data is shared with the app, which imports it under the bundler's.
import changelog from './copy/changelog.json' with { type: 'json' }

// The whole auth flow depends on this proxy.
//
// Soma sets `soma_session` as an HttpOnly cookie with no Domain attribute, so the
// cookie belongs to whichever host the browser thinks answered. Proxying /v1 to
// orion-server means the browser only ever sees origin localhost:5173: the cookie
// is set on localhost, sent back on every /v1 call, and there is no cross-origin
// request to need CORS for. Calling http://localhost:8080 directly instead would
// need CORS with credentials, and Orion answers `access-control-allow-origin: *`,
// which browsers refuse to combine with credentials.
//
// It also means the OAuth callback URL registered with GitHub is a localhost:5173
// URL, which is the one place GitHub's redirect and the cookie's host must agree.
export default defineConfig({
  plugins: [react(), book(), feed(), sitemap()],
  build: {
    rollupOptions: {
      output: {
        // REACT AND THE ROUTER IN THEIR OWN CHUNK. They change when a dependency is upgraded;
        // everything else here changes when a paragraph is reworded, and a returning reader
        // should not re-download 40 KB of framework for a comma.
        // The function form, not the `{ vendor: [...] }` map: this Rollup takes only a function.
        manualChunks(id: string) {
          return /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)
            ? 'vendor'
            : undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
        // Orion answers the OAuth endpoints with a 302; the proxy must hand that
        // back to the browser rather than chase it, or the redirect to github.com
        // would be followed server-side and the state cookie never set.
        followRedirects: false,
      },
    },
  },
})

// WHAT'S NEW, AS A FEED. /feed.xml is the entries in copy/changelog.json as RSS, written into the
// bundle at build time and served by the dev server from the same source, so the two can never
// disagree ABOUT AN ENTRY. The /changelog page carries more than the feed does -- it reads each
// season's opening and closing from the API, which a file cannot know and a build cannot bake
// in -- so the feed is the dated entries and the page is those plus the seasons. The feed's own
// title and description are in the same file, under `feed`.
//
// Links are written as paths: this bundle knows no host, and nginx.conf's /feed.xml location
// makes them absolute per request, the way it does for the unfurl image and the sitemap.
function feed(): Plugin {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const rss = () =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0"><channel>',
      `<title>${esc(changelog.feed.title)}</title>`,
      '<link>/changelog</link>',
      `<description>${esc(changelog.feed.description)}</description>`,
      ...changelog.entries.map((e) =>
        [
          '<item>',
          `<title>${esc(e.title)}</title>`,
          `<link>${esc(e.href && e.href.startsWith('http') ? e.href : '/changelog')}</link>`,
          `<guid isPermaLink="false">${esc(`${e.date}:${e.title}`)}</guid>`,
          `<pubDate>${new Date(`${e.date}T12:00:00Z`).toUTCString()}</pubDate>`,
          `<description>${esc(e.body)}</description>`,
          '</item>',
        ].join(''),
      ),
      '</channel></rss>',
      '',
    ].join('\n')
  return {
    name: 'tinybrains:feed',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'feed.xml', source: rss() })
    },
    configureServer(server) {
      server.middlewares.use('/feed.xml', (_req, res) => {
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
        res.end(rss())
      })
    },
  }
}

// THE STATIC ROUTES, AS A SITEMAP. Without one, /sitemap.xml and /robots.txt both fell through
// the SPA rule and answered index.html with a 200 -- a crawler asking what to index was handed the
// application. Only the pages whose address is fixed are listed: a version, a match and a profile
// are reachable by crawling from the ladder and the match list, and their ids belong to one
// deployment. Links are PATHS, as the feed's are, because this bundle knows no host; nginx.conf
// makes them absolute per request.
function sitemap(): Plugin {
  const PATHS = [
    '/', '/leaderboard', '/matches', '/submit',
    '/start', '/faq', '/changelog', '/status', '/docs',
  ]
  const xml = () =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...PATHS.map((p) => `<url><loc>${p}</loc></url>`),
      '</urlset>',
      '',
    ].join('\n')
  return {
    name: 'tinybrains:sitemap',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml() })
    },
    configureServer(server) {
      server.middlewares.use('/sitemap.xml', (_req, res) => {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8')
        res.end(xml())
      })
    },
  }
}

// THE BOOK AT /docs, the way nginx.conf serves it. The competitor guide is docs/ in this
// repository and its rendered pages are docs/book, which mdBook writes and .gitignore
// keeps out of git -- so this serves whatever the last `mdbook build` produced. Same
// rules as the nginx location: `$uri.html` first (the site's links are extensionless and
// /docs/models/adapters is both a page and a section), then the file, then the
// directory's index; a missing page is the book's own 404 with a 404 status.
//
// THIS IS ALSO THE BOOK'S OWN PREVIEW. docs/book.toml sets site-url = "/docs/" and the
// theme links the application's stylesheet at /design-system/tokens.css, both of which
// assume the application's origin -- so `npm run dev` renders the book the way a reader
// gets it and `mdbook serve` does not. Build the book, then read it here.
//
// Dev server only: `configureServer` does not run for a build, and the image takes the
// book from its own artifact image rather than from here.
function book(): Plugin {
  const dir = fileURLToPath(new URL('./docs/book', import.meta.url))
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.txt': 'text/plain; charset=utf-8',
  }
  const file = (p: string) => existsSync(p) && statSync(p).isFile()

  return {
    name: 'tinybrains:book',
    configureServer(server) {
      server.middlewares.use('/docs', (req, res, next) => {
        if (!file(join(dir, 'index.html'))) return next()

        const [rawPath, query] = (req.url ?? '/').split('?')
        const path = decodeURIComponent(rawPath)
        const want = resolve(dir, `.${path}`)
        if (!want.startsWith(dir)) return next()

        const found = [`${want}.html`, want, join(want, 'index.html')].find(file)

        // A DIRECTORY'S INDEX IS ANSWERED AT THE TRAILING SLASH, as nginx's `$uri/` does with a
        // 301. Served at /docs, the book's index page resolves its relative stylesheet and
        // script links against the site root, and the page is white.
        const original = (req.originalUrl ?? req.url ?? '').split('?')[0]
        if (found === join(want, 'index.html') && !original.endsWith('/')) {
          res.statusCode = 301
          res.setHeader('Location', `${original}/${query ? `?${query}` : ''}`)
          res.end()
          return
        }

        const target = found ?? join(dir, '404.html')
        if (!found && !file(target)) return next()

        res.statusCode = found ? 200 : 404
        res.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream')
        createReadStream(target).pipe(res)
      })
    },
  }
}
