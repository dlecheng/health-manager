import { BUILTIN_IDS } from './defaultMetrics'
import type { MetricDefinition } from '../types'
import type { UrineAcrKey } from './urineAcrPanelParse'

function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

/**
 * mg/g → 内置「尿 ACR」；mg/mmol → 「尿蛋白/肌酐比值」等
 */
export function suggestMetricIdForUrineAcrKey(
  key: UrineAcrKey,
  metrics: MetricDefinition[],
): string | null {
  const list = metrics.map((m) => ({ m, n: norm(m.name), u: norm(m.unit) }))

  if (key === 'acrMgG') {
    const hit =
      list.find((x) => x.m.id === BUILTIN_IDS.acr) ??
      list.find(
        (x) => x.n.includes('acr') && (x.u.includes('mg/g') || x.n.includes('mg/g')),
      )
    return hit?.m.id ?? null
  }

  if (key === 'acrMgMmol') {
    const hit =
      list.find(
        (x) =>
          (x.n.includes('白蛋白') && x.n.includes('肌酐') && x.u.includes('mmol')) ||
          (x.n.includes('蛋白') && x.n.includes('肌酐') && x.u.includes('mmol')),
      ) ??
      list.find(
        (x) =>
          x.n.includes('尿蛋白') &&
          x.n.includes('肌酐') &&
          x.n.includes('比值') &&
          !x.u.includes('mg/g'),
      )
    return hit?.m.id ?? null
  }

  return null
}

export const URINE_ACR_LABELS: Record<UrineAcrKey, string> = {
  acrMgG: '尿 ACR（mg/g）',
  acrMgMmol: '尿白蛋白/肌酐比值（mg/mmol）',
}
