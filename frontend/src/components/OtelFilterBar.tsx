import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useFilters } from '@/store/filters'
import { ChevronDownIcon, ChevronRightIcon, CheckIcon, XIcon } from 'lucide-react'

type View = 'all' | 'logs' | 'metrics' | 'traces'

// ── Multi select with search ──────────────────────────────────────────────────

function MultiSelect({
  label,
  value,
  options,
  onChange,
  allLabel = 'Show all',
  onExpandItem,
}: {
  label: string
  value: string[]
  options: string[]
  onChange: (v: string[]) => void
  allLabel?: string
  onExpandItem?: (item: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setSearch(''); return }
    setTimeout(() => searchRef.current?.focus(), 0)
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

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))

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
        <div className="absolute left-0 top-8 z-50 min-w-[200px] max-w-[300px] rounded-md border bg-popover shadow-md">
          <div className="border-b px-2 py-1.5">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No results</p>
            )}
            {value.length > 0 && filtered.length > 0 && (
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent border-b"
                onClick={() => onChange([])}
              >
                Clear selection
              </button>
            )}
            {filtered.map(opt => (
              <div
                key={opt}
                className="flex w-full items-center gap-1 px-2 py-1.5 text-xs hover:bg-accent"
              >
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left min-w-0"
                  onClick={() => toggle(opt)}
                >
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-input shrink-0">
                    {value.includes(opt) && <CheckIcon className="h-3 w-3" />}
                  </span>
                  <span className="truncate" title={opt}>{opt}</span>
                </button>
                {onExpandItem && (
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={`Filter by ${opt} value`}
                    onClick={e => { e.stopPropagation(); onExpandItem(opt); setOpen(false) }}
                  >
                    <ChevronRightIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single select with search ─────────────────────────────────────────────────

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
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setSearch(''); return }
    setTimeout(() => searchRef.current?.focus(), 0)
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const displayLabel = value || allLabel

  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-7 items-center gap-1 rounded border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="max-w-[160px] truncate">{displayLabel.length > 50 ? displayLabel.slice(0, 50) + '…' : displayLabel}</span>
        <ChevronDownIcon className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 min-w-[200px] max-w-[300px] rounded-md border bg-popover shadow-md">
          <div className="border-b px-2 py-1.5">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              className="flex w-full items-center px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent border-b"
              onClick={() => { onChange(''); setOpen(false) }}
            >
              {allLabel}
            </button>
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No results</p>
            )}
            {filtered.map(opt => (
              <button
                key={opt}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left ${value === opt ? 'font-medium' : ''}`}
                onClick={() => { onChange(opt); setOpen(false) }}
              >
                {value === opt && <CheckIcon className="h-3 w-3 shrink-0" />}
                {value !== opt && <span className="w-3 shrink-0" />}
                <span className="truncate" title={opt}>{opt}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Resource attribute value sub-panel ───────────────────────────────────────

function ResourceAttrValuePanel({
  attrKey,
  services,
  activeValue,
  onSelect,
  onClose,
}: {
  attrKey: string
  services: string[]
  activeValue: string | null
  onSelect: (value: string | null) => void
  onClose: () => void
}) {
  const [values, setValues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    api.resourceAttributeValues({ key: attrKey, services: services.length ? services : undefined })
      .then(v => { setValues(v); setLoading(false) })
      .catch(() => setLoading(false))
    setTimeout(() => searchRef.current?.focus(), 0)
  }, [attrKey, services])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const filtered = values.filter(v => v.toLowerCase().includes(search.toLowerCase()))

  return (
    <div
      ref={ref}
      className="absolute left-0 top-8 z-50 min-w-[220px] max-w-[320px] rounded-md border bg-popover shadow-md"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium truncate max-w-[160px]" title={attrKey}>{attrKey}</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <XIcon className="h-3 w-3" />
        </button>
      </div>
      <div className="border-b px-2 py-1.5">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search values…"
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {activeValue && (
          <button
            type="button"
            className="flex w-full items-center px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent border-b"
            onClick={() => { onSelect(null); onClose() }}
          >
            Clear value filter
          </button>
        )}
        {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No values found</p>
        )}
        {filtered.map(val => (
          <button
            key={val}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left ${activeValue === val ? 'font-medium' : ''}`}
            onClick={() => { onSelect(val); onClose() }}
          >
            {activeValue === val && <CheckIcon className="h-3 w-3 shrink-0" />}
            {activeValue !== val && <span className="w-3 shrink-0" />}
            <span className="truncate" title={val}>{val}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main filter bar ──────────────────────────────────────────────────────────

export function OtelFilterBar({ view }: { view: View }) {
  const { filters, setFilter } = useFilters()

  const [serviceOptions, setServiceOptions] = useState<string[]>([])
  const [resourceAttrOptions, setResourceAttrOptions] = useState<string[]>([])

  const [severities, setSeverities] = useState<string[]>([])
  const [patterns, setPatterns] = useState<string[]>([])
  const [metricNames, setMetricNames] = useState<string[]>([])
  const [methods, setMethods] = useState<string[]>([])

  // Which resource attr key has its value sub-panel open
  const [expandedAttrKey, setExpandedAttrKey] = useState<string | null>(null)
  const resourceAttrContainerRef = useRef<HTMLDivElement>(null)

  const resourceAttrKey = filters.resourceAttributes[0]

  useEffect(() => {
    if (view === 'all') return
    api.services({ resource_attr_key: resourceAttrKey || undefined })
      .then(setServiceOptions).catch(() => {})
  }, [view, resourceAttrKey])

  useEffect(() => {
    if (view === 'all') return
    api.resourceAttributes({ services: filters.services.length ? filters.services : undefined })
      .then(setResourceAttrOptions).catch(() => {})
  }, [view, filters.services])

  useEffect(() => {
    if (view !== 'logs') return
    const svc = filters.services.length ? filters.services : undefined
    const rk = resourceAttrKey || undefined
    api.logSeverities({ services: svc, resource_attr_key: rk }).then(setSeverities).catch(() => {})
    api.logPatterns({ services: svc, severity: filters.logSeverity || undefined, resource_attr_key: rk })
      .then(rows => setPatterns([...new Set(rows.map(r => r.pattern).filter(Boolean))]))
      .catch(() => {})
  }, [view, filters.services, filters.logSeverity, resourceAttrKey])

  useEffect(() => {
    if (view !== 'metrics') return
    api.metricNames({
      services: filters.services.length ? filters.services : undefined,
      resource_attr_key: resourceAttrKey || undefined,
    }).then(setMetricNames).catch(() => {})
  }, [view, filters.services, resourceAttrKey])

  useEffect(() => {
    if (view !== 'traces') return
    api.traceMethods({
      services: filters.services.length ? filters.services : undefined,
      resource_attr_key: resourceAttrKey || undefined,
    }).then(setMethods).catch(() => {})
  }, [view, filters.services, resourceAttrKey])

  if (view === 'all') return null

  const activeKV = filters.resourceAttrKeyValue

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b bg-muted/20 text-xs">
      <MultiSelect
        label="service"
        value={filters.services}
        options={serviceOptions}
        onChange={v => setFilter('services', v)}
        allLabel="Show all"
      />

      {/* Resource attribute key selector + value sub-panel */}
      <div className="relative" ref={resourceAttrContainerRef}>
        <MultiSelect
          label="resource attr"
          value={filters.resourceAttributes}
          options={resourceAttrOptions}
          onChange={v => {
            setFilter('resourceAttributes', v)
            setFilter('services', [])
            setFilter('resourceAttrKeyValue', null)
          }}
          allLabel="Show all"
          onExpandItem={key => setExpandedAttrKey(key)}
        />
        {expandedAttrKey && (
          <ResourceAttrValuePanel
            attrKey={expandedAttrKey}
            services={filters.services}
            activeValue={activeKV?.key === expandedAttrKey ? activeKV.value : null}
            onSelect={val => {
              if (val === null) {
                setFilter('resourceAttrKeyValue', null)
              } else {
                setFilter('resourceAttrKeyValue', { key: expandedAttrKey, value: val })
                // Also select this key in the resource attr filter if not already selected
                if (!filters.resourceAttributes.includes(expandedAttrKey)) {
                  setFilter('resourceAttributes', [...filters.resourceAttributes, expandedAttrKey])
                }
              }
            }}
            onClose={() => setExpandedAttrKey(null)}
          />
        )}
      </div>

      {/* Active key=value chip */}
      {activeKV && (
        <span className="flex items-center gap-1 rounded-full border bg-accent px-2 py-0.5 text-xs font-medium">
          <span className="font-mono">{activeKV.key}={activeKV.value}</span>
          <button
            type="button"
            onClick={() => setFilter('resourceAttrKeyValue', null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      )}

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

      {view === 'metrics' && (
        <SingleSelect
          label="metric name"
          value={filters.metricName}
          options={metricNames}
          onChange={v => setFilter('metricName', v)}
          allLabel="— all metrics —"
        />
      )}

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
