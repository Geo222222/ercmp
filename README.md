# ERCMP Command

Tablet command board for crew response times. It reads Excel workbooks, compares crews across ordered timestamp stages, and keeps the same cleaning rules as the original analyzer.

## Monthly workbooks

Drop month files here so the board can discover and compare them automatically:

- **`data/`** (preferred) — e.g. `data/JULY - KSA.xlsx`
- **Repo root** — e.g. `JUNE - KSA.xlsx` (already included)

Names like `JUNE - KSA.xlsx` become month labels; if dates are in the sheet, the board also uses the timestamp range. In the running app you can **drag-and-drop** one or more `.xlsx` / `.xls` files onto the Months rail (or use Add Excel / Filters).

Dev server lists files from `/api/workbooks` and serves them under `/workbooks/<file>`. Production build copies them into `dist/workbooks/` and writes `workbooks.json`.

## Run

```bash
npm install
npm run dev
```

Open the local address Vite prints. `npm run check` verifies the crew-cleaning counts against the June workbook. `npm run build` writes a static site to `dist/`.

## Board

- **Command** ranks crews from fastest to slowest, with stage, average-versus-median, and weather charts. With multiple months active, Command also shows side-by-side month KPI cards and a crew Δ table.
- **Months rail** — tap chips to include/exclude periods; double-tap a chip for that month only.
- **Field-cleaned** drops jobs with a stage more than 15 minutes backward, drops later stages stamped under 4 minutes apart, then drops the slowest 1%.
- **Raw clocks** keeps those jobs and only removes negative overall totals, then the slowest 1%.
- Parish and the second filter apply to every view. Leave a filter empty to include all values.
- Tap a crew for its stage times. `20+` hides thin samples. CSV download follows the table on screen.

Timestamp order defaults to Assigned, Acknowledge, Enroute, On-Site, then Actual completion.
