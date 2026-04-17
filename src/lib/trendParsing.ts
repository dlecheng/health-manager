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
 * 定性尿蛋白：阴性 < ± < 1+ < 2+ < 3+ < 4+ → 序数 0–5（用于折线 Y 值）
 * 返回 null 表示不匹配定性模式（可能为定量或其它文字）
 */
export function parseUrineProteinQualitative(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  const compact = raw.replace(/\s+/g, '')
  const t = compact.replace(/[（）()]/g, '')

  // 阴性
  if (
    /^(阴性|阴)$/.test(t) ||
    /^[-－]+$/.test(t) ||
    /^neg(ative)?$/i.test(t)
  ) {
    return 0
  }

  // ± / +-
  if (
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
  '阴性',
  '±',
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
