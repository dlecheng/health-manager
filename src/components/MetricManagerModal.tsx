import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import type { HealthRecord, MetricDefinition } from '../types'
import { RECOMMENDED_METRICS, type RecommendedMetric } from '../lib/recommendedMetrics'
import { ConfirmDialog } from './ConfirmDialog'
import { SortableMetricRow } from './SortableMetricRow'

type Props = {
  open: boolean
  onClose: () => void
  metrics: MetricDefinition[]
  records: HealthRecord[]
  onSave: (next: MetricDefinition[]) => void
}

function countRecordsUsingMetric(
  records: HealthRecord[],
  metricId: string,
): number {
  return records.filter((r) =>
    r.values.some((v) => v.metricId === metricId),
  ).length
}

type MetricDeleteState =
  | null
  | { kind: 'simple'; row: MetricDefinition }
  | {
      kind: 'twoStep'
      row: MetricDefinition
      recordCount: number
      step: 1 | 2
    }

export function MetricManagerModal({
  open,
  onClose,
  metrics,
  records,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<MetricDefinition[]>(metrics)
  const [metricDelete, setMetricDelete] = useState<MetricDeleteState>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    if (open) setDraft(metrics.map((m) => ({ ...m })))
  }, [open, metrics])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = draft.findIndex((m) => m.id === active.id)
    const newIndex = draft.findIndex((m) => m.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    persist(arrayMove(draft, oldIndex, newIndex))
  }

  const persist = (next: MetricDefinition[]) => {
    setDraft(next)
    onSave(next)
  }

  const addRow = () => {
    persist([
      ...draft,
      {
        id: crypto.randomUUID(),
        name: '',
        unit: '',
        chartKind: 'number',
      },
    ])
  }

  const updateRow = (
    id: string,
    patch: Partial<Pick<MetricDefinition, 'name' | 'unit' | 'chartKind'>>,
  ) => {
    persist(
      draft.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  const requestRemoveRow = (id: string) => {
    const row = draft.find((r) => r.id === id)
    if (!row) return
    const recordCount = countRecordsUsingMetric(records, id)
    if (recordCount === 0) {
      setMetricDelete({ kind: 'simple', row })
    } else {
      setMetricDelete({
        kind: 'twoStep',
        row,
        recordCount,
        step: 1,
      })
    }
  }

  const applyRemove = (id: string) => {
    persist(draft.filter((r) => r.id !== id))
    setMetricDelete(null)
  }

  const handleMetricDeleteConfirm = () => {
    if (!metricDelete) return
    if (metricDelete.kind === 'simple') {
      applyRemove(metricDelete.row.id)
      return
    }
    if (metricDelete.step === 1) {
      setMetricDelete({ ...metricDelete, step: 2 })
      return
    }
    applyRemove(metricDelete.row.id)
  }

  const handleMetricDeleteCancel = () => {
    setMetricDelete(null)
  }

  const addRecommended = (rec: RecommendedMetric) => {
    const exists = draft.some(
      (d) => d.name.trim() === rec.name.trim() && d.unit.trim() === rec.unit.trim(),
    )
    if (exists) return
    persist([
      ...draft,
      {
        id: crypto.randomUUID(),
        name: rec.name,
        unit: rec.unit,
        chartKind: rec.chartKind ?? 'number',
      },
    ])
  }

  const metricDeleteDialog = (() => {
    if (!metricDelete) return null
    if (metricDelete.kind === 'simple') {
      return (
        <ConfirmDialog
          open
          title="删除指标"
          danger
          confirmLabel="删除"
          cancelLabel="取消"
          onConfirm={handleMetricDeleteConfirm}
          onCancel={handleMetricDeleteCancel}
        >
          确定从列表中删除「{metricDelete.row.name || '未命名指标'}」吗？
        </ConfirmDialog>
      )
    }
    if (metricDelete.step === 1) {
      return (
        <ConfirmDialog
          open
          title="删除指标"
          confirmLabel="继续"
          cancelLabel="取消"
          onConfirm={handleMetricDeleteConfirm}
          onCancel={handleMetricDeleteCancel}
        >
          该指标已在 {metricDelete.recordCount}{' '}
          条已保存记录中出现。删除后，这些记录中的数据仍会保留历史快照，但无法再从当前指标列表中填写该项。
          <br />
          <br />
          是否继续？
        </ConfirmDialog>
      )
    }
    return (
      <ConfirmDialog
        open
        title="再次确认"
        danger
        confirmLabel="确定删除"
        cancelLabel="取消"
        onConfirm={handleMetricDeleteConfirm}
        onCancel={handleMetricDeleteCancel}
      >
        请再次确认：确定从指标列表中删除「
        {metricDelete.row.name || '未命名指标'}」吗？此操作不可撤销。
      </ConfirmDialog>
    )
  })()

  if (!open) {
    return metricDeleteDialog
  }

  return (
    <>
      {metricDeleteDialog}
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-mgr-title"
      >
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-sky-100 bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id="metric-mgr-title" className="text-lg font-medium text-slate-800">
                指标管理
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                此处列表与「新建记录」中的指标一致：修改名称或单位后，保存的新记录将使用当前名称；列表中所有指标均支持增删改。拖动左侧手柄可调整顺序，顺序将同步到新建记录、已保存记录表格列与趋势图。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              完成
            </button>
          </div>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-slate-700">常用指标推荐</h3>
            <p className="mb-2 text-xs text-slate-500">点击加入列表（同名同单位不重复）</p>
            <div className="flex flex-wrap gap-2">
              {RECOMMENDED_METRICS.map((rec) => (
                <button
                  key={`${rec.name}-${rec.unit}`}
                  type="button"
                  onClick={() => addRecommended(rec)}
                  className="rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1 text-xs text-sky-900 transition hover:bg-sky-100"
                >
                  {rec.name}
                  {rec.unit ? (
                    <span className="text-slate-500"> {rec.unit}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-slate-700">全部指标</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  拖动手柄调整顺序
                </p>
              </div>
              <button
                type="button"
                onClick={addRow}
                className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
              >
                ＋ 添加指标
              </button>
            </div>

            {draft.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center text-sm text-slate-500">
                请从上方「常用指标推荐」添加，或点击「添加指标」。
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={draft.map((m) => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-3">
                    {draft.map((row) => (
                      <SortableMetricRow
                        key={row.id}
                        row={row}
                        onUpdate={updateRow}
                        onRemoveRequest={requestRemoveRow}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
