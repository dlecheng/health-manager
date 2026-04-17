import type { MetricChartKind, MetricDefinition } from '../types'
import { BUILTIN_IDS, createDefaultMetricList } from './defaultMetrics'

const KEY = 'health-manager-metrics'

function isChartKind(x: unknown): x is MetricChartKind {
  return x === 'number' || x === 'urine-protein-qual'
}

function normalizeChartKind(
  id: string,
  chartKind: unknown,
): MetricChartKind {
  if (isChartKind(chartKind)) return chartKind
  if (id === BUILTIN_IDS.proteinQual) return 'urine-protein-qual'
  return 'number'
}

function parseMetricsLoose(raw: string): MetricDefinition[] | null {
  try {
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return null
    const out: MetricDefinition[] = []
    for (const item of p) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      if (typeof o.id !== 'string' || typeof o.name !== 'string') continue
      const unit = typeof o.unit === 'string' ? o.unit : ''
      out.push({
        id: o.id,
        name: o.name,
        unit,
        chartKind: normalizeChartKind(o.id, o.chartKind),
      })
    }
    return out
  } catch {
    return null
  }
}

export function loadMetricDefinitions(): MetricDefinition[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      const defaults = createDefaultMetricList()
      localStorage.setItem(KEY, JSON.stringify(defaults))
      return defaults
    }
    const list = parseMetricsLoose(raw)
    if (!list || list.length === 0) {
      const defaults = createDefaultMetricList()
      localStorage.setItem(KEY, JSON.stringify(defaults))
      return defaults
    }
    const normalized = list.map((m) => ({
      ...m,
      chartKind: normalizeChartKind(m.id, m.chartKind),
    }))
    const nextRaw = JSON.stringify(normalized)
    if (nextRaw !== raw) {
      localStorage.setItem(KEY, nextRaw)
    }
    return normalized
  } catch {
    const defaults = createDefaultMetricList()
    try {
      localStorage.setItem(KEY, JSON.stringify(defaults))
    } catch {
      /* ignore */
    }
    return defaults
  }
}

export function saveMetricDefinitions(metrics: MetricDefinition[]): void {
  localStorage.setItem(KEY, JSON.stringify(metrics))
}
