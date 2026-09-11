import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  plugins: [react(), book()],
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

// THE BOOK AT /docs, the way nginx.conf serves it. The competitor guide is a sibling
// repository whose rendered pages the compose image mounts at /docs/; without this the
// dev server answered every Docs link with the SPA, so a page read on localhost and the
// same page read on 127.0.0.1 disagreed about whether the book existed. Same rules as
// the nginx location: `$uri.html` first (the site's links are extensionless and
// /docs/models/adapters is both a page and a section), then the file, then the
// directory's index; a missing page is the book's own 404 with a 404 status. With no
// book built at all the request falls through to the SPA, whose /docs/* route says so.
//
// Dev server only: `configureServer` does not run for a build, and the image takes the
// book from the deployment, not from here.
function book(): Plugin {
  const dir = fileURLToPath(new URL('../docs/book', import.meta.url))
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

        const path = decodeURIComponent((req.url ?? '/').split('?')[0])
        const want = resolve(dir, `.${path}`)
        if (!want.startsWith(dir)) return next()

        const found = [`${want}.html`, want, join(want, 'index.html')].find(file)
        const target = found ?? join(dir, '404.html')
        if (!found && !file(target)) return next()

        res.statusCode = found ? 200 : 404
        res.setHeader('Content-Type', types[extname(target)] ?? 'application/octet-stream')
        createReadStream(target).pipe(res)
      })
    },
  }
}
