import type { HealthRecord } from '../types'

/** Sort records by date ascending for trend X axis */
export function sortByDateAsc(records: HealthRecord[]): HealthRecord[] {
  return [...records].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )
}

export function parseNum(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const m = t.match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/**
 * 定性尿蛋白：阴性(-) < 弱阳性(±) < 1+ < 2+ < 3+ < 4+ → 序数 0–5（用于折线 Y 值）
 * 返回 null 表示不匹配定性模式（可能为定量或其它文字）
 */
export function parseUrineProteinQualitative(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  const compact = raw.replace(/\s+/g, '')
  const t = compact.replace(/[（）()]/g, '')

  // 阴性(-)（兼容「阴性」「阴」「阴性-」等，含 OCR 常见写法）
  if (
    /^阴性(?:[-－])?$/.test(t) ||
    /^阴$/.test(t) ||
    /^[-－]+$/.test(t) ||
    /^neg(ative)?$/i.test(t)
  ) {
    return 0
  }

  // 弱阳性(±)：与 ±、TRACE 等同档，介于阴性与 1+ 之间（兼容「弱阳性±」）
  if (
    /弱阳性/.test(t) ||
    t === '弱阳' ||
    t === '±' ||
    t === '+-' ||
    t === '+－' ||
    t === '＋－' ||
    /^trace$/i.test(t)
  ) {
    return 1
  }

  // 1+ … 4+（兼容全角数字与加号）
  if (/^(1|１)[+＋]$/.test(t)) return 2
  if (/^2[+＋]$/.test(t)) return 3
  if (/^3[+＋]$/.test(t)) return 4
  if (/^4[+＋]$/.test(t)) return 5

  return null
}

/** Y 轴刻度与提示用文案（与 parseUrineProteinQualitative 返回值 0–5 对应） */
export const URINE_PROTEIN_QUAL_LABELS = [
  '阴性(-)',
  '弱阳性(±)',
  '1+',
  '2+',
  '3+',
  '4+',
] as const

export function collectValueMetricIds(records: HealthRecord[]): string[] {
  const set = new Set<string>()
  for (const r of records) {
    for (const v of r.values) {
      if (v.metricId) set.add(v.metricId)
    }
  }
  return [...set].sort()
}
