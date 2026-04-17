import type { ReactNode } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HealthRecord, MetricDefinition } from '../types'
import {
  getNumericTrendChartConfig,
  referenceRangeHint,
} from '../lib/referenceRanges'
import {
  parseNum,
  parseUrineProteinQualitative,
  sortByDateAsc,
  URINE_PROTEIN_QUAL_LABELS,
} from '../lib/trendParsing'

type Props = {
  open: boolean
  onClose: () => void
  records: HealthRecord[]
  metrics: MetricDefinition[]
}

/** xKey 必须用记录 id，避免同一天多条数据时 X 轴类目重复导致 Recharts 悬停/tooltip 异常 */
type NumericPoint = { xKey: string; date: string; value: number | null }
type QualPoint = {
  xKey: string
  date: string
  value: number | null
  label: string | null
}

/** 与所有趋势图共用；纵轴为短数字/定性档，左侧适度留白即可 */
const TREND_CHART_MARGIN = { top: 8, right: 12, left: 6, bottom: 12 }
const Y_AXIS_WIDTH = 72
const Y_TICK_PROPS = { fontSize: 10, fill: '#64748b' } as const
const REF_AREA_GREEN = { fill: '#22c55e', fillOpacity: 0.14, strokeOpacity: 0 as number }
const TOOLTIP_BOX_STYLE = {
  borderRadius: '12px',
  border: '1px solid #e0f2fe',
  fontSize: '13px',
}

function valueForMetric(r: HealthRecord, metricId: string): string {
  return r.values.find((v) => v.metricId === metricId)?.value ?? ''
}

function chartTitle(m: MetricDefinition, records: HealthRecord[]): string {
  if (m.unit) return `${m.name}（${m.unit}）`
  const snap = records
    .flatMap((r) => r.values)
    .find((v) => v.metricId === m.id)
  if (snap?.nameSnapshot) {
    return snap.unitSnapshot
      ? `${snap.nameSnapshot}（${snap.unitSnapshot}）`
      : snap.nameSnapshot
  }
  return m.name
}

function ChartShell({
  title,
  hint,
  unit,
  children,
  empty,
}: {
  title: string
  hint?: string
  unit?: string
  children: ReactNode
  empty: boolean
}) {
  return (
    <section className="rounded-xl border border-slate-100 bg-sky-50/30 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-slate-800">{title}</h3>
        {unit && (
          <p className="mt-0.5 text-xs text-slate-500">单位：{unit}</p>
        )}
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      {empty ? (
        <p className="rounded-lg bg-white/80 px-3 py-6 text-center text-sm text-slate-500">
          暂无可用数据点
        </p>
      ) : (
        <div className="h-[260px] w-full min-w-0">
          {children}
        </div>
      )}
    </section>
  )
}

function NumericLineChart({
  data,
  color,
  name,
  metric,
}: {
  data: NumericPoint[]
  color: string
  name: string
  metric: MetricDefinition
}) {
  const values = data.map((d) => d.value)
  const { domain, referenceArea, ticks, tickFormatter } =
    getNumericTrendChartConfig(metric, values)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={TREND_CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
        <XAxis
          dataKey="xKey"
          type="category"
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(xKey: string) => {
            const row = data.find((d) => d.xKey === xKey)
            return row?.date ?? xKey
          }}
        />
        <YAxis
          domain={domain}
          ticks={ticks}
          tickFormatter={tickFormatter}
          tick={Y_TICK_PROPS}
          width={Y_AXIS_WIDTH}
          tickMargin={6}
        />
        {referenceArea && (
          <ReferenceArea
            y1={referenceArea.y1}
            y2={referenceArea.y2}
            fill={REF_AREA_GREEN.fill}
            fillOpacity={REF_AREA_GREEN.fillOpacity}
            strokeOpacity={REF_AREA_GREEN.strokeOpacity}
            ifOverflow="visible"
            style={{ pointerEvents: 'none' }}
          />
        )}
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0]
            const row = p.payload as NumericPoint
            const v = p.value
            const n = typeof v === 'number' ? v : Number(v)
            if (v == null || Number.isNaN(n)) return null
            return (
              <div className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-sm shadow-sm">
                <p className="text-slate-500">日期 {row.date}</p>
                <p className="mt-1 font-medium text-slate-800">
                  {name}：{n}
                </p>
              </div>
            )
          }}
          contentStyle={TOOLTIP_BOX_STYLE}
          cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={name}
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function QualitativeProteinChart({
  data,
  displayName,
}: {
  data: QualPoint[]
  displayName: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={TREND_CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
        <XAxis
          dataKey="xKey"
          type="category"
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(xKey: string) => {
            const row = data.find((d) => d.xKey === xKey)
            return row?.date ?? xKey
          }}
        />
        <YAxis
          domain={[0, 5]}
          ticks={[0, 1, 2, 3, 4, 5]}
          tickFormatter={(v: number) =>
            URINE_PROTEIN_QUAL_LABELS[v] ?? String(v)
          }
          width={Y_AXIS_WIDTH}
          tick={Y_TICK_PROPS}
          tickMargin={6}
        />
        <ReferenceArea
          y1={0}
          y2={0.35}
          fill={REF_AREA_GREEN.fill}
          fillOpacity={REF_AREA_GREEN.fillOpacity}
          strokeOpacity={REF_AREA_GREEN.strokeOpacity}
          ifOverflow="visible"
          style={{ pointerEvents: 'none' }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as QualPoint
            return (
              <div className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-sm shadow-sm">
                <p className="text-slate-500">日期 {row.date}</p>
                <p className="mt-1 font-medium text-slate-800">
                  {displayName}：{row.label ?? '—'}
                </p>
              </div>
            )
          }}
          contentStyle={TOOLTIP_BOX_STYLE}
          cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={displayName}
          stroke="#34d399"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

const CHART_PALETTE = [
  '#38bdf8',
  '#10b981',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#2dd4bf',
  '#818cf8',
  '#fbbf24',
]

export function TrendModal({ open, onClose, records, metrics }: Props) {
  if (!open) return null

  const sorted = sortByDateAsc(records)

  const charts = metrics.map((m, i) => {
    const title = chartTitle(m, records)
    if (m.chartKind === 'urine-protein-qual') {
      const data: QualPoint[] = sorted.map((r) => {
        const q = parseUrineProteinQualitative(valueForMetric(r, m.id))
        return {
          xKey: r.id,
          date: r.date,
          value: q,
          label: q !== null ? URINE_PROTEIN_QUAL_LABELS[q] : null,
        }
      })
      const has = data.some((p) => p.value !== null)
      return {
        key: m.id,
        kind: 'qual' as const,
        title,
        hint:
          '纵轴：阴性 < ± < 1+ < 2+ < 3+ < 4+；绿色带表示常见参考（阴性）',
        unit: '序数刻度（非数值大小）',
        has,
        qualData: data,
        displayName: m.name,
      }
    }

    const data: NumericPoint[] = sorted.map((r) => ({
      xKey: r.id,
      date: r.date,
      value: parseNum(valueForMetric(r, m.id)),
    }))
    const has = data.some((p) => p.value !== null)
    return {
      key: m.id,
      kind: 'num' as const,
      title,
      hint: referenceRangeHint(m) ?? undefined,
      unit: m.unit || undefined,
      has,
      numData: data,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
      metric: m,
    }
  })

  const hasAnyChart = charts.some((c) => c.has)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trend-title"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-sky-100 bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="trend-title" className="text-lg font-medium text-slate-800">
              指标趋势
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              与「指标管理」中的顺序一致，每项单独成图；名称以当前设置为准。仅供自我观察，解读请咨询医生。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            关闭
          </button>
        </div>

        {!hasAnyChart ? (
          <p className="rounded-xl bg-sky-50/80 px-4 py-8 text-center text-slate-600">
            暂无可用数据。请在记录中填写指标数值或定性结果。
          </p>
        ) : (
          <div className="space-y-6">
            {charts.map((c) => {
              if (c.kind === 'qual') {
                return (
                  <ChartShell
                    key={c.key}
                    title={c.title}
                    unit={c.unit}
                    hint={c.hint}
                    empty={!c.has}
                  >
                    <QualitativeProteinChart
                      data={c.qualData}
                      displayName={c.displayName}
                    />
                  </ChartShell>
                )
              }
              return (
                <ChartShell
                  key={c.key}
                  title={c.title}
                  unit={c.unit}
                  hint={c.hint}
                  empty={!c.has}
                >
                  <NumericLineChart
                    data={c.numData}
                    color={c.color}
                    name={c.title}
                    metric={c.metric}
                  />
                </ChartShell>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
