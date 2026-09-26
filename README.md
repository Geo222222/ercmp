# ERCMP Command

Tablet command board for crew response times. It reads Excel workbooks, compares crews across ordered timestamp stages, and keeps the same cleaning rules as the original analyzer.

## Monthly workbooks

Drop month files here so the board can discover and compare them automatically:

- **`data/`** (preferred) — e.g. `data/JULY - KSA.xlsx` (synthetic July included for multi-month demos)
- **Repo root** — e.g. `JUNE - KSA.xlsx` (already included)

Regenerate the synthetic July file with `npm run generate:july` (needs Python + openpyxl).

Names like `JUNE - KSA.xlsx` become month labels; if dates are in the sheet, the board also uses the timestamp range. In the running app you can **drag-and-drop** one or more `.xlsx` / `.xls` files onto the Months rail (or use Add Excel / Filters).

Dev server lists files from `/api/workbooks` and serves them under `/workbooks/<file>`. Production build copies them into `dist/workbooks/` and writes `workbooks.json`.

## Run

```bash
npm install
npm run dev
```

Open the local address Vite prints. `npm run check` verifies the crew-cleaning counts against the June workbook. `npm run build` writes a static site to `dist/`.

Copy `.env.example` to `.env` if you want Google Maps on the Map tab (optional — SVG parish plane always works).

## Board

- **Command** ranks crews from fastest to slowest, with stage, average-versus-median, and weather charts. With multiple months active, Command also shows side-by-side month KPI cards and a crew Δ table.
- **Map** (Universe) — Jamaica parish plane composed from Command / Roster / Stats / Charts signals. Tap a parish for KPIs, top crews, quality pulse, and actions (Scope, Roster, Command, Charts).
- **Months rail** — tap chips to include/exclude periods; double-tap a chip for that month only.
- **Field-cleaned** drops jobs with a stage more than 15 minutes backward, drops later stages stamped under 4 minutes apart, then drops the slowest 1%.
- **Raw clocks** keeps those jobs and only removes negative overall totals, then the slowest 1%.
- Parish and the second filter apply to every view. Leave a filter empty to include all values.
- Tap a crew for its stage times. `20+` hides thin samples. CSV download follows the table on screen.

Timestamp order defaults to Assigned, Acknowledge, Enroute, On-Site, then Actual completion.

## Map / Google Maps

The Map dock tab paints active working rows onto Jamaica parish polygons (`public/geo/jamaica-parishes.geojson`, geoBoundaries ADM1, CC BY-SA 2.0).

1. Enable **Maps JavaScript API** in Google Cloud.
2. Put the browser key in `.env` as `VITE_GOOGLE_MAPS_API_KEY=...`
3. Optional: `VITE_GOOGLE_MAPS_MAP_ID=...` for a cloud vector Map ID (tilt / styled 3D-friendly rendering). Without it, a dark styled roadmap still loads; photorealistic 3D is progressive enhancement only.
4. Restart `npm run dev` after changing env vars.

If the key is missing or Maps fails, Map still shows the SVG choropleth.

### Parish name mapping

| Spreadsheet value | Polygon | Notes |
| --- | --- | --- |
| KSAN | Kingston | Kingston & St. Andrew North (approx.) |
| KSAS | St. Andrew | Kingston & St. Andrew South (approx.) |
| Portmore | St. Catherine | Municipality inside St. Catherine |
| St.Catherine / St. Catherine | St. Catherine | |
| St.James / St. James | St. James | |
| St.Ann / St. Ann | St. Ann | |
| St.Mary / St. Mary | St. Mary | |
| St.Elizabeth / St. Elizabeth | St. Elizabeth | |
| St.Thomas / St. Thomas | St. Thomas | |
| Clarendon, Manchester, Westmoreland, Hanover, Portland, Trelawny | same name | |
| null / empty | Unassigned | Listed in focus panel, no polygon |
