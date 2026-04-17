/**
 * 尿液干化学分析等：定性/半定量结果（尿蛋白 PRO、尿糖、尿隐血等）。
 * 兼容 OCR 空格、中英文括号；保留 ASCII * 以便识别 2+* 等。
 */

function compactQual(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/　/g, ' ')
    .replace(/[↑↓※＊]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type UrinalysisQualKey =
  | 'urineProtein'
  | 'urineGlucose'
  | 'urineOccultBlood'

export type UrinalysisQualValues = Partial<Record<UrinalysisQualKey, string>>

type RowDef = { key: UrinalysisQualKey; label: RegExp }

const ROWS: RowDef[] = [
  {
    key: 'urineProtein',
    // 排除「尿蛋白 / 肌酐」等比值项；OCR 也可能把“蛋白”读坏，但 PRO 往往仍在
    label:
      /(?:尿\s*蛋\s*白(?!\s*\/)(?:\s*[\(（]?\s*P\s*R\s*O\s*[\)）]?)?|[\(（]\s*P\s*R\s*O\s*[\)）])/i,
  },
  {
    key: 'urineGlucose',
    label:
      /(?:尿\s*葡\s*萄\s*糖|尿\s*糖)(?:\s*[\(（]?\s*(?:U\s*G\s*L\s*U|G\s*L\s*U)\s*[\)）]?)?/i,
  },
  {
    key: 'urineOccultBlood',
    label:
      /(?:尿\s*隐\s*血(?:\s*[\(（]?\s*E\s*R\s*Y\s*[\)）]?)?|[\(（]\s*E\s*R\s*Y\s*[\)）])/i,
  },
]

const LEAD = '[\\s:：|．.，,。·]{0,12}'

function normalizeDisplay(s: string): string {
  const t = s.trim().replace(/＋/g, '+')
  const dense = t.replace(/\s+/g, '')
  if (/^阴性(?:[\(（]-[\)）]|-\)|\(-\)|-)?$/i.test(dense)) return '阴性(-)'
  if (/^弱阳性/.test(dense)) return '弱阳性(±)'
  if (/^阳性(?:[\(（]\+[\)）]|\+)?$/i.test(dense)) return '阳性(+)'
  if (/^\d\+?\*?$/.test(dense) && /^\d/.test(dense)) {
    const digit = dense[0]
    const star = dense.includes('*') ? '*' : ''
    return `${digit}+${star}`
  }
  const m = t.match(/^(\d)\s*([＋+]+)\s*(\*)?$/)
  if (m) return `${m[1]}${m[2].replace(/＋/g, '+')}${m[3] ?? ''}`
  return dense
}

/** OCR 把「弱阳性(±)」读成 BEAM (+) 等：统一为可读定性描述 */
function mapGarbageProteinToQual(captured: string): string {
  const t = captured.trim()
  if (/^[A-Za-z]{2,15}\s*[\(（]\s*\+\s*[\)）]/.test(t)) return '弱阳性(±)'
  if (/^[\(（]\s*\+\s*[\)）]$/.test(t.replace(/\s+/g, ''))) return '阳性(+)'
  if (/弱\s*阳\s*性/.test(t)) return '弱阳性(±)'
  if (/^\d$/.test(t)) return `${t}+`
  return normalizeDisplay(captured)
}

function extractTokenForKey(key: UrinalysisQualKey, fragment: string): string | undefined {
  const s = fragment
    .trim()
    .replace(/^[\(（]\s*[A-Za-z]{2,6}\s*[\)）]\s*/, '')
    .replace(/^[:：|丨;；．.。，,·\s]+/, '')
  if (!s) return undefined

  if (key === 'urineOccultBlood') {
    const m = s.match(/^(\d)\s*([+＋]?)(\*)?/)
    if (m?.[1]) return normalizeDisplay(`${m[1]}${m[2] || '+'}${m[3] ?? ''}`)
  }

  if (key === 'urineProtein') {
    if (/弱\s*阳\s*性/.test(s)) return '弱阳性(±)'
    if (/阴性/.test(s)) return '阴性(-)'
  }

  return extractQualToken(s)
}

/**
 * 从「指标名」后紧跟的片段中取出检验结果（定性）。
 */
function extractQualToken(fragment: string): string | undefined {
  const s = fragment.trim().replace(/^[:：|丨;；．.。，,·\s]+/, '')
  if (!s.length) return undefined

  const patterns: RegExp[] = [
    new RegExp(`^${LEAD}(阴性\\s*[\\(（]\\s*-\\s*[\\)）])`, 'i'),
    new RegExp(`^${LEAD}(弱\\s*阳\\s*性(?:\\s*[\\(（][^\\)）]{0,4}[\\)）])?)`),
    new RegExp(`^${LEAD}(阳性\\s*[\\(（]\\s*\\+\\s*[\\)）])`),
    new RegExp(`^${LEAD}(阳性)`),
    // OCR：BEAM (+)、XXX (+) 等
    new RegExp(`^${LEAD}([A-Za-z]{2,15}\\s*[\\(（]\\s*\\+\\s*[\\)）])`),
    new RegExp(`^${LEAD}([\\(（]\\s*\\+\\s*[\\)）])`),
    new RegExp(`^${LEAD}(\\d\\s*[＋+]+\\s*\\*)`),
    new RegExp(`^${LEAD}(\\d\\s*[＋+]+)`),
    new RegExp(`^${LEAD}(\\d)`),
    new RegExp(`^${LEAD}([＋+]+\\s*\\*)`),
    new RegExp(`^${LEAD}(±|\\+-)`),
    new RegExp(`^${LEAD}(阴性)`),
  ]

  for (const p of patterns) {
    const m = s.match(p)
    if (m?.[1]) return mapGarbageProteinToQual(m[1])
  }
  return undefined
}

export function parseUrinalysisQualFromText(text: string): UrinalysisQualValues {
  const out: UrinalysisQualValues = {}
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/　/g, ' ')
    .split('\n')
    .map((line) => compactQual(line))
    .filter(Boolean)

  for (const row of ROWS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const m = row.label.exec(line)
      if (!m) continue
      const start = m.index + m[0].length
      const sameLine = line.slice(start)
      const nextLine = lines[i + 1] ?? ''
      const raw =
        extractTokenForKey(row.key, sameLine) ??
        extractTokenForKey(row.key, `${sameLine} ${nextLine}`)
      if (raw) {
        out[row.key] = raw
        break
      }
    }
  }

  const c = compactQual(text)
  for (const row of ROWS) {
    if (out[row.key] !== undefined) continue
    const m = row.label.exec(c)
    if (!m) continue
    const after = c.slice(m.index + m[0].length, m.index + m[0].length + 140)
    const raw = extractTokenForKey(row.key, after)
    if (raw) out[row.key] = raw
  }

  return out
}
