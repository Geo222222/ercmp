import { copyFileSync, createReadStream, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const WORKBOOK = 'JUNE - KSA.xlsx'

function workbookPlugin(): Plugin {
  return {
    name: 'ercmp-workbook',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0])
        if (path !== `/${WORKBOOK}`) return next()
        const file = resolve(WORKBOOK)
        if (!existsSync(file)) return next()
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        createReadStream(file).pipe(res)
      })
    },
    writeBundle(options) {
      const from = resolve(WORKBOOK)
      if (!existsSync(from)) return
      const dir = options.dir ?? resolve('dist')
      copyFileSync(from, resolve(dir, WORKBOOK))
    },
  }
}

export default defineConfig({
  plugins: [react(), workbookPlugin()],
  server: { host: '127.0.0.1', port: 5173 },
})
