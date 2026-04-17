import { BUILTIN_IDS } from './defaultMetrics'
import { parseNum, parseUrineProteinQualitative } from './trendParsing'
import type { MetricDefinition } from '../types'

/**
 * 成人常见化验参考范围（简化、不同实验室/人群会有差异）。
 * 仅用于本应用内展示提示，不能替代化验单与医生解读。
 */

export type RangeAssessment = 'normal' | 'high' | 'low' | 'unknown'

type RefSpec =
  | { kind: 'two'; min: number; max: number }
  | { kind: 'upper'; max: number }
  | { kind: 'lower'; min: number }
  | { kind: 'qualitative' }

function normName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（）()]/g, '')
    .toLowerCase()
}

/** 指标 id → 参考范围规则（优先） */
const BY_ID: Record<string, RefSpec> = {
  [BUILTIN_IDS.acr]: { kind: 'two', min: 0, max: 30 },
  [BUILTIN_IDS.proteinQual]: { kind: 'qualitative' },
  [BUILTIN_IDS.protein24h]: { kind: 'two', min: 0, max: 0.15 },
  [BUILTIN_IDS.creatinine]: { kind: 'two', min: 45, max: 115 },
}

/** 规范化指标名称 → 参考范围（用户自定义名称若能匹配） */
const BY_NORMALIZED_NAME: Record<string, RefSpec> = {
  尿acr: { kind: 'two', min: 0, max: 30 },
  尿蛋白定性: { kind: 'qualitative' },
  尿蛋白定量: { kind: 'two', min: 0, max: 0.15 },
  '24小时尿蛋白定量': { kind: 'two', min: 0, max: 0.15 },
  尿蛋白肌酐比值: { kind: 'two', min: 0, max: 3.5 },
  血肌酐: { kind: 'two', min: 45, max: 115 },
  egfr: { kind: 'lower', min: 90 },
  血尿素氮: { kind: 'two', min: 2.9, max: 7.1 },
  胱抑素c: { kind: 'two', min: 0.53, max: 1.09 },
  血钾: { kind: 'two', min: 3.5, max: 5.3 },
  血钠: { kind: 'two', min: 135, max: 145 },
  血氯: { kind: 'two', min: 96, max: 108 },
  血碳酸氢根: { kind: 'two', min: 22, max: 28 },
  血钙: { kind: 'two', min: 2.11, max: 2.52 },
  血磷: { kind: 'two', min: 0.85, max: 1.51 },
  全段甲状旁腺激素: { kind: 'two', min: 15, max: 65 },
  '25羟维生素d': { kind: 'two', min: 30, max: 100 },
  血红蛋白: { kind: 'two', min: 110, max: 160 },
  血清铁蛋白: { kind: 'two', min: 20, max: 300 },
  转铁蛋白饱和度: { kind: 'two', min: 20, max: 50 },
  空腹血糖: { kind: 'two', min: 3.9, max: 6.1 },
  糖化血红蛋白: { kind: 'two', min: 4.0, max: 6.0 },
  总胆固醇: { kind: 'two', min: 2.8, max: 5.2 },
  甘油三酯: { kind: 'two', min: 0.45, max: 1.7 },
  低密度脂蛋白胆固醇: { kind: 'upper', max: 3.4 },
  血清白蛋白: { kind: 'two', min: 35, max: 55 },
  尿酸: { kind: 'two', min: 150, max: 420 },
}

/** 名称包含即匹配（长串优先） */
const NAME_CONTAINS: { needle: string; spec: RefSpec }[] = [
  { needle: '尿蛋白/肌酐', spec: { kind: 'two', min: 0, max: 3.5 } },
  { needle: '甲状旁腺激素', spec: { kind: 'two', min: 15, max: 65 } },
  { needle: '维生素d', spec: { kind: 'two', min: 30, max: 100 } },
  { needle: '低密度脂蛋白', spec: { kind: 'upper', max: 3.4 } },
  { needle: '胱抑素', spec: { kind: 'two', min: 0.53, max: 1.09 } },
  { needle: '碳酸氢根', spec: { kind: 'two', min: 22, max: 28 } },
  { needle: '铁蛋白', spec: { kind: 'two', min: 20, max: 300 } },
  { needle: '转铁蛋白饱和度', spec: { kind: 'two', min: 20, max: 50 } },
  { needle: '糖化血红蛋白', spec: { kind: 'two', min: 4.0, max: 6.0 } },
  { needle: '血红蛋白', spec: { kind: 'two', min: 110, max: 160 } },
  { needle: '尿蛋白定性', spec: { kind: 'qualitative' } },
  { needle: '蛋白定性', spec: { kind: 'qualitative' } },
]

function resolveSpec(metric: MetricDefinition): RefSpec | null {
  const byId = BY_ID[metric.id]
  if (byId) return byId

  const n = normName(metric.name)
  const exact = BY_NORMALIZED_NAME[n]
  if (exact) return exact

  for (const { needle, spec } of NAME_CONTAINS) {
    if (n.includes(normName(needle))) return spec
  }

  if (metric.chartKind === 'urine-protein-qual') {
    return { kind: 'qualitative' }
  }

  return null
}

function assessNumeric(v: number, spec: RefSpec): RangeAssessment {
  if (spec.kind === 'qualitative') return 'unknown'
  if (spec.kind === 'two') {
    if (v < spec.min) return 'low'
    if (v > spec.max) return 'high'
    return 'normal'
  }
  if (spec.kind === 'upper') {
    if (v > spec.max) return 'high'
    return 'normal'
  }
  if (spec.kind === 'lower') {
    if (v < spec.min) return 'low'
    return 'normal'
  }
  return 'unknown'
}

export function assessMetricValue(
  raw: string,
  metric: MetricDefinition,
): RangeAssessment {
  const spec = resolveSpec(metric)
  if (!spec) return 'unknown'

  if (spec.kind === 'qualitative') {
    const t = raw.trim()
    if (!t) return 'unknown'
    const q = parseUrineProteinQualitative(t)
    if (q === null) return 'unknown'
    if (q === 0) return 'normal'
    return 'high'
  }

  const num = parseNum(raw)
  if (num === null) return 'unknown'
  return assessNumeric(num, spec)
}

export function referenceRangeHint(metric: MetricDefinition): string | null {
  const spec = resolveSpec(metric)
  if (!spec) return null
  if (spec.kind === 'qualitative') {
    return '定性：阴性为常见目标，阳性请结合临床'
  }
  if (spec.kind === 'two') {
    return `${spec.min}～${spec.max}（约，同单位）`
  }
  if (spec.kind === 'upper') {
    return `宜 ≤ ${spec.max}（约，同单位）`
  }
  if (spec.kind === 'lower') {
    return `宜 ≥ ${spec.min}（约，同单位）`
  }
  return null
}

function fmtTickNumber(v: number): string {
  if (!Number.isFinite(v)) return ''
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 10) return String(Math.round(v * 10) / 10)
  if (Math.abs(v) >= 1) return String(Math.round(v * 100) / 100)
  return String(Math.round(v * 1000) / 1000)
}

function computeNumericYDomain(xs: number[], spec: RefSpec | null): [number, number] {
  if (xs.length === 0) {
    if (spec?.kind === 'two') {
      const w = spec.max - spec.min || 1
      const p = w * 0.12
      return [spec.min - p, spec.max + p]
    }
    if (spec?.kind === 'upper') {
      const hi = spec.max || 10
      return [0, hi * 1.15]
    }
    if (spec?.kind === 'lower') {
      const lo = spec.min
      return [lo * 0.85, lo * 1.2]
    }
    return [0, 1]
  }

  let lo = Math.min(...xs)
  let hi = Math.max(...xs)
  if (!spec || spec.kind === 'qualitative') {
    const pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.05, 0.5)
    return [lo - pad, hi + pad]
  }
  if (spec.kind === 'two') {
    lo = Math.min(lo, spec.min)
    hi = Math.max(hi, spec.max)
  } else if (spec.kind === 'upper') {
    hi = Math.max(hi, spec.max)
    lo = Math.min(lo, Math.min(...xs), spec.max)
  } else if (spec.kind === 'lower') {
    lo = Math.min(lo, spec.min)
    hi = Math.max(hi, Math.max(...xs), spec.min)
  }
  if (lo >= hi) hi = lo + 1
  const pad = Math.max((hi - lo) * 0.08, Math.abs(hi) * 0.05, 0.01)
  return [lo - pad, hi + pad]
}

function clipReferenceBand(
  spec: RefSpec | null,
  domain: [number, number],
): { y1: number; y2: number } | null {
  if (!spec || spec.kind === 'qualitative') return null
  const [d0, d1] = domain
  if (spec.kind === 'two') {
    const y1 = Math.max(spec.min, d0)
    const y2 = Math.min(spec.max, d1)
    if (y1 >= y2) return null
    return { y1, y2 }
  }
  if (spec.kind === 'upper') {
    const y1 = d0
    const y2 = Math.min(spec.max, d1)
    if (y1 >= y2) return null
    return { y1, y2 }
  }
  if (spec.kind === 'lower') {
    const y1 = Math.max(spec.min, d0)
    const y2 = d1
    if (y1 >= y2) return null
    return { y1, y2 }
  }
  return null
}

function buildNumericYAxisTicks(domain: [number, number], spec: RefSpec | null): number[] {
  const [d0, d1] = domain
  const span = d1 - d0
  const n = 5
  const step = span / n
  const ticks: number[] = []
  for (let i = 0; i <= n; i++) {
    ticks.push(d0 + step * i)
  }
  /** 含端点，避免参考边界恰落在 domain 边缘时被漏掉 */
  const addIfInDomain = (v: number) => {
    if (v >= d0 - 1e-9 && v <= d1 + 1e-9) ticks.push(v)
  }
  if (spec?.kind === 'two') {
    addIfInDomain(spec.min)
    addIfInDomain(spec.max)
  } else if (spec?.kind === 'upper') {
    addIfInDomain(spec.max)
  } else if (spec?.kind === 'lower') {
    addIfInDomain(spec.min)
  }
  const rounded = ticks.map((t) => Number(t.toPrecision(5)))
  return [...new Set(rounded)].sort((a, b) => a - b)
}

/** 趋势图 Y 轴仅用数字，避免「（参考下限）」等长文案在轴左侧被裁切；参考含义见标题说明与绿色带 */
function formatNumericYTick(v: number): string {
  return fmtTickNumber(v)
}

/** 趋势图：Y 轴域、参考带、刻度 */
export function getNumericTrendChartConfig(
  metric: MetricDefinition,
  values: (number | null)[],
): {
  domain: [number, number]
  referenceArea: { y1: number; y2: number } | null
  ticks: number[]
  tickFormatter: (v: number) => string
} {
  const spec = resolveSpec(metric)
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v))
  const domain = computeNumericYDomain(xs, spec)
  const referenceArea = clipReferenceBand(spec, domain)
  const ticks = buildNumericYAxisTicks(domain, spec)
  return {
    domain,
    referenceArea,
    ticks,
    tickFormatter: formatNumericYTick,
  }
}
