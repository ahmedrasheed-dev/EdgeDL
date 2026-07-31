import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'EdgeDL - Video & Audio Muxer',
    description: 'High performance client-side Video & Audio Muxer powered by FFmpeg WASM',
    version: '1.0.0',
    permissions: [
      'storage',
      'activeTab',
      'tabs',
      'downloads',
      'offscreen',
      'declarativeNetRequest'
    ],
    host_permissions: [
      'https://*/*',
      'http://*/*'
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' http://localhost:* ws://localhost:* https://*"
    },
    web_accessible_resources: [
      {
        resources: [
          'ffmpeg/*',
          'offscreen.html'
        ],
        matches: ['<all_urls>']
      }
    ]
  }
});
