import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useFilters } from '@/store/filters'
import { ChevronDownIcon, CheckIcon } from 'lucide-react'

type View = 'all' | 'logs' | 'metrics' | 'traces'

// ── Single select ────────────────────────────────────────────────────────────

function SingleSelect({
  label,
  value,
  options,
  onChange,
  allLabel = '— all —',
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  allLabel?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">{allLabel}</option>
        {options.map(o => (
          <option key={o} value={o}>{o.length > 50 ? o.slice(0, 50) + '…' : o}</option>
        ))}
      </select>
    </div>
  )
}

// ── Multi select ─────────────────────────────────────────────────────────────

function MultiSelect({
  label,
  value,
  options,
  onChange,
  allLabel = 'Show all',
}: {
  label: string
  value: string[]
  options: string[]
  onChange: (v: string[]) => void
  allLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle(item: string) {
    if (value.includes(item)) onChange(value.filter(v => v !== item))
    else onChange([...value, item])
  }

  const displayLabel = value.length === 0
    ? allLabel
    : value.length === 1
      ? (value[0].length > 20 ? value[0].slice(0, 20) + '…' : value[0])
      : `${value.length} selected`

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-7 items-center gap-1 rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="max-w-[160px] truncate">{displayLabel}</span>
        <ChevronDownIcon className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 min-w-[180px] max-w-[280px] max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No options</p>
          )}
          {value.length > 0 && (
            <button
              type="button"
              className="flex w-full items-center px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent border-b"
              onClick={() => onChange([])}
            >
              Clear selection
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left"
              onClick={() => toggle(opt)}
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-input shrink-0">
                {value.includes(opt) && <CheckIcon className="h-3 w-3" />}
              </span>
              <span className="truncate" title={opt}>{opt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main filter bar ──────────────────────────────────────────────────────────

export function OtelFilterBar({ view }: { view: View }) {
  const { filters, setFilter } = useFilters()

  // Common option lists
  const [serviceOptions, setServiceOptions] = useState<string[]>([])
  const [resourceAttrOptions, setResourceAttrOptions] = useState<string[]>([])

  // Log-specific
  const [severities, setSeverities] = useState<string[]>([])
  const [patterns, setPatterns] = useState<string[]>([])

  // Metric-specific
  const [metricNames, setMetricNames] = useState<string[]>([])

  // Trace-specific
  const [methods, setMethods] = useState<string[]>([])

  const resourceAttrKey = filters.resourceAttributes[0] // use first selected for dependent queries

  // Fetch services — filtered by selected resource attr key
  useEffect(() => {
    if (view === 'all') return
    api.services({ resource_attr_key: resourceAttrKey || undefined })
      .then(setServiceOptions).catch(() => {})
  }, [view, resourceAttrKey])

  // Fetch resource attribute keys — filtered by selected services
  useEffect(() => {
    if (view === 'all') return
    api.resourceAttributes({ services: filters.services.length ? filters.services : undefined })
      .then(setResourceAttrOptions).catch(() => {})
  }, [view, filters.services])

  // Log-specific options
  useEffect(() => {
    if (view !== 'logs') return
    const svc = filters.services.length ? filters.services : undefined
    const rk = resourceAttrKey || undefined
    api.logSeverities({ services: svc, resource_attr_key: rk }).then(setSeverities).catch(() => {})
    api.logPatterns({ services: svc, severity: filters.logSeverity || undefined, resource_attr_key: rk })
      .then(rows => setPatterns([...new Set(rows.map(r => r.pattern).filter(Boolean))]))
      .catch(() => {})
  }, [view, filters.services, filters.logSeverity, resourceAttrKey])

  // Metric names — dependent on services + resource attr
  useEffect(() => {
    if (view !== 'metrics') return
    api.metricNames({
      services: filters.services.length ? filters.services : undefined,
      resource_attr_key: resourceAttrKey || undefined,
    }).then(setMetricNames).catch(() => {})
  }, [view, filters.services, resourceAttrKey])

  // Trace methods — dependent on services + resource attr
  useEffect(() => {
    if (view !== 'traces') return
    api.traceMethods({
      services: filters.services.length ? filters.services : undefined,
      resource_attr_key: resourceAttrKey || undefined,
    }).then(setMethods).catch(() => {})
  }, [view, filters.services, resourceAttrKey])

  if (view === 'all') return null

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b bg-muted/20 text-xs">
      {/* Common: service name */}
      <MultiSelect
        label="service"
        value={filters.services}
        options={serviceOptions}
        onChange={v => setFilter('services', v)}
        allLabel="Show all"
      />

      {/* Common: resource attribute key */}
      <MultiSelect
        label="resource attr"
        value={filters.resourceAttributes}
        options={resourceAttrOptions}
        onChange={v => {
          setFilter('resourceAttributes', v)
          // clear services that may no longer be valid
          setFilter('services', [])
        }}
        allLabel="Show all"
      />

      {/* Log-specific */}
      {view === 'logs' && (
        <>
          <SingleSelect
            label="severity"
            value={filters.logSeverity}
            options={severities}
            onChange={v => { setFilter('logSeverity', v); setFilter('logPattern', '') }}
          />
          <SingleSelect
            label="log pattern"
            value={filters.logPattern}
            options={patterns}
            onChange={v => setFilter('logPattern', v)}
            allLabel="— all patterns —"
          />
        </>
      )}

      {/* Metric-specific */}
      {view === 'metrics' && (
        <SingleSelect
          label="metric name"
          value={filters.metricName}
          options={metricNames}
          onChange={v => setFilter('metricName', v)}
          allLabel="— all metrics —"
        />
      )}

      {/* Trace-specific */}
      {view === 'traces' && (
        <SingleSelect
          label="http.url"
          value={filters.traceMethod}
          options={methods}
          onChange={v => setFilter('traceMethod', v)}
          allLabel="— all methods —"
        />
      )}
    </div>
  )
}
