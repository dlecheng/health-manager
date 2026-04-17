import type { MetricDefinition } from '../types'
import { assessMetricValue } from '../lib/referenceRanges'

type Props = {
  raw: string
  metric: MetricDefinition
}

export function SavedRecordMetricCell({ raw, metric }: Props) {
  const t = raw.trim()
  if (!t) {
    return <span className="block text-center text-slate-500">—</span>
  }

  const status = assessMetricValue(t, metric)

  const colorClass =
    status === 'high' || status === 'low' ? 'text-red-600' : 'text-slate-700'

  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center justify-center gap-0.5 ${colorClass}`}
    >
      <span className="truncate" title={t}>
        {t}
      </span>
      {status === 'high' && (
        <span className="shrink-0 font-medium" aria-label="高于常见参考范围">
          ↑
        </span>
      )}
      {status === 'low' && (
        <span className="shrink-0 font-medium" aria-label="低于常见参考范围">
          ↓
        </span>
      )}
    </span>
  )
}
