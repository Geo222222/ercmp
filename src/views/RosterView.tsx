import { useMemo, useState } from 'react'
import type { Row } from '../types'
import { displayValue, formatInt } from '../lib/format'

type Props = {
  headers: string[]
  rows: Row[]
}

export function RosterView({ headers, rows }: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const pageSize = 12

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => headers.some((header) => String(row[header] ?? '').toLowerCase().includes(needle)))
  }, [headers, rows, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  return (
    <section className="panel roster">
      <div className="panel-head">
        <div>
          <p className="kicker">Roster</p>
          <h2>{formatInt(filtered.length)} jobs</h2>
        </div>
        <input
          type="search"
          value={query}
          placeholder="Search jobs, crews, feeders"
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(0)
          }}
        />
      </div>
      <div className="table-scroll roster-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, index) => {
              const key = `${safePage}-${index}-${String(row.Job ?? row['Order No.'] ?? index)}`
              const open = openKey === key
              return (
                <RowBlock
                  key={key}
                  headers={headers}
                  row={row}
                  open={open}
                  onToggle={() => setOpenKey(open ? null : key)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
          Previous
        </button>
        <span>
          {safePage + 1} / {pageCount}
        </span>
        <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
          Next
        </button>
      </div>
    </section>
  )
}

function RowBlock({
  headers,
  row,
  open,
  onToggle,
}: {
  headers: string[]
  row: Row
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr onClick={onToggle} className={open ? 'open-row' : undefined}>
        {headers.map((header) => {
          const value = row[header]
          const text = value == null || value === '' ? '' : displayValue(String(value))
          return <td key={header}>{text}</td>
        })}
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={headers.length}>
            <dl>
              {headers.map((header) => (
                <div key={header}>
                  <dt>{header}</dt>
                  <dd>{row[header] == null || row[header] === '' ? '—' : String(row[header])}</dd>
                </div>
              ))}
            </dl>
          </td>
        </tr>
      )}
    </>
  )
}
