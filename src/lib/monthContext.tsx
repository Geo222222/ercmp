import { createContext, useContext } from 'react'
import type { MonthDataset } from '../types'

export type MonthContextValue = {
  /** All loaded monthly workbooks. */
  monthDatasets: MonthDataset[]
  /** Currently selected (active) months for board + comparison. */
  activeMonths: MonthDataset[]
  /** Focus month drives sheet/header edits in the filter drawer. */
  focusMonthId: string | null
  setFocusMonthId: (id: string) => void
  /** Replace the active set; empty array is ignored (at least one month stays on). */
  setMonthFilter: (ids: string[]) => void
  toggleMonth: (id: string) => void
  setMonthLabel: (id: string, label: string) => void
  removeMonth: (id: string) => void
}

const MonthContext = createContext<MonthContextValue | null>(null)

export function MonthProvider({
  value,
  children,
}: {
  value: MonthContextValue
  children: React.ReactNode
}) {
  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>
}

/** Shared month state for Roster / Stats / Charts (and any future view). */
export function useMonths(): MonthContextValue {
  const value = useContext(MonthContext)
  if (!value) {
    throw new Error('useMonths must be used within MonthProvider')
  }
  return value
}

export function useMonthsOptional(): MonthContextValue | null {
  return useContext(MonthContext)
}
