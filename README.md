# ERCMP Command

Tablet command board for crew response times. It reads an Excel workbook, compares crews across ordered timestamp stages, and keeps the same cleaning rules as the original analyzer.

The June KSA workbook in this folder loads when you open the app.

## Run

```bash
npm install
npm run dev
```

Open the local address Vite prints. `npm run check` verifies the crew-cleaning counts against the June workbook. `npm run build` writes a static site to `dist/`.

## Board

- **Command** ranks crews from fastest to slowest, with stage, average-versus-median, and weather charts.
- **Field-cleaned** drops jobs with a stage more than 15 minutes backward, drops later stages stamped under 4 minutes apart, then drops the slowest 1%.
- **Raw clocks** keeps those jobs and only removes negative overall totals, then the slowest 1%.
- Parish and the second filter apply to every view. Leave a filter empty to include all values.
- Tap a crew for its stage times. `20+` hides thin samples. CSV download follows the table on screen.

Timestamp order defaults to Assigned, Acknowledge, Enroute, On-Site, then Actual completion.
