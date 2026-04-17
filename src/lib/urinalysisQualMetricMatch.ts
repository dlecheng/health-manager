import { BUILTIN_IDS } from './defaultMetrics'
import type { MetricDefinition } from '../types'
import type { UrinalysisQualKey } from './urinalysisQualParse'

function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

/**
 * 干化学定性项 → 当前指标列表中的 metricId
 */
export function suggestMetricIdForUrinalysisKey(
  key: UrinalysisQualKey,
  metrics: MetricDefinition[],
): string | null {
  const list = metrics.map((m) => ({ m, n: norm(m.name) }))

  if (key === 'urineProtein') {
    const hit =
      list.find((x) => x.m.id === BUILTIN_IDS.proteinQual) ??
      list.find(
        (x) =>
          x.n.includes('尿蛋白') &&
          (x.n.includes('定性') || x.m.chartKind === 'urine-protein-qual'),
      ) ??
      list.find((x) => x.n.includes('尿蛋白') && !x.n.includes('定量'))
    return hit?.m.id ?? null
  }

  if (key === 'urineGlucose') {
    const hit =
      list.find((x) => x.n.includes('尿糖') || x.n.includes('尿葡萄糖')) ??
      list.find((x) => x.n.includes('葡萄糖') && x.n.includes('尿'))
    return hit?.m.id ?? null
  }

  if (key === 'urineOccultBlood') {
    const hit =
      list.find(
        (x) =>
          (x.n.includes('隐血') || x.n.includes('潜血')) && x.n.includes('尿'),
      ) ?? list.find((x) => x.n.includes('尿隐血') || x.n.includes('尿潜血'))
    return hit?.m.id ?? null
  }

  return null
}

export const URINALYSIS_QUAL_LABELS: Record<UrinalysisQualKey, string> = {
  urineProtein: '尿蛋白定性（PRO）',
  urineGlucose: '尿糖（UGLU）',
  urineOccultBlood: '尿隐血（ERY）',
}
