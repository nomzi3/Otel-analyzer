import { useEffect, useState } from 'react'
import { api, type LogRow } from '@/lib/api'
import { useFilters } from '@/store/filters'
import { formatTimestamp, severityRank, severityColor, serviceColor, stableJson } from '@/lib/otel-utils'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

interface LogGroup {
  pattern: string
  svc: string
  sev: string
  worstRank: number
  latestTs: string | number
  examples: LogRow[]
}

function groupLogs(logs: LogRow[]): LogGroup[] {
  const map = new Map<string, LogGroup>()
  for (const log of logs) {
    const svc = log.service_name ?? log.service ?? ''
    const pattern = log.log_pattern ?? log.pattern ?? ''
    const key = `${pattern}\x00${svc}`
    if (!map.has(key)) {
      map.set(key, { pattern, svc, sev: 'INFO', worstRank: 99, latestTs: '', examples: [] })
    }
    const g = map.get(key)!
    g.examples.push(log)
    const rank = severityRank(log.severity_text)
    if (rank < g.worstRank) { g.worstRank = rank; g.sev = log.severity_text ?? 'INFO' }
    const ts = log.timestamp ?? ''
    if (!g.latestTs || String(ts) > String(g.latestTs)) g.latestTs = ts
  }
  return [...map.values()].sort((a, b) => a.worstRank - b.worstRank)
}

export function LogsView({ onRefreshed }: { onRefreshed?: (ts: Date) => void }) {
  const { filters } = useFilters()
  const [groups, setGroups] = useState<LogGroup[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<LogGroup | null>(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.logs({
      services: filters.services.length ? filters.services : undefined,
      log_pattern: filters.logPattern || undefined,
      severity: filters.logSeverity || undefined,
      resource_attr_key: filters.resourceAttributes[0] || undefined,
    }).then(data => {
      const rows = Array.isArray(data) ? data : ((data as Record<string, unknown>).logs ?? (data as Record<string, unknown>).items ?? []) as LogRow[]
      setTotalRows(rows.length)
      setGroups(groupLogs(rows))
      setLoading(false)
      onRefreshed?.(new Date())
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [filters.services, filters.logPattern, filters.logSeverity, filters.resourceAttributes, filters.refreshKey])

  if (loading) return <LoadingRows cols={5} />
  if (error) return <p className="p-4 text-destructive">{error}</p>

  return (
    <>
      <p className="px-4 py-2 text-xs text-muted-foreground border-b">
        {groups.length === 0
          ? 'No logs found.'
          : `${totalRows} records across ${groups.length} log pattern${groups.length !== 1 ? 's' : ''}`}
      </p>

      {groups.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Latest</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g, i) => (
              <TableRow key={i} className="cursor-pointer" onClick={() => setSelected(g)}>
                <TableCell className="font-mono text-xs whitespace-nowrap">{formatTimestamp(g.latestTs)}</TableCell>
                <TableCell><Badge className={serviceColor(g.svc)} variant="secondary">{g.svc || '—'}</Badge></TableCell>
                <TableCell><Badge className={severityColor(g.sev)} variant="secondary">{g.sev}</Badge></TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs">{g.pattern || '(no pattern)'}</TableCell>
                <TableCell className="text-right tabular-nums">{g.examples.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto" style={{ maxWidth: '42rem' }}>
          <SheetHeader className="pr-10">
            <SheetTitle className="font-mono text-sm break-all">{selected?.pattern || '(no pattern)'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {selected?.examples.slice(0, 20).map((log, i) => (
              <div key={i} className="rounded border p-3 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className={severityColor(log.severity_text)} variant="secondary">{log.severity_text ?? 'INFO'}</Badge>
                  <span className="font-mono text-muted-foreground">{formatTimestamp(log.timestamp)}</span>
                </div>
                <p className="font-mono break-all">{log.body ?? log.log_body ?? ''}</p>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function LoadingRows({ cols }: { cols: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className="h-5 flex-1" />)}
        </div>
      ))}
    </div>
  )
}

// re-export for use in AllView
export { stableJson }
