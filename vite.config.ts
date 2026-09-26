import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

export type WorkbookEntry = {
  fileName: string
  /** URL path served from the site root, e.g. /workbooks/JUNE%20-%20KSA.xlsx */
  url: string
  source: 'root' | 'data'
}

const EXCEL_RE = /\.xlsx?$/i

function listExcelIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => EXCEL_RE.test(name) && !name.startsWith('~$'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** Prefer `data/`, then repo root. Same basename → data wins. */
export function discoverWorkbookEntries(rootDir = process.cwd()): WorkbookEntry[] {
  const byKey = new Map<string, WorkbookEntry>()

  for (const name of listExcelIn(resolve(rootDir))) {
    byKey.set(name.toLowerCase(), {
      fileName: name,
      url: `/workbooks/${encodeURIComponent(name)}`,
      source: 'root',
    })
  }

  for (const name of listExcelIn(resolve(rootDir, 'data'))) {
    byKey.set(name.toLowerCase(), {
      fileName: name,
      url: `/workbooks/${encodeURIComponent(name)}`,
      source: 'data',
    })
  }

  return [...byKey.values()].sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' }))
}

function resolveWorkbookFile(fileName: string, rootDir = process.cwd()): string | null {
  const dataPath = resolve(rootDir, 'data', fileName)
  if (existsSync(dataPath)) return dataPath
  const rootPath = resolve(rootDir, fileName)
  if (existsSync(rootPath)) return rootPath
  return null
}

function workbookPlugin(): Plugin {
  const rootDir = process.cwd()

  return {
    name: 'ercmp-workbooks',
    configureServer(server) {
      const refresh = () => {
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.add(resolve(rootDir, 'data'))
      server.watcher.on('add', (file) => {
        if (EXCEL_RE.test(file)) refresh()
      })
      server.watcher.on('unlink', (file) => {
        if (EXCEL_RE.test(file)) refresh()
      })

      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '')

        if (path === '/api/workbooks' || path === '/workbooks.json') {
          const entries = discoverWorkbookEntries(rootDir)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ workbooks: entries }))
          return
        }

        const workbookMatch = path.match(/^\/workbooks\/(.+)$/)
        const legacyJune = path === '/JUNE - KSA.xlsx'
        const fileName = workbookMatch ? workbookMatch[1] : legacyJune ? 'JUNE - KSA.xlsx' : null

        if (!fileName) return next()

        const file = resolveWorkbookFile(fileName, rootDir)
        if (!file) return next()

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(file).pipe(res)
      })
    },
    writeBundle(options) {
      const dir = options.dir ?? resolve('dist')
      const entries = discoverWorkbookEntries(rootDir)
      const outBooks = join(dir, 'workbooks')
      mkdirSync(outBooks, { recursive: true })
      mkdirSync(join(dir, 'api'), { recursive: true })

      for (const entry of entries) {
        const from = resolveWorkbookFile(entry.fileName, rootDir)
        if (!from) continue
        copyFileSync(from, join(outBooks, entry.fileName))
        if (entry.fileName === 'JUNE - KSA.xlsx') {
          copyFileSync(from, join(dir, entry.fileName))
        }
      }

      const payload = JSON.stringify({ workbooks: entries }, null, 2)
      writeFileSync(join(dir, 'workbooks.json'), payload)
      writeFileSync(join(dir, 'api', 'workbooks'), JSON.stringify({ workbooks: entries }))
    },
  }
}

export default defineConfig({
  plugins: [react(), workbookPlugin()],
  server: { host: '127.0.0.1', port: 5173 },
})
