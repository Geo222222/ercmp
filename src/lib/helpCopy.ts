/**
 * Operator-facing tip copy, rewritten from original.txt helpText/comments.
 * Keep strings short for popovers; edit here when rules change.
 */

export const HELP = {
  rosterSmart:
    'Narrow the job list by crew and parish, then choose a sort. Empty crew/parish means everyone in the current month or working set. Search still cuts across fields.',

  rosterCrew:
    'Type to find a crew, tap to include them. Leave empty for all crews. Selected crews stack as removable chips.',

  rosterParish:
    'Limit the board to one or more parishes. Leave empty for every parish in the working set.',

  rosterSort:
    'Orders the smart list. Clock sorts use first→last timestamp columns when those exist.',

  fieldCleaned:
    'Field-cleaned drops jobs with stage or total clocks more than 15 minutes backward, later stage gaps under 4 minutes (batch stamps — the first gap is allowed to be short), and the slowest 1% by total time.',

  rawClocks:
    'Raw clocks keep per-stage quirks. Only jobs with a negative overall total are removed, then the slowest 1% by total time — closer to the earlier, simpler board.',

  minJobs:
    'Sample floor hides crews with fewer jobs than this on the current board, so thin samples do not dominate the ranking. “Any” keeps every crew.',

  stageOrder:
    'Pick timestamp columns in order from earliest stage to latest (e.g. Assigned → Acknowledge → Enroute → On-Site → Completed). Order drives every gap and total.',

  batchStamp:
    'In field-cleaned mode, later stage gaps under 4 minutes usually mean batch logging, not live clocks. The first gap (often Assigned → Acknowledge) is left alone — fast ack is normal.',

  negativeRule:
    'A job is flagged or excluded when a stage or the total runs more than 15 minutes backward. Tiny negative blips are treated as clock rounding and left alone.',

  qualityFlags:
    'Crews with more than 2 negative-timestamp jobs in the same month. Severity scales with how often it repeats — tap a card to focus that crew on the board.',

  monthRail:
    'Active months feed Command comparison. Drop Excel here or Add Excel. Tap chips to include; double-tap one month to run alone. Focus month drives sheet/header setup.',

  headerRow:
    'If the sheet has title or blank rows before the column names, set this to the row that actually holds the headers.',

  globalFilter:
    'Values to include for the filter column. Leave empty to include all. This cut applies to every view that reads the working set.',

  statsBoard:
    'Share and dominance for category fields in the working set. Response-time clocks live on Command — use that board for stage averages.',

  statsFocus:
    'Tap a value to push it into the board filters and dive in. Clear on the focus board to reopen the full working set.',

  chartsShare:
    'Share mode: arc for the leaders, full ranking below with density bars. Tap an arc wedge, legend row, or rank row to lock focus and inspect sample jobs.',

  chartsSpeed:
    'Speed mode ranks groups by median response time. Lower is faster; average and job count reveal long delays and sample size.',

  chartsDensity:
    'Density mode: numeric distribution as a signal silhouette. Tap a node to lock that bin range and inspect sample jobs.',

  chartsRange:
    'Range mode: tower spread with median fireline and outliers. Tap a tower to lock that group.',

  chartsField:
    'Field mode: constellation of numeric pairs with a fit vector. Tap a star to lock that job pair.',

  chartsLinks:
    'Links mode: Pearson correlation matrix. Tap a cell for pair strength — strong |r| glows.',

  chartsExcludeMissing:
    'When on, blank / null / n/a category values are left out of the share instrument. When off, they appear as Unassigned.',

  avgVsMedian:
    'Average vs median spots crews pulled by a few long jobs. A large gap means a long tail, not every job being slow.',

  mapUniverse:
    'Universe plane for Jamaica. Parish polygons carry job density and response time from the same working set as Command, Roster, Stats, and Charts. Tap a parish for a focus stack — scope, roster dive, or jump Command.',

  mapMetric:
    'Job density paints by count. Avg response paints slower parishes hotter using complete stage clocks (same timing rules as Command).',
} as const

export type HelpKey = keyof typeof HELP
