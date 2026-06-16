import { useEffect, useState } from 'react'
import { api, type MetricRow, type ServiceMetricSummary } from '@/lib/api'
import { useFilters } from '@/store/filters'
import { formatTimestamp, serviceColor, getMetricValue, stableJson } from '@/lib/otel-utils'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowUpDownIcon } from 'lucide-react'

interface MetricGroup {
  name: string
  svc: string
  type: string
  mAttrs: Record<string, string>
  rAttrs: Record<string, string>
  values: { ts: string; value: number }[]
}

function groupMetrics(rows: MetricRow[]): MetricGroup[] {
  const map = new Map<string, MetricGroup>()
  for (const m of rows) {
    const name = m.metric_name ?? m.name ?? ''
    const svc = m.service_name ?? m.service ?? ''
    const mAttrs = (m.metric_attributes ?? m.attributes ?? {}) as Record<string, string>
    const rAttrs = (m.resource_attributes ?? {}) as Record<string, string>
    const key = `${name}\x00${svc}\x00${stableJson(mAttrs)}\x00${stableJson(rAttrs)}`
    if (!map.has(key)) {
      map.set(key, { name, svc, type: m.metric_type ?? m.type ?? '', mAttrs, rAttrs, values: [] })
    }
    map.get(key)!.values.push({ ts: m.timestamp ?? '', value: getMetricValue(m as unknown as Record<string, unknown>) })
  }
  return [...map.values()]
}

// ── Landing page ─────────────────────────────────────────────────────────────

type SortKey = 'datapoints' | 'metric_name_count'

function MetricsLandingPage({ onSelectService }: { onSelectService: (svc: string) => void }) {
  const { filters } = useFilters()
  const [rows, setRows] = useState<ServiceMetricSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('datapoints')

  useEffect(() => {
    setLoading(true)
    const kv = filters.resourceAttrKeyValue
    api.metricsServicesSummary({
      metric_name: filters.metricName || undefined,
      resource_attr_key: filters.resourceAttributes[0] || undefined,
      resource_attr_value: kv ? kv.value : undefined,
      services: filters.services.length ? filters.services : undefined,
    }).then(data => {
      setRows(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [
    filters.metricName,
    filters.resourceAttributes,
    filters.resourceAttrKeyValue,
    filters.services,
    filters.refreshKey,
  ])

  const sorted = [...rows].sort((a, b) =>
    sortKey === 'datapoints'
      ? b.datapoints - a.datapoints
      : b.metric_name_count - a.metric_name_count
  )

  function SortButton({ sk, label }: { sk: SortKey; label: string }) {
    return (
      <button
        type="button"
        onClick={() => setSortKey(sk)}
        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
          sortKey === sk
            ? 'bg-accent font-medium text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <ArrowUpDownIcon className="h-3 w-3" />
        {label}
      </button>
    )
  }

  if (loading) return <LoadingRows cols={3} />

  return (
    <div>
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-xs text-muted-foreground">Sort by</span>
        <SortButton sk="datapoints" label="Datapoints" />
        <SortButton sk="metric_name_count" label="Metric names" />
        {sorted.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {sorted.length} service{sorted.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground">No metric data found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service Name</TableHead>
              <TableHead className="text-right">Datapoints</TableHead>
              <TableHead className="text-right">Metric Names</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(r => (
              <TableRow
                key={r.service_name}
                className="cursor-pointer"
                onClick={() => onSelectService(r.service_name)}
              >
                <TableCell>
                  <Badge className={serviceColor(r.service_name)} variant="secondary">
                    {r.service_name || '—'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.datapoints.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.metric_name_count.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

// ── Metric series table ───────────────────────────────────────────────────────

export function MetricsView({ onRefreshed }: { onRefreshed?: (ts: Date) => void }) {
  const { filters, setFilter } = useFilters()
  const [groups, setGroups] = useState<MetricGroup[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<MetricGroup | null>(null)

  const showLanding = filters.services.length === 0

  useEffect(() => {
    if (showLanding) return
    setLoading(true)
    setError('')
    api.metrics({
      services: filters.services.length ? filters.services : undefined,
      metric_name: filters.metricName || undefined,
      resource_attr_key: filters.resourceAttributes[0] || undefined,
    }).then(data => {
      const rows = Array.isArray(data) ? data : ((data as Record<string, unknown>).metrics ?? (data as Record<string, unknown>).items ?? []) as MetricRow[]
      setTotalRows(rows.length)
      setGroups(groupMetrics(rows))
      setLoading(false)
      onRefreshed?.(new Date())
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [filters.services, filters.metricName, filters.resourceAttributes, filters.refreshKey, showLanding])

  if (showLanding) {
    return (
      <MetricsLandingPage
        onSelectService={svc => setFilter('services', [svc])}
      />
    )
  }

  if (loading) return <LoadingRows cols={5} />
  if (error) return <p className="p-4 text-destructive">{error}</p>

  return (
    <>
      <p className="px-4 py-2 text-xs text-muted-foreground border-b">
        {groups.length === 0
          ? 'No metrics found.'
          : `${totalRows} data points across ${groups.length} metric series`}
      </p>

      {groups.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric Name</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Attributes</TableHead>
              <TableHead className="text-right">Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g, i) => (
              <TableRow key={i} className="cursor-pointer" onClick={() => setSelected(g)}>
                <TableCell className="font-mono text-xs">{g.name}</TableCell>
                <TableCell><Badge className={serviceColor(g.svc)} variant="secondary">{g.svc || '—'}</Badge></TableCell>
                <TableCell><Badge variant="outline">{g.type || '—'}</Badge></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <AttrPreview attrs={g.mAttrs} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{g.values.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto" style={{ maxWidth: '48rem' }}>
          <SheetHeader className="pr-10">
            <SheetTitle className="font-mono text-sm">{selected?.name}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-4 text-xs">
              {Object.keys(selected.rAttrs).length > 0 && (
                <section>
                  <h3 className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Resource Attributes</h3>
                  <KVTable data={selected.rAttrs} />
                </section>
              )}
              {Object.keys(selected.mAttrs).length > 0 && (
                <section>
                  <h3 className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Metric Attributes</h3>
                  <KVTable data={selected.mAttrs} />
                </section>
              )}
              <section>
                <h3 className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Values (latest 20)</h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {selected.values.slice(0, 20).map((v, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{formatTimestamp(v.ts)}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.value.toPrecision(6)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function AttrPreview({ attrs }: { attrs: Record<string, string> }) {
  const entries = Object.entries(attrs)
  if (entries.length === 0) return <span>—</span>
  const preview = entries.slice(0, 2).map(([k, v]) => `${k}=${v}`).join(', ')
  const more = entries.length > 2 ? ` …+${entries.length - 2}` : ''
  return <span title={JSON.stringify(attrs)}>{preview}{more}</span>
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
