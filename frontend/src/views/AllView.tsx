import { useEffect, useState } from 'react'
import { api, type LogRow, type MetricRow, type TraceRootRow } from '@/lib/api'
import { useFilters } from '@/store/filters'
import { formatTimestamp, serviceColor, severityColor, statusColor, statusLabel, getMetricValue } from '@/lib/otel-utils'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

type SignalType = 'log' | 'metric' | 'trace'

interface UnifiedRow {
  ts: string | number
  type: SignalType
  svc: string
  summary: string
  badge?: string
  badgeClass?: string
}

function toMs(ts: string | number | undefined): number {
  if (!ts) return 0
  const n = Number(ts)
  if (!isNaN(n)) {
    if (n > 1e18) return n / 1e6
    if (n > 1e15) return n / 1e3
    if (n > 1e12) return n
    return n * 1000
  }
  return new Date(String(ts)).getTime()
}

function unifyLogs(rows: LogRow[]): UnifiedRow[] {
  return rows.map(r => ({
    ts: r.timestamp ?? '',
    type: 'log',
    svc: r.service_name ?? r.service ?? '',
    summary: r.log_pattern ?? r.pattern ?? r.body ?? r.log_body ?? '',
    badge: r.severity_text ?? 'INFO',
    badgeClass: severityColor(r.severity_text),
  }))
}

function unifyMetrics(rows: MetricRow[]): UnifiedRow[] {
  return rows.map(r => ({
    ts: r.timestamp ?? '',
    type: 'metric',
    svc: r.service_name ?? r.service ?? '',
    summary: `${r.metric_name ?? r.name ?? ''} = ${getMetricValue(r as unknown as Record<string, unknown>).toPrecision(4)}`,
    badge: r.metric_type ?? r.type ?? 'gauge',
    badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  }))
}

function unifyTraces(rows: TraceRootRow[]): UnifiedRow[] {
  return rows.map(r => ({
    ts: r.start_time ?? r.start_time_unix_nano ?? r.timestamp ?? '',
    type: 'trace',
    svc: r.service_name ?? r.service ?? r.root_service ?? '',
    summary: `${r.root_name ?? ''} — ${Number(r.duration_ms ?? r.duration ?? 0).toFixed(2)} ms`,
    badge: statusLabel(r.status ?? r.status_code),
    badgeClass: statusColor(r.status ?? r.status_code),
  }))
}

const PAGE_SIZE = 30

export function AllView({ onRefreshed }: { onRefreshed?: (ts: Date) => void }) {
  const { filters } = useFilters()
  const [rows, setRows] = useState<UnifiedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    setPage(0)
    const svc = filters.services.length ? filters.services : undefined
    const rk = filters.resourceAttributes[0] || undefined
    Promise.all([
      api.logs({ services: svc, limit: 100, resource_attr_key: rk }).catch(() => [] as LogRow[]),
      api.metrics({ services: svc, limit: 100, resource_attr_key: rk }).catch(() => [] as MetricRow[]),
      api.traces({ services: svc, limit: 50, resource_attr_key: rk }).catch(() => [] as TraceRootRow[]),
    ]).then(([logs, metrics, traces]) => {
      const logRows = Array.isArray(logs) ? logs : ((logs as Record<string, unknown>).logs ?? []) as LogRow[]
      const metricRows = Array.isArray(metrics) ? metrics : ((metrics as Record<string, unknown>).metrics ?? []) as MetricRow[]
      const traceRows = Array.isArray(traces) ? traces : ((traces as Record<string, unknown>).traces ?? []) as TraceRootRow[]
      const unified = [
        ...unifyLogs(logRows),
        ...unifyMetrics(metricRows),
        ...unifyTraces(traceRows),
      ].sort((a, b) => toMs(b.ts) - toMs(a.ts))
      setRows(unified)
      setLoading(false)
      onRefreshed?.(new Date())
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [filters.services, filters.resourceAttributes, filters.refreshKey])

  if (loading) return <LoadingRows />
  if (error) return <p className="p-4 text-destructive">{error}</p>

  const page_rows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)

  return (
    <div className="space-y-3">
      <p className="px-4 py-2 text-xs text-muted-foreground border-b">
        {rows.length === 0 ? 'No data found.' : `${rows.length} total signals`}
      </p>

      {rows.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page_rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{formatTimestamp(r.ts)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{r.type}</Badge>
                  </TableCell>
                  <TableCell><Badge className={serviceColor(r.svc)} variant="secondary">{r.svc || '—'}</Badge></TableCell>
                  <TableCell className="max-w-sm truncate font-mono text-xs">
                    {r.badge && <Badge className={`${r.badgeClass} mr-2`} variant="secondary">{r.badge}</Badge>}
                    {r.summary}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 pb-3 text-sm">
              <span className="text-muted-foreground text-xs">Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 border rounded text-xs disabled:opacity-40"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >Prev</button>
                <button
                  className="px-3 py-1 border rounded text-xs disabled:opacity-40"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-5 flex-1" />)}
        </div>
      ))}
    </div>
  )
}
