import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
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
