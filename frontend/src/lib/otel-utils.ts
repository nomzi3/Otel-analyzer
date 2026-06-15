export function formatTimestamp(ts: string | number | undefined): string {
  if (!ts) return '—'
  let ms: number
  const n = Number(ts)
  if (!isNaN(n)) {
    if (n > 1e18) ms = n / 1e6        // nanoseconds
    else if (n > 1e15) ms = n / 1e3   // microseconds
    else if (n > 1e12) ms = n          // milliseconds
    else ms = n * 1000                 // seconds
  } else {
    ms = new Date(ts as string).getTime()
  }
  if (isNaN(ms)) return String(ts)
  const d = new Date(ms)
  const pad = (v: number) => String(v).padStart(2, '0')
  const ms3 = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms3}`
}

const SEVERITY_ORDER: Record<string, number> = {
  FATAL: 0, ERROR4: 1, ERROR3: 2, ERROR2: 3, ERROR: 4,
  WARN: 5, WARNING: 5, INFO4: 6, INFO3: 7, INFO2: 8, INFO: 9,
  DEBUG4: 10, DEBUG3: 11, DEBUG2: 12, DEBUG: 13, TRACE: 14,
}
export function severityRank(sev: string | undefined): number {
  return SEVERITY_ORDER[(sev ?? '').toUpperCase()] ?? 99
}

export function severityColor(sev: string | undefined): string {
  const s = (sev ?? '').toUpperCase()
  if (s === 'FATAL' || s.startsWith('ERROR')) return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (s === 'WARN' || s === 'WARNING') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  if (s.startsWith('INFO')) return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
  if (s.startsWith('DEBUG') || s === 'TRACE') return 'bg-zinc-500/15 text-zinc-500'
  return 'bg-zinc-500/15 text-zinc-500'
}

// djb2-derived pastel colour for a service name
const SERVICE_COLORS = [
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  'bg-lime-500/15 text-lime-600 dark:text-lime-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
]
export function serviceColor(name: string): string {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h) ^ name.charCodeAt(i)
  return SERVICE_COLORS[Math.abs(h) % SERVICE_COLORS.length]
}

export function statusColor(code: string | number | undefined): string {
  const c = String(code ?? '').toUpperCase()
  if (c === 'ERROR' || c === '2') return 'bg-red-500/15 text-red-600 dark:text-red-400'
  if (c === 'OK' || c === '1') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  return 'bg-zinc-500/15 text-zinc-500'
}

export function statusLabel(code: string | number | undefined): string {
  const c = String(code ?? '').toUpperCase()
  if (c === '2' || c === 'ERROR') return 'ERROR'
  if (c === '1' || c === 'OK') return 'OK'
  return String(code ?? 'UNSET')
}

// Pull service name from any known field
export function getServiceName(row: Record<string, unknown>): string {
  return String(row.service_name ?? row.service ?? row.root_service ?? '')
}

// Pull timestamp from any known field
export function getTimestamp(row: Record<string, unknown>): string | number {
  return (row.timestamp ?? row.start_time ?? row.start_time_unix_nano ?? row.time_unix_nano ?? '') as string | number
}

// Extract numeric metric value
export function getMetricValue(row: Record<string, unknown>): number {
  const v = row.value ?? row.gauge ?? row.sum ?? row.as_double ?? row.as_int
  return typeof v === 'number' ? v : Number(v ?? 0)
}

// Stable JSON for grouping keys
export function stableJson(obj: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))))
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}
