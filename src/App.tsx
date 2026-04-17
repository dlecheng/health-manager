import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { ConfirmDialog } from './components/ConfirmDialog'
import { LabReportImportModal } from './components/LabReportImportModal'
import { MetricManagerModal } from './components/MetricManagerModal'
import { SavedRecordMetricCell } from './components/SavedRecordMetricCell'
import { TrendModal } from './components/TrendModal'
import { referenceRangeHint } from './lib/referenceRanges'
import { todayISO } from './lib/date'
import { migrateRecordsPipeline } from './lib/recordMigration'
import {
  loadMetricDefinitions,
  saveMetricDefinitions,
} from './lib/metricStorage'
import { applyCsvImportMerge, downloadDetailCsv, parseDetailCsv } from './lib/dataBackup'
import { readRecordsRaw, writeRecords } from './lib/storage'
import type { HealthRecord, MetricDefinition, RecordValue } from './types'

type FormState = {
  date: string
  byMetric: Record<string, string>
}

function emptyByMetric(metrics: MetricDefinition[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (const m of metrics) o[m.id] = ''
  return o
}

function syncByMetricKeys(
  prev: Record<string, string>,
  metrics: MetricDefinition[],
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const m of metrics) {
    next[m.id] = prev[m.id] ?? ''
  }
  return next
}

export default function App() {
  const [metrics, setMetrics] = useState<MetricDefinition[]>([])
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [form, setForm] = useState<FormState>({
    date: todayISO(),
    byMetric: {},
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [trendOpen, setTrendOpen] = useState(false)
  const [metricMgrOpen, setMetricMgrOpen] = useState(false)
  const [pendingDeleteRecordId, setPendingDeleteRecordId] = useState<string | null>(
    null,
  )
  const [labImportOpen, setLabImportOpen] = useState(false)
  const [labImportFiles, setLabImportFiles] = useState<File[]>([])
  const labFileInputRef = useRef<HTMLInputElement>(null)
  const backupCsvInputRef = useRef<HTMLInputElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const openDatePicker = useCallback(() => {
    const input = dateInputRef.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      input.focus()
    }
  }, [])

  useEffect(() => {
    const m0 = loadMetricDefinitions()
    const raw = readRecordsRaw()
    const { metrics: m1, records: r1, changed } = migrateRecordsPipeline(m0, raw)
    if (changed) {
      saveMetricDefinitions(m1)
      writeRecords(r1)
    }
    setMetrics(m1)
    setRecords(r1)
  }, [])

  useEffect(() => {
    if (metrics.length === 0) return
    setForm((f) => ({
      date: f.date,
      byMetric: syncByMetricKeys(f.byMetric, metrics),
    }))
  }, [metrics])

  const metricIdSet = useMemo(
    () => new Set(metrics.map((m) => m.id)),
    [metrics],
  )

  const showOrphanColumn = useMemo(
    () =>
      records.some((r) =>
        r.values.some((v) => !metricIdSet.has(v.metricId)),
      ),
    [records, metricIdSet],
  )

  const persistRecords = useCallback((next: HealthRecord[]) => {
    setRecords(next)
    writeRecords(next)
  }, [])

  const persistMetrics = useCallback((next: MetricDefinition[]) => {
    setMetrics(next)
    saveMetricDefinitions(next)
  }, [])

  const resetForm = useCallback(() => {
    setForm({ date: todayISO(), byMetric: emptyByMetric(metrics) })
    setEditingId(null)
  }, [metrics])

  const closeLabImport = useCallback(() => {
    setLabImportOpen(false)
    setLabImportFiles([])
  }, [])

  const handleLabReportApply = useCallback((updates: Record<string, string>) => {
    setForm((f) => ({
      ...f,
      byMetric: { ...f.byMetric, ...updates },
    }))
  }, [])

  const buildValuesForSave = (): RecordValue[] => {
    const editingRecord = editingId
      ? records.find((r) => r.id === editingId)
      : undefined
    const orphans =
      editingRecord?.values.filter((v) => !metricIdSet.has(v.metricId)) ?? []

    const next: RecordValue[] = [...orphans]
    for (const m of metrics) {
      const raw = form.byMetric[m.id]?.trim() ?? ''
      if (!raw) continue
      next.push({
        metricId: m.id,
        value: raw,
        nameSnapshot: m.name.trim(),
        unitSnapshot: m.unit.trim(),
      })
    }
    return next
  }

  const handleSave = () => {
    const values = buildValuesForSave()
    const payload = {
      date: form.date,
      values,
    }

    if (editingId) {
      persistRecords(
        records.map((r) =>
          r.id === editingId ? { ...r, ...payload } : r,
        ),
      )
    } else {
      persistRecords([...records, { id: crypto.randomUUID(), ...payload }])
    }
    resetForm()
  }

  const handleEdit = (r: HealthRecord) => {
    setEditingId(r.id)
    const byMetric = emptyByMetric(metrics)
    for (const m of metrics) {
      byMetric[m.id] =
        r.values.find((v) => v.metricId === m.id)?.value ?? ''
    }
    setForm({ date: r.date, byMetric })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const requestDeleteRecord = (id: string) => {
    setPendingDeleteRecordId(id)
  }

  const confirmDeleteRecord = () => {
    if (!pendingDeleteRecordId) return
    persistRecords(records.filter((r) => r.id !== pendingDeleteRecordId))
    if (editingId === pendingDeleteRecordId) resetForm()
    setPendingDeleteRecordId(null)
  }

  const cancelDeleteRecord = () => {
    setPendingDeleteRecordId(null)
  }

  const sortedForTable = useMemo(
    () =>
      [...records].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [records],
  )

  const handleExportDetailCsv = useCallback(() => {
    downloadDetailCsv(records)
  }, [records])

  const handleBackupCsvChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        const text = await file.text()
        const parsed = parseDetailCsv(text)
        if (!parsed.ok) {
          window.alert(parsed.error)
          return
        }
        const n = parsed.records.length
        if (n === 0) {
          window.alert('文件中没有可导入的数据（仅有表头或为空）。')
          return
        }
        if (
          !window.confirm(
            `即将合并 ${n} 条记录到当前数据。相同记录 ID 将以文件中的内容为准覆盖，并自动补充文件中出现的指标。是否继续？`,
          )
        ) {
          return
        }
        const { metrics: m2, records: r2 } = applyCsvImportMerge(
          metrics,
          records,
          parsed.records,
        )
        persistMetrics(m2)
        persistRecords(r2)
        setEditingId(null)
        setForm({ date: todayISO(), byMetric: emptyByMetric(m2) })
      } catch {
        window.alert('无法读取该文件，请确认是 UTF-8 编码的 CSV。')
      }
    },
    [metrics, records, persistMetrics, persistRecords],
  )

  const cellValue = (r: HealthRecord, metricId: string) =>
    r.values.find((v) => v.metricId === metricId)?.value ?? ''

  const orphanCell = (r: HealthRecord) => {
    const parts = r.values.filter((v) => !metricIdSet.has(v.metricId))
    if (parts.length === 0) return '—'
    return parts
      .map((v) =>
        v.unitSnapshot
          ? `${v.nameSnapshot}（${v.unitSnapshot}）: ${v.value}`
          : `${v.nameSnapshot}: ${v.value}`,
      )
      .join('；')
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-sky-50 to-white text-slate-800">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-10 text-center">
          <h1 className="text-2xl font-medium tracking-tight text-slate-800 sm:text-3xl">
            我的健康管家
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            记录化验结果，方便回顾与就诊时出示（本工具不能替代医疗建议）。
          </p>
        </header>

        <section className="rounded-2xl border border-sky-100/80 bg-white/90 p-6 shadow-sm shadow-sky-100/50 backdrop-blur-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-base font-medium text-slate-700">
              {editingId ? '编辑记录' : '新建记录'}
            </h2>
            <button
              type="button"
              onClick={() => setMetricMgrOpen(true)}
              className="shrink-0 rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-800 shadow-sm transition hover:bg-sky-50"
            >
              指标管理
            </button>
          </div>

          <div className="space-y-4">
            <label
              className="block cursor-pointer"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('input')) return
                openDatePicker()
              }}
            >
              <span className="mb-1.5 block text-sm text-slate-600">检查日期</span>
              <input
                ref={dateInputRef}
                type="date"
                className="w-full rounded-xl border border-slate-200 bg-sky-50/40 px-3 py-2.5 text-slate-800 outline-none ring-sky-200 transition focus:border-sky-300 focus:ring-2"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  const el = e.currentTarget
                  if (typeof el.showPicker !== 'function') return
                  try {
                    el.showPicker()
                  } catch {
                    return
                  }
                  e.preventDefault()
                }}
              />
            </label>

            {metrics.length === 0 ? (
              <p className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-4 text-sm text-slate-700">
                请点击指标管理添加指标
              </p>
            ) : (
              metrics.map((m) => (
                <label key={m.id} className="block">
                  <span className="mb-1.5 block text-sm text-slate-600">
                    {m.unit ? `${m.name}（${m.unit}）` : m.name}
                  </span>
                  <input
                    type="text"
                    inputMode={m.chartKind === 'urine-protein-qual' ? 'text' : 'decimal'}
                    placeholder={
                      m.chartKind === 'urine-protein-qual'
                        ? '例如 阴性、±、1+'
                        : '填写结果'
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-800 outline-none ring-sky-200 transition focus:border-sky-300 focus:ring-2"
                    value={form.byMetric[m.id] ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        byMetric: {
                          ...f.byMetric,
                          [m.id]: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ))
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <input
                ref={labFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-hidden
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []).filter((f) =>
                    f.type.startsWith('image/'),
                  )
                  e.target.value = ''
                  if (list.length === 0) return
                  setLabImportFiles(list.slice(0, 20))
                  setLabImportOpen(true)
                }}
              />
              <button
                type="button"
                onClick={() => labFileInputRef.current?.click()}
                className="rounded-xl border border-dashed border-sky-300 bg-sky-50/50 px-4 py-2.5 text-sm font-medium text-sky-800 transition hover:bg-sky-100/80"
              >
                上传检验报告（可多选）
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-sky-200/50 transition hover:bg-sky-600"
              >
                保存记录
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
                >
                  取消编辑
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="text-base font-medium text-slate-700">已保存记录</h2>
            <div className="flex flex-wrap gap-2">
              <input
                ref={backupCsvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-hidden
                onChange={handleBackupCsvChange}
              />
              <button
                type="button"
                onClick={() => setTrendOpen(true)}
                className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-sm transition hover:bg-sky-50"
              >
                查看趋势图表
              </button>
              <button
                type="button"
                onClick={handleExportDetailCsv}
                className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-sm transition hover:bg-sky-50"
              >
                导出 CSV 备份
              </button>
              <button
                type="button"
                onClick={() => backupCsvInputRef.current?.click()}
                className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-sm transition hover:bg-sky-50"
              >
                导入 CSV 备份
              </button>
            </div>
          </div>

          {sortedForTable.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-12 text-center text-slate-500">
              暂无记录，请先在上方填写并保存。
            </p>
          ) : (
            <>
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/90 shadow-sm">
              <table
                className="w-full border-collapse text-left text-sm"
                style={{ minWidth: `${280 + metrics.length * 100 + (showOrphanColumn ? 180 : 0)}px` }}
              >
                <thead>
                  <tr className="border-b border-slate-100 bg-sky-50/50">
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-slate-600">
                      日期
                    </th>
                    {metrics.map((m) => {
                      const hint = referenceRangeHint(m)
                      const title = [
                        m.unit ? `${m.name} ${m.unit}` : m.name,
                        hint,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                      return (
                        <th
                          key={m.id}
                          className="min-w-[88px] px-3 py-3 text-center font-medium text-slate-600"
                          title={title}
                        >
                          <span className="line-clamp-2">{m.name}</span>
                        </th>
                      )
                    })}
                    {showOrphanColumn && (
                      <th className="min-w-[160px] px-3 py-3 font-medium text-slate-600">
                        历史未归类
                      </th>
                    )}
                    <th className="whitespace-nowrap px-3 py-3 font-medium text-slate-600">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedForTable.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-sky-50/30"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">
                        {r.date}
                      </td>
                      {metrics.map((m) => {
                        const v = cellValue(r, m.id)
                        const hint = referenceRangeHint(m)
                        const title = [v, hint].filter(Boolean).join(' · ')
                        return (
                          <td
                            key={m.id}
                            className="max-w-[120px] px-3 py-2.5 text-center text-sm"
                            title={title || undefined}
                          >
                            <SavedRecordMetricCell raw={v} metric={m} />
                          </td>
                        )
                      })}
                      {showOrphanColumn && (
                        <td
                          className="max-w-[200px] px-3 py-2.5 text-xs text-slate-600"
                          title={orphanCell(r)}
                        >
                          {orphanCell(r)}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleEdit(r)}
                          className="mr-2 text-sky-600 hover:underline"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteRecord(r.id)}
                          className="text-rose-600 hover:underline"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              红色数值与箭头依据常见成人参考范围简化提示；不同实验室与个体情况不同，请以化验单与医生解读为准。
            </p>
            </>
          )}
        </section>
      </div>

      <TrendModal
        open={trendOpen}
        onClose={() => setTrendOpen(false)}
        records={records}
        metrics={metrics}
      />

      <MetricManagerModal
        open={metricMgrOpen}
        onClose={() => setMetricMgrOpen(false)}
        metrics={metrics}
        records={records}
        onSave={persistMetrics}
      />

      <LabReportImportModal
        open={labImportOpen}
        files={labImportFiles}
        metrics={metrics}
        onClose={closeLabImport}
        onApply={handleLabReportApply}
      />

      <ConfirmDialog
        open={pendingDeleteRecordId !== null}
        title="删除记录"
        danger
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={confirmDeleteRecord}
        onCancel={cancelDeleteRecord}
      >
        确定要删除这条已保存记录吗？删除后无法恢复。
      </ConfirmDialog>
    </div>
  )
}
