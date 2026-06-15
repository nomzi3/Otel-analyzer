import { useEffect, useState } from 'react'
import { api, type TraceRootRow, type SpanRow } from '@/lib/api'
import { useFilters } from '@/store/filters'
import { formatTimestamp, serviceColor, statusColor, statusLabel, truncate } from '@/lib/otel-utils'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

interface SpanNode extends SpanRow {
  children: SpanNode[]
}

function buildTree(spans: SpanRow[]): SpanNode[] {
  const byId = new Map<string, SpanNode>()
  for (const s of spans) {
    byId.set(s.span_id ?? '', { ...s, children: [] })
  }
  const roots: SpanNode[] = []
  for (const node of byId.values()) {
    const pid = node.parent_span_id ?? ''
    if (pid && byId.has(pid)) byId.get(pid)!.children.push(node)
    else roots.push(node)
  }
  return roots
}

function SpanTree({ nodes, depth = 0 }: { nodes: SpanNode[]; depth?: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  return (
    <>
      {nodes.map(n => {
        const id = n.span_id ?? ''
        const isOpen = open.has(id)
        return (
          <div key={id}>
            <div
              className="flex items-center gap-2 py-1 px-2 text-xs rounded hover:bg-muted/50 cursor-pointer"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => setOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })}
            >
              <Badge className={statusColor(n.status_code ?? n.status)} variant="secondary">{statusLabel(n.status_code ?? n.status)}</Badge>
              <span className="font-mono font-medium">{n.name ?? n.span_name}</span>
              <Badge className={serviceColor(n.service_name ?? n.service ?? '')} variant="secondary">{n.service_name ?? n.service}</Badge>
              <span className="ml-auto text-muted-foreground tabular-nums">{(n.duration_ms ?? n.duration ?? 0).toFixed(2)} ms</span>
            </div>
            {isOpen && n.span_attributes && (
              <div className="ml-6 mb-1 border-l pl-3 text-xs font-mono text-muted-foreground space-y-0.5">
                {Object.entries(n.span_attributes).map(([k, v]) => (
                  <div key={k}><span className="text-foreground/60">{k}:</span> {v}</div>
                ))}
              </div>
            )}
            {n.children.length > 0 && <SpanTree nodes={n.children} depth={depth + 1} />}
          </div>
        )
      })}
    </>
  )
}

export function TracesView({ onRefreshed }: { onRefreshed?: (ts: Date) => void }) {
  const { filters } = useFilters()
  const [traces, setTraces] = useState<TraceRootRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<TraceRootRow | null>(null)
  const [spans, setSpans] = useState<SpanNode[]>([])
  const [spansLoading, setSpansLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.traces({
      services: filters.services.length ? filters.services : undefined,
      method: filters.traceMethod || undefined,
      resource_attr_key: filters.resourceAttributes[0] || undefined,
    }).then(data => {
      const rows = Array.isArray(data) ? data : ((data as Record<string, unknown>).traces ?? (data as Record<string, unknown>).items ?? []) as TraceRootRow[]
      setTraces(rows)
      setLoading(false)
      onRefreshed?.(new Date())
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [filters.services, filters.traceMethod, filters.resourceAttributes, filters.refreshKey])

  function openTrace(trace: TraceRootRow) {
    setSelected(trace)
    setSpans([])
    const tid = trace.trace_id ?? trace.traceId ?? trace.id ?? ''
    if (!tid) return
    setSpansLoading(true)
    api.traceSpans(tid).then(rows => {
      setSpans(buildTree(rows))
      setSpansLoading(false)
    }).catch(() => setSpansLoading(false))
  }

  if (loading) return <LoadingRows cols={5} />
  if (error) return <p className="p-4 text-destructive">{error}</p>

  return (
    <>
      <p className="px-4 py-2 text-xs text-muted-foreground border-b">
        {traces.length === 0
          ? 'No traces found.'
          : `${traces.length} trace${traces.length !== 1 ? 's' : ''}`}
      </p>

      {traces.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Start Time</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Trace ID</TableHead>
              <TableHead className="text-right">Duration (ms)</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces.map((t, i) => {
              const ts = t.start_time ?? t.start_time_unix_nano ?? t.timestamp ?? ''
              const svc = t.service_name ?? t.service ?? t.root_service ?? ''
              const tid = t.trace_id ?? t.traceId ?? t.id ?? ''
              const dur = t.duration_ms ?? t.duration ?? 0
              const status = t.status ?? t.status_code
              return (
                <TableRow key={i} className="cursor-pointer" onClick={() => openTrace(t)}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{formatTimestamp(ts)}</TableCell>
                  <TableCell><Badge className={serviceColor(svc)} variant="secondary">{svc || '—'}</Badge></TableCell>
                  <TableCell className="font-mono text-xs" title={tid}>{truncate(tid, 20)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(dur).toFixed(2)}</TableCell>
                  <TableCell><Badge className={statusColor(status)} variant="secondary">{statusLabel(status)}</Badge></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto" style={{ maxWidth: '56rem' }}>
          <SheetHeader className="pr-10">
            <SheetTitle className="font-mono text-xs break-all">{selected?.trace_id ?? selected?.traceId}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-4 text-xs">
              {selected.resource_attributes && Object.keys(selected.resource_attributes).length > 0 && (
                <section>
                  <h3 className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Resource</h3>
                  <KVTable data={selected.resource_attributes as Record<string, string>} />
                </section>
              )}
              {selected.span_attributes && Object.keys(selected.span_attributes).length > 0 && (
                <section>
                  <h3 className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Root Span</h3>
                  <KVTable data={selected.span_attributes as Record<string, string>} />
                </section>
              )}
              <section>
                <h3 className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Spans</h3>
                {spansLoading
                  ? <Skeleton className="h-24 w-full" />
                  : spans.length > 0
                    ? <SpanTree nodes={spans} />
                    : <p className="text-muted-foreground">No spans found.</p>}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function KVTable({ data }: { data: Record<string, string> }) {
  return (
    <table className="w-full text-xs border-collapse">
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k} className="border-b">
            <td className="py-1 pr-3 font-mono text-muted-foreground whitespace-nowrap">{k}</td>
            <td className="py-1 font-mono break-all">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
