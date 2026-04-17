import { BUILTIN_IDS } from './defaultMetrics'
import type { MetricDefinition } from '../types'
import type { RenalPanelKey } from './renalPanelParse'

function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

/**
 * 将肾功解析键映射到当前指标列表中的 metricId（按名称匹配）。
 */
export function suggestMetricIdForRenalKey(
  key: RenalPanelKey,
  metrics: MetricDefinition[],
): string | null {
  const list = metrics.map((m) => ({ m, n: norm(m.name) }))

  if (key === 'creatinine') {
    const hit =
      list.find((x) => x.n.includes('血肌酐')) ??
      list.find((x) => x.m.id === BUILTIN_IDS.creatinine) ??
      list.find((x) => x.n === '肌酐' || (x.n.includes('肌酐') && !x.n.includes('尿')))
    return hit?.m.id ?? null
  }

  if (key === 'urea') {
    const hit =
      list.find(
        (x) =>
          (x.n.includes('尿素') && !x.n.includes('尿肌酐')) ||
          x.n.includes('尿素氮'),
      ) ?? list.find((x) => x.n.includes('尿素氮'))
    return hit?.m.id ?? null
  }

  if (key === 'uricAcid') {
    const hit = list.find((x) => x.n.includes('尿酸'))
    return hit?.m.id ?? null
  }

  if (key === 'egfr') {
    const hit =
      list.find((x) => x.n.includes('egfr')) ??
      list.find(
        (x) =>
          x.n.includes('肾小球') &&
          (x.n.includes('滤过') || x.n.includes('gfr')),
      )
    return hit?.m.id ?? null
  }

  return null
}

export const RENAL_LABELS: Record<RenalPanelKey, string> = {
  urea: '尿素 / 血尿素氮',
  creatinine: '肌酐 / 血肌酐',
  uricAcid: '尿酸',
  egfr: 'eGFR / 肾小球滤过率',
}
