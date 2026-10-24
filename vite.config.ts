import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import {
  headersFile,
  inlineScriptHashes,
  securityHeaders,
} from './scripts/securityHeaders.ts'

/**
 * Serves the policy from `scripts/securityHeaders.ts` and ships it as `_headers`
 * for a static host.
 *
 * The build and the preview server read the inline script hashes out of the
 * `index.html` the browser is actually given, because Vite rewrites that file on
 * the way out and the hash has to match the bytes on the wire. The dev server
 * gets the looser policy in the same module, since React Refresh injects a
 * script of its own.
 */
function securityHeaderPolicy(): Plugin {
  let outDir = resolve('dist')
  let isBuild = false

  const apply = (setHeader: (name: string, value: string) => void, options: Parameters<typeof securityHeaders>[0]) => {
    for (const [name, value] of Object.entries(securityHeaders(options))) {
      setHeader(name, value)
    }
  }

  const builtHtml = (): string | null => {
    try {
      return readFileSync(resolve(outDir, 'index.html'), 'utf8')
    } catch {
      return null
    }
  }

  return {
    name: 'helpdesklab:security-headers',

    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      isBuild = config.command === 'build'
    },

    configureServer(server) {
      server.middlewares.use((_request, response, next) => {
        apply((name, value) => response.setHeader(name, value), { development: true })
        next()
      })
    },

    configurePreviewServer(server) {
      const html = builtHtml()
      const options = html ? { scriptHashes: inlineScriptHashes(html) } : {}
      server.middlewares.use((_request, response, next) => {
        apply((name, value) => response.setHeader(name, value), options)
        next()
      })
    },

    closeBundle() {
      if (!isBuild) {
        return
      }
      const html = builtHtml()
      if (!html) {
        return
      }
      writeFileSync(
        resolve(outDir, '_headers'),
        headersFile(securityHeaders({ scriptHashes: inlineScriptHashes(html) })),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    securityHeaderPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'HelpDeskLab',
        short_name: 'HelpDeskLab',
        description: 'Local-first Tier 1 IT help desk practice lab',
        theme_color: '#0d1a30',
        background_color: '#f3f5f9',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2,wasm}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // Reachable from other devices on the network, not just loopback.
  server: {
    host: true,
  },
})
