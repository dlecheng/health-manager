import { useEffect, useState } from 'react'
import type { HealthRecord, MetricDefinition } from '../types'
import { buildInterpretationContext } from '../lib/interpretationContext'
import { buildOfflineInterpretationReport } from '../lib/interpretationOffline'
import {
  getEffectiveApiKey,
  requestInterpretationReport,
  setStoredOpenAiKey,
} from '../lib/interpretationLLM'

type Props = {
  open: boolean
  onClose: () => void
  metrics: MetricDefinition[]
  records: HealthRecord[]
}

function ReportBody({ source }: { source: string }) {
  const sections = source.split(/\n(?=## )/)
  return (
    <div className="space-y-5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      {sections.map((block, i) => {
        const trimmed = block.trimStart()
        const m = trimmed.match(/^## (.+?)(?:\r?\n|$)/)
        if (m) {
          const rest = trimmed.slice(m[0].length).trimEnd()
          return (
            <section key={i}>
              <h3 className="text-base font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                {m[1].trim()}
              </h3>
              <div className="mt-2 whitespace-pre-wrap">{rest}</div>
            </section>
          )
        }
        return (
          <div key={i} className="whitespace-pre-wrap">
            {block.trimEnd()}
          </div>
        )
      })}
    </div>
  )
}

export function InterpretationModal({
  open,
  onClose,
  metrics,
  records,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [usedOffline, setUsedOffline] = useState(false)

  useEffect(() => {
    if (!open) {
      setLoading(false)
      setReport(null)
      setError(null)
      setUsedOffline(false)
      return
    }

    setLoading(true)
    setError(null)
    setReport(null)
    setUsedOffline(false)

    const payload = buildInterpretationContext(metrics, records)
    const key = getEffectiveApiKey()

    if (!key) {
      setReport(buildOfflineInterpretationReport(payload))
      setUsedOffline(true)
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const text = await requestInterpretationReport(payload.summaryText, key)
        if (!cancelled) {
          setReport(text)
          setUsedOffline(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '解读请求失败')
          setReport(buildOfflineInterpretationReport(payload))
          setUsedOffline(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, metrics, records])

  if (!open) return null

  const handleRetrySmart = async () => {
    const key = apiKeyDraft.trim() || getEffectiveApiKey()
    if (!key) {
      setError('请先填写 API Key，或在本机设置 VITE_OPENAI_API_KEY（开发用）。')
      return
    }
    setStoredOpenAiKey(key)
    setLoading(true)
    setError(null)
    const payload = buildInterpretationContext(metrics, records)
    try {
      const text = await requestInterpretationReport(payload.summaryText, key)
      setReport(text)
      setUsedOffline(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '解读请求失败')
      setReport(buildOfflineInterpretationReport(payload))
      setUsedOffline(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] dark:bg-slate-950/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interpretation-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h2
              id="interpretation-modal-title"
              className="text-lg font-medium text-slate-800 dark:text-slate-100"
            >
              指标解读报告
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              基于当前已保存的全部记录；仅供参考，不能替代医生诊断。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && !report && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              正在分析已保存记录并生成报告…
            </p>
          )}

          {error && (
            <div
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/80 dark:bg-amber-950/40 dark:text-amber-100"
              role="status"
            >
              <span className="font-medium">智能解读未成功：</span>
              {error}
              <span className="mt-1 block text-amber-800/90 dark:text-amber-200/90">
                已改为下方「离线简析」；您可检查 API Key 与网络后重试。
              </span>
            </div>
          )}

          {report && (
            <article className="rounded-xl border border-sky-100/80 bg-sky-50/40 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
              {usedOffline && !loading && (
                <p className="mb-3 text-xs text-sky-800/90 dark:text-sky-200/90">
                  {getEffectiveApiKey()
                    ? '当前为离线简析（与上方报错可能相关）。'
                    : '当前为离线简析。在下方填写 OpenAI 兼容 API Key 并保存，可获得更自然的分项说明。'}
                </p>
              )}
              <ReportBody source={report} />
            </article>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-slate-700 dark:bg-slate-950/50">
          <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            OpenAI 兼容 API（可选，仅保存在本浏览器）
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-… 或您的代理 Key"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:border-sky-300 focus:ring-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600 dark:focus:border-sky-500"
            />
            <button
              type="button"
              onClick={handleRetrySmart}
              disabled={loading}
              className="shrink-0 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            >
              {loading ? '请求中…' : '保存并重试智能解读'}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            也可在开发环境通过环境变量配置{' '}
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-700 dark:text-slate-200">
              VITE_OPENAI_API_KEY
            </code>
            、
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-700 dark:text-slate-200">
              VITE_OPENAI_BASE_URL
            </code>
            、
            <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-700 dark:text-slate-200">
              VITE_OPENAI_MODEL
            </code>
            ；Key 会打进前端包内，请勿用于公开部署。
          </p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
