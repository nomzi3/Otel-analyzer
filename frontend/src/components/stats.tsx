import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardCard } from "@/components/dashboard-card"
import { Skeleton } from "@/components/ui/skeleton"
import { useThroughput } from "@/hooks/use-throughput"

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k"
  return n.toFixed(2)
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function DashboardStats() {
  const { logs_per_sec, spans_per_sec, datapoints_per_sec, loading, lastFetched } = useThroughput()

  const stats = [
    { label: "Logs / sec", value: logs_per_sec },
    { label: "Spans / sec", value: spans_per_sec },
    { label: "Datapoints / sec", value: datapoints_per_sec },
  ]

  return (
    <>
      {stats.map((s) => (
        <DashboardCard key={s.label}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-normal text-xs tracking-wide text-muted-foreground">
              {s.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {loading
              ? <Skeleton className="h-8 w-20" />
              : <p className="font-semibold text-2xl tabular-nums">{fmt(s.value)}</p>}
            {lastFetched && (
              <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                Updated {fmtTime(lastFetched)}
              </p>
            )}
          </CardContent>
        </DashboardCard>
      ))}
    </>
  )
}
