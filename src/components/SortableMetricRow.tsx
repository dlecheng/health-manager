import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { MetricChartKind, MetricDefinition } from '../types'

type Props = {
  row: MetricDefinition
  onUpdate: (
    id: string,
    patch: Partial<Pick<MetricDefinition, 'name' | 'unit' | 'chartKind'>>,
  ) => void
  onRemoveRequest: (id: string) => void
}

function DragHandle({
  attributes,
  listeners,
}: {
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
}) {
  return (
    <button
      type="button"
      className="inline-flex shrink-0 touch-none cursor-grab items-center justify-center rounded-lg border border-transparent p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 active:cursor-grabbing"
      aria-label="拖动排序"
      {...attributes}
      {...listeners}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
      </svg>
    </button>
  )
}

export function SortableMetricRow({ row, onUpdate, onRemoveRequest }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-slate-100 bg-slate-50/50 p-3 ${
        isDragging ? 'z-10 shadow-md ring-2 ring-sky-200/80' : ''
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <DragHandle attributes={attributes} listeners={listeners} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="text"
            placeholder="指标名称"
            className="min-w-[120px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
            value={row.name}
            onChange={(e) => onUpdate(row.id, { name: e.target.value })}
          />
          <input
            type="text"
            placeholder="单位（可空）"
            className="min-w-[100px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
            value={row.unit}
            onChange={(e) => onUpdate(row.id, { unit: e.target.value })}
          />
          <select
            className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
            value={row.chartKind}
            onChange={(e) =>
              onUpdate(row.id, {
                chartKind: e.target.value as MetricChartKind,
              })
            }
          >
            <option value="number">趋势：数值折线图</option>
            <option value="urine-protein-qual">趋势：尿蛋白定性序数</option>
          </select>
          <button
            type="button"
            onClick={() => onRemoveRequest(row.id)}
            className="shrink-0 rounded-lg border border-rose-100 px-2.5 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            删除
          </button>
        </div>
      </div>
    </li>
  )
}
