import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build only: Vite's dev server needs an inline script and a websocket this policy would block.
// The app makes no network calls, so connect-src 'none' stops injected code from sending athlete data out.
// style-src-attr allows style attributes only (the Review stage's layout uses them); style sheets stay restricted,
// and a style attribute cannot fetch anything because img-src and connect-src block outside addresses.
const csp = {
  name: 'racm-csp',
  apply: 'build',
  transformIndexHtml: () => [{
    tag: 'meta',
    attrs: {
      'http-equiv': 'Content-Security-Policy',
      content: "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src blob:; manifest-src 'self'; worker-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    },
    injectTo: 'head-prepend',
  }],
}

// https://vite.dev/config/
export default defineConfig({
  base: './', // relative paths: the same build works at a site root, in a sub-folder and from a file
  plugins: [react(), csp],
})
