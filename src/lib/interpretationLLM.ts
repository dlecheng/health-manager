const STORAGE_KEY = 'health-manager-openai-key'

const SYSTEM_PROMPT = `你是面向中文用户的「化验记录整理与就诊准备」辅助说明员，不是执业医师。

硬性规则：
1. 只根据用户消息中给出的「数据摘要」作答；不得编造未出现的数值、日期或检查项目。
2. 不得作出疾病诊断、不得推荐具体药物或剂量；若信息不足，明确说「摘要中未包含…无法判断」。
3. 对异常或偏高/偏低，用通俗中文解释「可能常见于哪些情况」，并强调「需医生结合临床判断」。
4. 输出使用 Markdown，使用以下二级标题（勿省略）：
## 整体概况
## 近期情况（以最近一条记录日期为主）
## 分指标要点
## 生活与复诊建议
## 重要声明
5. 「重要声明」中必须说明：本内容仅供参考，不能替代医生；化验解释以化验单与面诊为准。

语气：亲切、克制、条理清晰；避免恐吓性措辞。`

const USER_PREFIX = `以下为「我的健康管家」应用根据用户已保存记录自动生成的数据摘要（含内置参考范围提示，可能与化验单不一致）。请仅依据该摘要撰写解读与建议：

`

export function getStoredOpenAiKey(): string | null {
  try {
    const k = localStorage.getItem(STORAGE_KEY)
    return k?.trim() || null
  } catch {
    return null
  }
}

export function setStoredOpenAiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim())
}

export function clearStoredOpenAiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** 优先环境变量（便于本地开发），否则为用户在浏览器中保存的 Key */
export function getEffectiveApiKey(): string | null {
  const env = import.meta.env.VITE_OPENAI_API_KEY
  if (typeof env === 'string' && env.trim()) return env.trim()
  return getStoredOpenAiKey()
}

function baseUrl(): string {
  const u = import.meta.env.VITE_OPENAI_BASE_URL
  if (typeof u === 'string' && u.trim()) return u.replace(/\/$/, '')
  return 'https://api.openai.com/v1'
}

function modelName(): string {
  const m = import.meta.env.VITE_OPENAI_MODEL
  if (typeof m === 'string' && m.trim()) return m.trim()
  return 'gpt-4o-mini'
}

export async function requestInterpretationReport(
  summaryText: string,
  apiKey: string,
): Promise<string> {
  const url = `${baseUrl()}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName(),
      temperature: 0.35,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: USER_PREFIX + summaryText },
      ],
    }),
  })

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: { message?: string } }
      detail = j.error?.message ?? ''
    } catch {
      try {
        detail = (await res.text()).slice(0, 500)
      } catch {
        detail = ''
      }
    }
    throw new Error(
      detail || `请求失败（HTTP ${res.status}）。请检查网络、Base URL 与 API Key。`,
    )
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('模型未返回正文，请稍后重试。')
  return text
}
