import { BUILTIN_IDS } from './defaultMetrics'
import { migrateRecordsPipeline } from './recordMigration'
import { todayISO } from './date'
import type { HealthRecord, MetricDefinition, RecordValue } from '../types'

/** 与导出表头一致，导入时用于校验 */
export const DETAIL_CSV_HEADERS = [
  '记录ID',
  '检查日期',
  '指标ID',
  '指标名称',
  '单位',
  '结果值',
] as const

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** 长表：每条指标结果一行，便于在表格软件中筛选、透视 */
export function buildDetailCsv(records: HealthRecord[]): string {
  const header = [...DETAIL_CSV_HEADERS]
  const lines = [header.map(escapeCsvCell).join(',')]
  const sorted = [...records].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  for (const r of sorted) {
    for (const v of r.values) {
      lines.push(
        [
          r.id,
          r.date,
          v.metricId,
          v.nameSnapshot,
          v.unitSnapshot,
          v.value,
        ]
          .map((c) => escapeCsvCell(String(c)))
          .join(','),
      )
    }
  }
  return lines.join('\r\n')
}

export function downloadDetailCsv(records: HealthRecord[]): void {
  const day = todayISO()
  const csv = buildDetailCsv(records)
  const blob = new Blob(['\ufeff', csv], {
    type: 'text/csv;charset=utf-8',
  })
  triggerDownload(`health-manager-detail-${day}.csv`, blob)
}

/** 解析单行 CSV（支持引号与转义引号） */
export function parseCsvRow(line: string): string[] {
  const out: string[] = []
  let i = 0
  let cur = ''
  let inQuote = false
  while (i < line.length) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuote = false
        i++
        continue
      }
      cur += c
      i++
      continue
    }
    if (c === '"') {
      inQuote = true
      i++
      continue
    }
    if (c === ',') {
      out.push(cur)
      cur = ''
      i++
      continue
    }
    cur += c
    i++
  }
  out.push(cur)
  return out
}

function normalizeHeaderCell(s: string): string {
  return s.replace(/^\ufeff/, '').trim()
}

export type ParseDetailCsvResult =
  | { ok: true; records: HealthRecord[] }
  | { ok: false; error: string }

/**
 * 解析本应用导出的明细 CSV。
 * 相同「记录 ID + 指标 ID」出现多次时，以最后一次为准。
 */
export function parseDetailCsv(text: string): ParseDetailCsvResult {
  const raw = text.replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) {
    return { ok: false, error: '文件为空' }
  }

  const headerCells = parseCsvRow(lines[0]).map(normalizeHeaderCell)
  if (headerCells.length !== DETAIL_CSV_HEADERS.length) {
    return {
      ok: false,
      error: `表头列数不正确（应为 ${DETAIL_CSV_HEADERS.length} 列）`,
    }
  }
  for (let c = 0; c < DETAIL_CSV_HEADERS.length; c++) {
    if (headerCells[c] !== DETAIL_CSV_HEADERS[c]) {
      return {
        ok: false,
        error: `表头不匹配：第 ${c + 1} 列应为「${DETAIL_CSV_HEADERS[c]}」`,
      }
    }
  }

  type Agg = {
    date: string
    valueByMetric: Map<string, RecordValue>
  }
  const byRecordId = new Map<string, Agg>()

  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvRow(lines[li])
    if (cells.length !== DETAIL_CSV_HEADERS.length) {
      return {
        ok: false,
        error: `第 ${li + 1} 行列数为 ${cells.length}，应为 ${DETAIL_CSV_HEADERS.length}`,
      }
    }
    const [recordId, date, metricId, nameSnapshot, unitSnapshot, value] = cells
    if (!recordId.trim()) {
      return { ok: false, error: `第 ${li + 1} 行：记录 ID 不能为空` }
    }
    if (!date.trim()) {
      return { ok: false, error: `第 ${li + 1} 行：检查日期不能为空` }
    }
    if (!metricId.trim()) {
      return { ok: false, error: `第 ${li + 1} 行：指标 ID 不能为空` }
    }

    let agg = byRecordId.get(recordId)
    if (!agg) {
      agg = { date: date.trim(), valueByMetric: new Map() }
      byRecordId.set(recordId, agg)
    } else if (agg.date !== date.trim()) {
      return {
        ok: false,
        error: `记录「${recordId}」存在不一致的检查日期`,
      }
    }

    const rv: RecordValue = {
      metricId: metricId.trim(),
      value: value,
      nameSnapshot: nameSnapshot.trim() || '未命名指标',
      unitSnapshot: typeof unitSnapshot === 'string' ? unitSnapshot : '',
    }
    agg.valueByMetric.set(rv.metricId, rv)
  }

  const records: HealthRecord[] = []
  for (const [id, agg] of byRecordId) {
    records.push({
      id,
      date: agg.date,
      values: Array.from(agg.valueByMetric.values()),
    })
  }

  return { ok: true, records }
}

function chartKindForMetricId(metricId: string): MetricDefinition['chartKind'] {
  return metricId === BUILTIN_IDS.proteinQual ? 'urine-protein-qual' : 'number'
}

function mergeMetricsForImport(
  current: MetricDefinition[],
  importedRecords: HealthRecord[],
): MetricDefinition[] {
  const seen = new Set(current.map((m) => m.id))
  const out = [...current]
  for (const r of importedRecords) {
    for (const v of r.values) {
      if (seen.has(v.metricId)) continue
      seen.add(v.metricId)
      out.push({
        id: v.metricId,
        name: v.nameSnapshot.trim() || '未命名指标',
        unit: v.unitSnapshot,
        chartKind: chartKindForMetricId(v.metricId),
      })
    }
  }
  return out
}

function mergeRecordLists(
  current: HealthRecord[],
  imported: HealthRecord[],
): HealthRecord[] {
  const byId = new Map(current.map((r) => [r.id, r]))
  for (const r of imported) {
    byId.set(r.id, r)
  }
  return Array.from(byId.values())
}

/**
 * 将导入记录与当前数据合并（相同记录 ID 以导入为准覆盖），并走迁移管线规范化。
 */
export function applyCsvImportMerge(
  currentMetrics: MetricDefinition[],
  currentRecords: HealthRecord[],
  importedRecords: HealthRecord[],
): { metrics: MetricDefinition[]; records: HealthRecord[] } {
  const mergedM = mergeMetricsForImport(currentMetrics, importedRecords)
  const mergedR = mergeRecordLists(currentRecords, importedRecords)
  const { metrics, records } = migrateRecordsPipeline(mergedM, mergedR)
  return { metrics, records }
}
