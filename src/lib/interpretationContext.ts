import { assessMetricValue, referenceRangeHint } from './referenceRanges'
import {
  parseNum,
  parseUrineProteinQualitative,
  sortByDateAsc,
} from './trendParsing'
import type { HealthRecord, MetricDefinition } from '../types'
import type { RangeAssessment } from './referenceRanges'

export type { RangeAssessment }

function assessmentLabel(a: RangeAssessment): string {
  if (a === 'normal') return '在常见参考范围内'
  if (a === 'high') return '相对参考范围偏高'
  if (a === 'low') return '相对参考范围偏低'
  return '无法对照参考范围或定性未识别'
}

function compareTrend(
  metric: MetricDefinition,
  prev: string,
  next: string,
): string {
  const isQual = metric.chartKind === 'urine-protein-qual'
  if (isQual) {
    const a = parseUrineProteinQualitative(prev)
    const b = parseUrineProteinQualitative(next)
    if (a === null || b === null) return '变化趋势需结合化验单与医生解读'
    if (b > a) return '近期档位上升'
    if (b < a) return '近期档位下降或转阴'
    return '近期档位大致稳定'
  }
  const n0 = parseNum(prev)
  const n1 = parseNum(next)
  if (n0 === null || n1 === null) return '数值格式不完全一致，趋势仅供参考'
  const rel = Math.max(Math.abs(n0), Math.abs(n1), 1e-9) * 0.02
  if (Math.abs(n1 - n0) <= rel) return '近期数值大致稳定'
  if (n1 > n0) return '近期数值上升'
  return '近期数值下降'
}

export type InterpretationContextPayload = {
  /** 供模型或离线模板使用的纯文本摘要 */
  summaryText: string
  recordCount: number
  latestDate: string | null
}

/**
 * 汇总全部已保存记录：按指标梳理最新值、相对参考范围、简单趋势与历史采样。
 */
export function buildInterpretationContext(
  metrics: MetricDefinition[],
  records: HealthRecord[],
): InterpretationContextPayload {
  if (records.length === 0) {
    return {
      summaryText: '当前没有任何已保存记录。',
      recordCount: 0,
      latestDate: null,
    }
  }

  const asc = sortByDateAsc(records)
  const dates = asc.map((r) => r.date)
  const minD = dates.reduce((a, b) => (a < b ? a : b))
  const maxD = dates.reduce((a, b) => (a > b ? a : b))

  const lines: string[] = []
  lines.push('【数据概况】')
  lines.push(
    `共有 ${records.length} 条已保存记录；日期跨度：${minD} 至 ${maxD}。`,
  )
  lines.push(`用于「近期」分析的最近一条记录日期：${maxD}。`)
  lines.push('')

  const valueAt = (r: HealthRecord, metricId: string): string =>
    r.values.find((v) => v.metricId === metricId)?.value?.trim() ?? ''

  for (const m of metrics) {
    const points = asc
      .map((r) => {
        const raw = valueAt(r, m.id)
        if (!raw) return null
        return { date: r.date, raw }
      })
      .filter((x): x is { date: string; raw: string } => x !== null)

    if (points.length === 0) {
      lines.push(`【${m.name}】尚无已保存数值。`)
      lines.push('')
      continue
    }

    const latest = points[points.length - 1]
    const a = assessMetricValue(latest.raw, m)
    const hint = referenceRangeHint(m)
    const unit = m.unit?.trim()
    const label = unit ? `${m.name}（${unit}）` : m.name

    lines.push(`【${label}】`)
    lines.push(
      `最新（${latest.date}）：${latest.raw}；对照参考：${assessmentLabel(a)}。`,
    )
    if (hint) lines.push(`参考说明（应用内简化值）：${hint}`)

    if (points.length >= 2) {
      const p0 = points[points.length - 2]
      const trend = compareTrend(m, p0.raw, latest.raw)
      lines.push(
        `相对上一条（${p0.date}→${latest.date}）：${trend}。`,
      )
    }

    const sample = points.slice(-5)
    if (sample.length > 0) {
      lines.push(
        '历史采样（由旧到新，最多 5 点）：' +
          sample.map((p) => `${p.date}: ${p.raw}`).join('；'),
      )
    }
    lines.push('')
  }

  const metricIdSet = new Set(metrics.map((x) => x.id))
  const orphanLines: string[] = []
  for (const r of asc) {
    for (const v of r.values) {
      if (metricIdSet.has(v.metricId)) continue
      const t = v.value?.trim()
      if (!t) continue
      const u = v.unitSnapshot
        ? `${v.nameSnapshot}（${v.unitSnapshot}）`
        : v.nameSnapshot
      orphanLines.push(`${r.date} · ${u}: ${t}`)
    }
  }
  if (orphanLines.length > 0) {
    lines.push('【未归入当前指标列表的历史项】')
    lines.push(...orphanLines)
    lines.push('')
  }

  lines.push(
    '【说明】以上「对照参考」来自本应用内置的常见成人范围简化规则，可能与您的化验单或个体情况不一致。',
  )

  return {
    summaryText: lines.join('\n'),
    recordCount: records.length,
    latestDate: maxD,
  }
}
