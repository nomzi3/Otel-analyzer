import { createContext, useContext, useState, useCallback } from 'react'

export interface FilterState {
  services: string[]
  resourceAttributes: string[]
  sortByAttr: string
  logSeverity: string
  logPattern: string
  metricName: string
  traceMethod: string
  refreshKey: number
}

const defaultState: FilterState = {
  services: [],
  resourceAttributes: [],
  sortByAttr: '',
  logSeverity: '',
  logPattern: '',
  metricName: '',
  traceMethod: '',
  refreshKey: 0,
}

export interface FilterContextValue {
  filters: FilterState
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  resetViewFilters: () => void
  incrementRefresh: () => void
}

export const FilterContext = createContext<FilterContextValue>({
  filters: defaultState,
  setFilter: () => {},
  resetViewFilters: () => {},
  incrementRefresh: () => {},
})

export function useFilters() {
  return useContext(FilterContext)
}

export function useFilterState(): FilterContextValue {
  const [filters, setFilters] = useState<FilterState>(defaultState)

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const resetViewFilters = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      resourceAttributes: [],
      logSeverity: '',
      logPattern: '',
      metricName: '',
      traceMethod: '',
    }))
  }, [])

  const incrementRefresh = useCallback(() => {
    setFilters(prev => ({ ...prev, refreshKey: prev.refreshKey + 1 }))
  }, [])

  return { filters, setFilter, resetViewFilters, incrementRefresh }
}
