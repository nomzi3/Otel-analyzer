import { useEffect, useState } from 'react'
import { api, type StatsResponse } from '@/lib/api'

interface StatsState {
  data: StatsResponse | null
  loading: boolean
  lastFetched: Date | null
}

const POLL_MS = 30_000

const EMPTY_STATS: StatsResponse = {
  logs:    { total_count: 0, distinct_services: 0, top_by_rate: [], top_by_debug_info: [] },
  metrics: { total_count: 0, distinct_services: 0, top_by_rate: [], top_by_avg_attr: [] },
  traces:  { total_count: 0, distinct_services: 0, top_by_root_spans: [], top_by_rate: [] },
}

export function useStats(refreshKey: number): StatsState {
  const [state, setState] = useState<StatsState>({
    data: null,
    loading: true,
    lastFetched: null,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchStats() {
      try {
        const data = await api.stats()
        if (!cancelled) setState({ data, loading: false, lastFetched: new Date() })
      } catch {
        if (!cancelled) setState(prev => ({ ...prev, loading: false, data: prev.data ?? EMPTY_STATS }))
      }
    }

    fetchStats()
    const id = setInterval(fetchStats, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [refreshKey])

  return state
}
