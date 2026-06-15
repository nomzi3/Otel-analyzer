import { useEffect, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/app-shell'
import { FilterContext, useFilterState } from '@/store/filters'
import { DarkModeContext, useDarkModeState } from '@/hooks/use-dark-mode'
import { AllView } from '@/views/AllView'
import { LogsView } from '@/views/LogsView'
import { MetricsView } from '@/views/MetricsView'
import { TracesView } from '@/views/TracesView'
import { DashboardStats } from '@/components/stats'
import { OtelFilterBar } from '@/components/OtelFilterBar'
import { Button } from '@/components/ui/button'
import { RefreshCwIcon } from 'lucide-react'

export type View = 'all' | 'logs' | 'metrics' | 'traces'

export function getView(): View {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  if (hash === 'logs') return 'logs'
  if (hash === 'metrics') return 'metrics'
  if (hash === 'traces') return 'traces'
  return 'all'
}

const VIEW_LABELS: Record<View, string> = {
  all: 'All Signals',
  logs: 'Logs',
  metrics: 'Metrics',
  traces: 'Traces',
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function ViewContent({ view, onRefreshed }: { view: View; onRefreshed: (ts: Date) => void }) {
  if (view === 'logs') return <LogsView onRefreshed={onRefreshed} />
  if (view === 'metrics') return <MetricsView onRefreshed={onRefreshed} />
  if (view === 'traces') return <TracesView onRefreshed={onRefreshed} />
  return <AllView onRefreshed={onRefreshed} />
}

export default function App() {
  const [view, setView] = useState<View>(getView)
  const filterCtx = useFilterState()
  const darkModeCtx = useDarkModeState()
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  useEffect(() => {
    const handler = () => {
      setView(getView())
      filterCtx.resetViewFilters()
      setLastRefreshed(null)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [filterCtx])

  return (
    <DarkModeContext.Provider value={darkModeCtx}>
      <TooltipProvider>
        <FilterContext.Provider value={filterCtx}>
          <AppShell currentView={view}>
            {/* Throughput stat cards */}
            <div className="mb-6 grid grid-cols-1 gap-px bg-border p-px sm:grid-cols-3">
              <DashboardStats />
            </div>

            {/* Signal view */}
            <div className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <h2 className="font-semibold text-sm">{VIEW_LABELS[view]}</h2>
                <div className="flex items-center gap-3">
                  {lastRefreshed && (
                    <span className="text-xs text-muted-foreground">
                      Refreshed {fmtTime(lastRefreshed)}
                    </span>
                  )}
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Refresh"
                    onClick={filterCtx.incrementRefresh}
                  >
                    <RefreshCwIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <OtelFilterBar view={view} />
              <ViewContent view={view} onRefreshed={setLastRefreshed} />
            </div>
          </AppShell>
        </FilterContext.Provider>
      </TooltipProvider>
    </DarkModeContext.Provider>
  )
}
