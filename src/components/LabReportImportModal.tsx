import { useEffect, useMemo, useState } from 'react'
import type { MetricDefinition } from '../types'
import {
  RENAL_LABELS,
  suggestMetricIdForRenalKey,
} from '../lib/renalMetricMatch'
import {
  parseRenalPanelFromText,
  type RenalPanelKey,
  type RenalPanelValues,
} from '../lib/renalPanelParse'
import {
  suggestMetricIdForUrineAcrKey,
  URINE_ACR_LABELS,
} from '../lib/urineAcrMetricMatch'
import {
  parseUrineAcrFromText,
  type UrineAcrKey,
  type UrineAcrValues,
} from '../lib/urineAcrPanelParse'
import {
  suggestMetricIdForUrinalysisKey,
  URINALYSIS_QUAL_LABELS,
} from '../lib/urinalysisQualMetricMatch'
import {
  parseUrinalysisQualFromText,
  type UrinalysisQualKey,
  type UrinalysisQualValues,
} from '../lib/urinalysisQualParse'

type Props = {
  open: boolean
  /** 至少一张图片；顺序识别，解析结果按张合并（同一指标多处出现时以后面的图为准） */
  files: File[]
  metrics: MetricDefinition[]
  onClose: () => void
  /** 将勾选项合并进表单（按 metricId 写入字符串） */
  onApply: (updates: Record<string, string>) => void
}

type ImportRowKey = RenalPanelKey | UrineAcrKey | UrinalysisQualKey

type ReviewRow = {
  key: ImportRowKey
  hintLabel: string
  rawValue: string
  metricId: string
  use: boolean
}

const RENAL_ORDER: RenalPanelKey[] = ['urea', 'creatinine', 'uricAcid', 'egfr']
const URINE_ORDER: UrineAcrKey[] = ['acrMgG', 'acrMgMmol']
const URINALYSIS_ORDER: UrinalysisQualKey[] = [
  'urineProtein',
  'urineGlucose',
  'urineOccultBlood',
]

function buildMergedRows(
  renal: RenalPanelValues,
  urine: UrineAcrValues,
  urinalysis: UrinalysisQualValues,
  metrics: MetricDefinition[],
): ReviewRow[] {
  const rows: ReviewRow[] = []
  for (const key of RENAL_ORDER) {
    const raw = renal[key]
    if (raw === undefined) continue
    const suggested = suggestMetricIdForRenalKey(key, metrics)
    rows.push({
      key,
      hintLabel: RENAL_LABELS[key],
      rawValue: raw,
      metricId: suggested ?? '',
      use: Boolean(suggested),
    })
  }
  for (const key of URINE_ORDER) {
    const raw = urine[key]
    if (raw === undefined) continue
    const suggested = suggestMetricIdForUrineAcrKey(key, metrics)
    rows.push({
      key,
      hintLabel: URINE_ACR_LABELS[key],
      rawValue: raw,
      metricId: suggested ?? '',
      use: Boolean(suggested),
    })
  }
  for (const key of URINALYSIS_ORDER) {
    const raw = urinalysis[key]
    if (raw === undefined) continue
    const suggested = suggestMetricIdForUrinalysisKey(key, metrics)
    rows.push({
      key,
      hintLabel: URINALYSIS_QUAL_LABELS[key],
      rawValue: raw,
      metricId: suggested ?? '',
      use: Boolean(suggested),
    })
  }
  return rows
}

function mergeRenal(parts: RenalPanelValues[]): RenalPanelValues {
  return Object.assign({}, ...parts)
}

function mergeUrine(parts: UrineAcrValues[]): UrineAcrValues {
  return Object.assign({}, ...parts)
}

function mergeUrinalysis(parts: UrinalysisQualValues[]): UrinalysisQualValues {
  return Object.assign({}, ...parts)
}

export function LabReportImportModal({
  open,
  files,
  metrics,
  onClose,
  onApply,
}: Props) {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'review' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [applyHint, setApplyHint] = useState<string | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [ocrRawText, setOcrRawText] = useState<string>('')
  const [scanProgress, setScanProgress] = useState<string>('')

  useEffect(() => {
    if (!open || files.length === 0) {
      setPhase('idle')
      setRows([])
      setErrorMsg(null)
      setApplyHint(null)
      setOcrRawText('')
      setScanProgress('')
      return
    }

    let cancelled = false

    const run = async () => {
      setPhase('scanning')
      setErrorMsg(null)
      setApplyHint(null)
      setRows([])
      setOcrRawText('')
      setScanProgress(`共 ${files.length} 张，准备识别…`)

      try {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker('chi_sim+eng')
        const texts: string[] = []

        try {
          for (let i = 0; i < files.length; i++) {
            if (cancelled) return
            const label = files[i].name?.trim() || `图片 ${i + 1}`
            setScanProgress(`正在识别第 ${i + 1}/${files.length} 张（${label}）…`)
            const {
              data: { text },
            } = await worker.recognize(files[i])
            texts.push(text)
          }
        } finally {
          await worker.terminate()
        }

        if (cancelled) return

        const combinedRaw = texts
          .map((t, i) => {
            const label = files[i].name?.trim() || `图片 ${i + 1}`
            return `──── 第 ${i + 1} 张（${label}） ────\n${t}`
          })
          .join('\n\n')

        setOcrRawText(combinedRaw)
        setScanProgress('')

        const renal = mergeRenal(texts.map((t) => parseRenalPanelFromText(t)))
        const urine = mergeUrine(texts.map((t) => parseUrineAcrFromText(t)))
        const urinalysis = mergeUrinalysis(
          texts.map((t) => parseUrinalysisQualFromText(t)),
        )
        const next = buildMergedRows(renal, urine, urinalysis, metrics)
        if (next.length === 0) {
          setErrorMsg(
            '未从所选图片中识别到肾功、尿 ACR 或尿常规定性（尿素、肌酐、尿酸、eGFR、尿白蛋白/肌酐比值、尿蛋白定性等）。请换更清晰截图，或确认报告中含上述项目。',
          )
          setPhase('error')
          return
        }
        setRows(next)
        setPhase('review')
      } catch (e) {
        if (cancelled) return
        setScanProgress('')
        setErrorMsg(
          e instanceof Error ? e.message : '识别失败，请重试或换一张图片。',
        )
        setPhase('error')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [open, files, metrics])

  const metricOptions = useMemo(
    () => metrics.map((m) => ({ id: m.id, label: m.unit ? `${m.name}（${m.unit}）` : m.name })),
    [metrics],
  )

  const handleApply = () => {
    const updates: Record<string, string> = {}
    for (const r of rows) {
      if (!r.use || !r.metricId) continue
      const v = r.rawValue.trim()
      if (!v) continue
      updates[r.metricId] = v
    }
    if (Object.keys(updates).length === 0) {
      setApplyHint('请至少勾选一项、选择填入指标并填写数值。')
      return
    }
    setApplyHint(null)
    onApply(updates)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[1px] dark:bg-slate-950/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lab-import-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sky-100 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id="lab-import-title"
          className="text-lg font-medium text-slate-800 dark:text-slate-100"
        >
          检验报告识别
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          可同时选择<strong>多张</strong>报告图，将依次识别并<strong>合并</strong>结果（血肌酐、尿 ACR、尿蛋白定性等可分散在不同单子上）；同一指标在多张图中都有值时，以<strong>后面的图</strong>为准。支持<strong>肾功常见项</strong>（尿素、血肌酐、尿酸、eGFR
          等）、<strong>尿 ACR</strong>（mg/g 与 mg/mmol）、<strong>尿常规定性</strong>（尿蛋白
          PRO、尿糖、尿隐血等）。首次使用会下载离线识别模型，可能需要数十秒。
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          若你刚更新过本页面程序，请使用<strong>强制刷新</strong>（Windows/Linux：
          Ctrl+Shift+R；Mac：Cmd+Shift+R）以免浏览器仍使用旧版脚本。识别逻辑在本地运行，与
          Tesseract 语言包缓存无关。
        </p>
        {metrics.length === 0 && (
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200/90">
            请先在「指标管理」中添加至少一项指标，否则无法填入表单。
          </p>
        )}

        {phase === 'scanning' && (
          <p className="mt-6 rounded-xl bg-sky-50 px-4 py-8 text-center text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            {scanProgress || '正在识别文字，请稍候…'}
          </p>
        )}

        {phase === 'error' && errorMsg && (
          <div className="mt-6 space-y-3">
            <p className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
              {errorMsg}
            </p>
            {ocrRawText ? (
              <details className="text-left">
                <summary className="cursor-pointer text-xs font-medium text-sky-800 dark:text-sky-300">
                  查看识别到的原始文字
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {ocrRawText}
                </pre>
              </details>
            ) : null}
          </div>
        )}

        {phase === 'review' && rows.length > 0 && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              请核对下方数值与对应指标，勾选后将填入当前新建记录表单（不会自动保存）。
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/60">
                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
                      采用
                    </th>
                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
                      识别项
                    </th>
                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
                      数值
                    </th>
                    <th className="min-w-[140px] px-3 py-2 font-medium text-slate-600 dark:text-slate-300">
                      填入指标
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.key}
                      className="border-b border-slate-50 last:border-0 dark:border-slate-700/80"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.use}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.key === r.key
                                  ? { ...x, use: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                          className="rounded border-slate-300 dark:border-slate-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {r.hintLabel}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="w-full min-w-[72px] rounded-lg border border-slate-200 px-2 py-1.5 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={r.rawValue}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.key === r.key
                                  ? { ...x, rawValue: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={r.metricId}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.key === r.key
                                  ? { ...x, metricId: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="">— 不填入 —</option>
                          {metricOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {applyHint && (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-200/90">{applyHint}</p>
            )}
            {ocrRawText ? (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs font-medium text-sky-800 dark:text-sky-300">
                  查看识别到的原始文字（核对 OCR 是否读对）
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {ocrRawText}
                </pre>
              </details>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            取消
          </button>
          {phase === 'review' && (
            <button
              type="button"
              disabled={metrics.length === 0}
              onClick={handleApply}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-slate-900/40"
            >
              填入表单
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
