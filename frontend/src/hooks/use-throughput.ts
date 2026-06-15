import { useEffect, useState } from 'react'
import { api, type ThroughputResponse } from '@/lib/api'

interface ThroughputState extends ThroughputResponse {
  loading: boolean
  lastFetched: Date | null
}

const POLL_MS = 5_000

export function useThroughput(): ThroughputState {
  const [state, setState] = useState<ThroughputState>({
    logs_per_sec: 0,
    spans_per_sec: 0,
    datapoints_per_sec: 0,
    loading: true,
    lastFetched: null,
  })

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      try {
        const data = await api.throughput()
        if (!cancelled) setState({ ...data, loading: false, lastFetched: new Date() })
      } catch {
        if (!cancelled) setState(prev => ({ ...prev, loading: false }))
      }
    }

    fetch()
    const id = setInterval(fetch, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return state
}
