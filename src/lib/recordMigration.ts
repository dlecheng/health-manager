import { BUILTIN_IDS, createDefaultMetricList } from './defaultMetrics'
import { parseNum, parseUrineProteinQualitative } from './trendParsing'
import type { HealthRecord, MetricDefinition, RecordValue } from '../types'

const DEFAULT_LOOKUP = Object.fromEntries(
  createDefaultMetricList().map((m) => [m.id, m]),
)

type LegacyExtra = { id: string; name: string; value: string }

function isLegacyExtra(x: unknown): x is LegacyExtra {
  return (
    typeof x === 'object' &&
    x !== null &&
    'name' in x &&
    !('metricId' in x)
  )
}

function isRecordValue(x: unknown): x is RecordValue {
  return (
    typeof x === 'object' &&
    x !== null &&
    'metricId' in x &&
    typeof (x as RecordValue).metricId === 'string'
  )
}

function findOrCreateMetricForName(
  name: string,
  metrics: MetricDefinition[],
): MetricDefinition {
  const t = name.trim()
  const existing = metrics.find((m) => m.name.trim() === t)
  if (existing) return existing
  const created: MetricDefinition = {
    id: crypto.randomUUID(),
    name: t,
    unit: '',
    chartKind: 'number',
  }
  metrics.push(created)
  return created
}

function normalizeValue(v: unknown, metrics: MetricDefinition[]): RecordValue | null {
  if (!isRecordValue(v)) return null
  const def = metrics.find((m) => m.id === v.metricId)
  return {
    metricId: v.metricId,
    value: typeof v.value === 'string' ? v.value : '',
    nameSnapshot:
      typeof v.nameSnapshot === 'string' && v.nameSnapshot.trim()
        ? v.nameSnapshot
        : def?.name ?? '未知指标',
    unitSnapshot:
      typeof v.unitSnapshot === 'string'
        ? v.unitSnapshot
        : (def?.unit ?? ''),
  }
}

function legacyToValues(
  o: Record<string, unknown>,
  metrics: MetricDefinition[],
): RecordValue[] {
  const values: RecordValue[] = []

  const pushBuiltin = (
    id: keyof typeof BUILTIN_IDS,
    raw: string | undefined,
  ) => {
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (!s) return
    const mid = BUILTIN_IDS[id]
    const def = metrics.find((m) => m.id === mid) ?? DEFAULT_LOOKUP[mid]
    values.push({
      metricId: mid,
      value: s,
      nameSnapshot: def.name,
      unitSnapshot: def.unit,
    })
  }

  pushBuiltin('acr', o.urineACR as string | undefined)

  const pq = o.urineProteinQualitative as string | undefined
  const p24 = o.urineProteinQuant24h as string | undefined
  const legacyUrine = o.urineProtein as string | undefined

  if (!pq?.trim() && !p24?.trim() && typeof legacyUrine === 'string' && legacyUrine.trim()) {
    const s = legacyUrine.trim()
    if (parseUrineProteinQualitative(s) !== null) {
      pushBuiltin('proteinQual', s)
    } else if (parseNum(s) !== null) {
      pushBuiltin('protein24h', s)
    } else {
      pushBuiltin('proteinQual', s)
    }
  } else {
    pushBuiltin('proteinQual', pq)
    pushBuiltin('protein24h', p24)
  }

  pushBuiltin('creatinine', o.creatinine as string | undefined)

  const extras = o.extras
  if (Array.isArray(extras)) {
    for (const ex of extras) {
      if (isLegacyExtra(ex)) {
        const name = ex.name.trim()
        const value = ex.value.trim()
        if (!name && !value) continue
        const def = name ? findOrCreateMetricForName(name, metrics) : null
        if (!def) continue
        values.push({
          metricId: def.id,
          value,
          nameSnapshot: def.name,
          unitSnapshot: def.unit,
        })
        continue
      }
      if (isRecordValue(ex)) {
        const nv = normalizeValue(ex, metrics)
        if (nv) values.push(nv)
      }
    }
  }

  return values
}

/**
 * 合并旧版顶层字段（尿 ACR、尿蛋白等）与新版 values 数组。
 * 先前实现若存在非空 values 则完全忽略顶层字段，会导致已填写的四项指标丢失。
 * 规则：先写入从顶层解析出的数据，再用 values 里「非空」的项覆盖同 metricId。
 */
function mergeLegacyAndValues(
  o: Record<string, unknown>,
  metrics: MetricDefinition[],
): RecordValue[] {
  const map = new Map<string, RecordValue>()

  for (const v of legacyToValues(o, metrics)) {
    map.set(v.metricId, v)
  }

  if (Array.isArray(o.values)) {
    for (const item of o.values) {
      const nv = normalizeValue(item, metrics)
      if (!nv) continue
      if (nv.value.trim() === '') continue
      map.set(nv.metricId, nv)
    }
  }

  return [...map.values()]
}

function migrateOneRecord(
  raw: unknown,
  metrics: MetricDefinition[],
): HealthRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : ''
  const date = typeof o.date === 'string' ? o.date : ''
  if (!id || !date) return null

  return {
    id,
    date,
    values: mergeLegacyAndValues(o, metrics),
  }
}

function hasLegacyFields(o: Record<string, unknown>): boolean {
  return !!(
    o.urineACR ||
    o.urineProteinQualitative ||
    o.urineProteinQuant24h ||
    o.creatinine ||
    o.urineProtein ||
    (Array.isArray(o.extras) && o.extras.length > 0)
  )
}

/**
 * 将本地读出的记录与指标列表统一迁移为 HealthRecord + 补齐 MetricDefinition
 */
export function migrateRecordsPipeline(
  metrics: MetricDefinition[],
  rawRecords: unknown[],
): { metrics: MetricDefinition[]; records: HealthRecord[]; changed: boolean } {
  const metricsBefore = JSON.stringify(metrics)
  const m = [...metrics]
  const records: HealthRecord[] = []
  let changed = false

  const prevRecordsRaw = JSON.stringify(rawRecords)

  for (const raw of rawRecords) {
    const r = migrateOneRecord(raw, m)
    if (r) records.push(r)
  }

  const hasLegacyShape = rawRecords.some((row) => {
    if (!row || typeof row !== 'object') return false
    const o = row as Record<string, unknown>
    if (!Array.isArray(o.values)) return true
    if (o.values.length > 0) return false
    return hasLegacyFields(o)
  })

  if (hasLegacyShape) changed = true

  const nextRaw = JSON.stringify(records)
  if (nextRaw !== prevRecordsRaw) changed = true
  if (JSON.stringify(m) !== metricsBefore) changed = true

  return { metrics: m, records, changed }
}
