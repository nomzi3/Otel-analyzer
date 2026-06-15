import { useEffect } from 'react'
import { useFilters } from '@/store/filters'
import { useStats } from '@/hooks/use-stats'
import { serviceColor } from '@/lib/otel-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ServiceRate, ServiceCount, ServiceAvgAttr } from '@/lib/api'

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'm'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function MetaCards({ totalLabel, totalCount, distinctServices }: {
  totalLabel: string
  totalCount: number
  distinctServices: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground">{totalLabel}</CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <p className="text-2xl font-semibold tabular-nums">{fmtNumber(totalCount)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground">Distinct services</CardTitle>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <p className="text-2xl font-semibold tabular-nums">{distinctServices}</p>
        </CardContent>
      </Card>
    </div>
  )
}

function TopRateTable({ title, rows, valueLabel }: {
  title: string
  rows: ServiceRate[] | null
  valueLabel: string
}) {
  const safe = rows ?? []
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        {safe.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-7 text-xs">Service</TableHead>
                <TableHead className="h-7 text-xs text-right">{valueLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safe.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1">
                    <Badge className={serviceColor(r.service_name)} variant="secondary">
                      {r.service_name || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1 text-right font-mono text-xs">
                    {r.rate_per_sec.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function TopCountTable({ title, rows, valueLabel }: {
  title: string
  rows: ServiceCount[] | null
  valueLabel: string
}) {
  const safe = rows ?? []
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        {safe.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-7 text-xs">Service</TableHead>
                <TableHead className="h-7 text-xs text-right">{valueLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safe.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1">
                    <Badge className={serviceColor(r.service_name)} variant="secondary">
                      {r.service_name || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1 text-right font-mono text-xs">
                    {fmtNumber(r.count)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function TopAvgAttrTable({ title, rows }: {
  title: string
  rows: ServiceAvgAttr[] | null
}) {
  const safe = rows ?? []
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        {safe.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-7 text-xs">Service</TableHead>
                <TableHead className="h-7 text-xs text-right">Avg attrs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safe.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1">
                    <Badge className={serviceColor(r.service_name)} variant="secondary">
                      {r.service_name || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1 text-right font-mono text-xs">
                    {r.avg_attr_count.toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function Section({ title, loading, children }: {
  title: string
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground border-b pb-1">{title}</h2>
      {loading ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map(i => (
              <Card key={i}>
                <CardContent className="pt-4 pb-3 px-4 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1].map(i => (
              <Card key={i}>
                <CardContent className="pt-4 pb-3 px-4 space-y-2">
                  {[0, 1, 2].map(j => <Skeleton key={j} className="h-5 w-full" />)}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : children}
    </div>
  )
}

export function AllView({ onRefreshed }: { onRefreshed?: (ts: Date) => void }) {
  const { filters } = useFilters()
  const { data, loading, lastFetched } = useStats(filters.refreshKey)

  useEffect(() => {
    if (lastFetched) onRefreshed?.(lastFetched)
  }, [lastFetched])

  return (
    <div className="p-4 space-y-6">
      <Section title="Logs" loading={loading}>
        {data && (
          <>
            <MetaCards
              totalLabel="Total logs"
              totalCount={data.logs.total_count}
              distinctServices={data.logs.distinct_services}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TopRateTable
                title="Top services by logs/s"
                rows={data.logs.top_by_rate}
                valueLabel="logs/s"
              />
              <TopCountTable
                title="Top services by DEBUG+INFO count"
                rows={data.logs.top_by_debug_info}
                valueLabel="count"
              />
            </div>
          </>
        )}
      </Section>

      <Section title="Metrics" loading={loading}>
        {data && (
          <>
            <MetaCards
              totalLabel="Total datapoints"
              totalCount={data.metrics.total_count}
              distinctServices={data.metrics.distinct_services}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TopRateTable
                title="Top services by datapoints/s"
                rows={data.metrics.top_by_rate}
                valueLabel="dp/s"
              />
              <TopAvgAttrTable
                title="Top services by avg attribute count"
                rows={data.metrics.top_by_avg_attr}
              />
            </div>
          </>
        )}
      </Section>

      <Section title="Traces" loading={loading}>
        {data && (
          <>
            <MetaCards
              totalLabel="Total spans"
              totalCount={data.traces.total_count}
              distinctServices={data.traces.distinct_services}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TopRateTable
                title="Top services by spans/s"
                rows={data.traces.top_by_rate}
                valueLabel="spans/s"
              />
              <TopCountTable
                title="Top services by root span count"
                rows={data.traces.top_by_root_spans}
                valueLabel="root spans"
              />
            </div>
          </>
        )}
      </Section>
    </div>
  )
}
