import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'

// Build only: Vite's dev server needs an inline script and a websocket this policy would block.
// The only address the app may contact is the coach's own Supabase project (when one is configured), so injected
// code cannot send athlete data anywhere else.
// style-src-attr allows style attributes only (the Review stage's layout uses them); style sheets stay restricted,
// and a style attribute cannot fetch anything because img-src and connect-src block outside addresses.
const csp = (supabase) => ({
  name: 'racm-csp',
  apply: 'build',
  transformIndexHtml: () => [{
    tag: 'meta',
    attrs: {
      'http-equiv': 'Content-Security-Policy',
      content: `default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src blob:; manifest-src 'self'; worker-src 'self'; connect-src ${supabase || "'none'"}; base-uri 'none'; form-action 'none'`,
    },
    injectTo: 'head-prepend',
  }],
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const supabase = loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL;
  return {
    base: './', // relative paths: the same build works at a site root, in a sub-folder and from a file
    plugins: [react(), csp(supabase && new URL(supabase).origin)],
  };
})
