/**
 * 尿微量白蛋白/肌酐类报告：提取 mg/g（常见为「尿 ACR」）与 mg/mmol 两种比值。
 * 兼容 OCR：↑、空格、Alb-U/Cr-U、(mg/g) 等。
 */

function compact(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/　/g, ' ')
    .replace(/[↑↓※*＊]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type UrineAcrKey = 'acrMgG' | 'acrMgMmol'

export type UrineAcrValues = Partial<Record<UrineAcrKey, string>>

const MG_G_PER_MG_MMOL = 8.84

function formatMgMmolRecovered(value: number): string {
  const truncated = Math.trunc(value * 1000) / 1000
  return truncated.toFixed(3).replace(/\.?0+$/, '')
}

function normalizeMgGPrecision(raw: string): string {
  const t = raw.trim()
  const m = t.match(/^(\d+)\.(\d+)$/)
  if (!m) return t
  if (m[2].length <= 3) return t
  const truncated = Math.trunc(parseFloat(t) * 1000) / 1000
  return truncated.toFixed(3).replace(/\.?0+$/, '')
}

function normalizeMgMmolPrecision(raw: string): string {
  const t = raw.trim()
  const m = t.match(/^(\d+)\.(\d+)$/)
  if (!m) return t
  if (m[2].length <= 3) return t
  const truncated = Math.trunc(parseFloat(t) * 1000) / 1000
  return truncated.toFixed(3).replace(/\.?0+$/, '')
}

/**
 * OCR 常漏掉小数点，把 5.6517 读成 56517。
 * 若同张报告里已识别到 mg/g，则优先利用换算关系 \( mg/g \approx mg/mmol \times 8.84 \)
 * 选择最匹配的小数位；否则再退回数值范围启发式。
 */
function healMgMmolMissingDecimal(raw: string, acrMgG?: string): string {
  const t = raw.trim()
  if (t.includes('.') || !/^\d+$/.test(t)) return raw
  const x = parseInt(t, 10)
  if (!Number.isFinite(x) || x < 100) return raw

  const ys: number[] = []
  for (let exp = 2; exp <= 5; exp++) {
    const y = x / 10 ** exp
    if (y >= 0.15 && y <= 120) ys.push(y)
  }
  if (ys.length === 0) return raw

  const mgG = acrMgG ? parseFloat(acrMgG) : NaN
  if (Number.isFinite(mgG) && mgG > 0) {
    let best = ys[0]
    let bestScore = Math.abs(best * MG_G_PER_MG_MMOL - mgG)
    for (let i = 1; i < ys.length; i++) {
      const score = Math.abs(ys[i] * MG_G_PER_MG_MMOL - mgG)
      if (score < bestScore) {
        best = ys[i]
        bestScore = score
      }
    }
    return formatMgMmolRecovered(best)
  }

  const sweet = ys.filter((y) => y >= 0.3 && y <= 50)
  const pick = sweet.length > 0 ? sweet[0] : ys[0]
  return formatMgMmolRecovered(pick)
}

/** 全文最后一个「mg/mmol」位置（避免匹配到表头/单号附近的误识别） */
function lastMgPerMmolIndex(c: string): number {
  const re = /mg\s*\/\s*mmol/gi
  let idx = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(c)) !== null) idx = m.index
  return idx
}

/**
 * 在紧邻「mg/mmol」之前的片段内提取比值结果（mg/mmol 行）。
 * 优先：结果 + 参考范围；其次 ACR)；再退化为从尾部选取带小数的结果，避免误取报告单号里的 531 等。
 */
function extractMgMmolResultBeforeUnit(c: string, mmIdx: number): string | undefined {
  const tail = c.slice(Math.max(0, mmIdx - 240), mmIdx)
  const span = c.slice(Math.max(0, mmIdx - 240), Math.min(c.length, mmIdx + 24))

  const up = tail.match(/(\d+(?:\.\d+)?)\s*↑/)
  if (up?.[1]) return up[1]

  // 优先取紧邻 mg/mmol 的结果 + 参考范围，避免误吃到前面的 Alb-U 103.2
  const mmSpecific = [
    ...span.matchAll(
      /(\d+(?:\.\d+)?)\s*[。."”]?\s*0\.0\s*[-–~～]\s*3\.394[^0-9]{0,12}mg\s*\/\s*mmol/gi,
    ),
  ]
  if (mmSpecific.length > 0) {
    return mmSpecific[mmSpecific.length - 1][1]
  }

  // 值 ACR) 8.7411 / RiMEBEE… ACR) 8.7411
  const acrParen = [...tail.matchAll(/ACR\s*[\)）]\s*(\d+(?:\.\d+)?)/gi)]
  if (acrParen.length > 0) {
    return acrParen[acrParen.length - 1][1]
  }

  // 8.7411 0.0-3.394（更宽松兜底）
  const refRows = [...tail.matchAll(/(\d+(?:\.\d+)?)\s+([\d.]+\s*[-–~～]\s*[\d.]+)/g)]
  if (refRows.length > 0) {
    return refRows[refRows.length - 1][1]
  }

  const nums = [...tail.matchAll(/(\d+(?:\.\d+)?)/g)].map((x) => x[1])
  const isRefBoundary = (n: string) => {
    const x = parseFloat(n)
    if (n === '3.394' || n === '0.0' || n === '0') return true
    if (Math.abs(x - 3.394) < 1e-6 || Math.abs(x) < 1e-9) return true
    return false
  }
  // 从右向左：优先带小数点的检验结果；跳过常见参考上下限，避免误取 3.394
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i]
    const x = parseFloat(n)
    if (isRefBoundary(n)) continue
    if (n.includes('.') && x >= 0.01 && x < 500) return n
  }
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i]
    const x = parseFloat(n)
    if (isRefBoundary(n)) continue
    if (n.length >= 6 && x >= 1e5) continue
    if (x >= 0.01 && x <= 500) return n
  }
  return undefined
}

/** 取片段内「结果」常见写法：带 ↑ 的数，否则取最后一个合理小数 */
function pickResultNumber(segment: string): string | undefined {
  const arrow = segment.match(/(\d+(?:\.\d+)?)\s*↑/)
  if (arrow?.[1]) return arrow[1]
  const nums = [...segment.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => m[1])
  if (nums.length === 0) return undefined
  for (let i = nums.length - 1; i >= 0; i--) {
    const x = parseFloat(nums[i])
    if (x >= 0.01 && x < 1e6) return nums[i]
  }
  return nums[nums.length - 1]
}

/**
 * 尿 ACR / 白蛋白肌酐比值（与肾功血生化解析独立，可同图并存）
 */
export function parseUrineAcrFromText(text: string): UrineAcrValues {
  const c = compact(text)
  const out: UrineAcrValues = {}

  // —— mg/g：内置「尿 ACR」常用单位；优先匹配 (mg/g)、Alb-U/Cr-U
  const mgGPats: RegExp[] = [
    /(?:\(mg\/g\)|\(mg\s*\/\s*g\))[^0-9]{0,35}(\d+(?:\.\d+)?)/i,
    /Alb-U\s*\/\s*Cr-U[^0-9]{0,30}(\d+(?:\.\d+)?)/i,
  ]
  for (const p of mgGPats) {
    const m = c.match(p)
    if (m?.[1]) {
      out.acrMgG = m[1]
      break
    }
  }
  if (!out.acrMgG) {
    const gIdx = c.search(/mg\s*\/\s*g(?!\s*\/\s*mm)/i)
    if (gIdx > 0) {
      const seg = c.slice(Math.max(0, gIdx - 100), gIdx)
      const v = pickResultNumber(seg)
      if (v) out.acrMgG = v
    }
  }

  // —— mg/mmol：锚定「最后一个」单位出现处，避免窗口扫到报告单号再误取 531 等
  const mmIdx = lastMgPerMmolIndex(c)
  if (mmIdx > 0) {
    const v = extractMgMmolResultBeforeUnit(c, mmIdx)
    if (v) out.acrMgMmol = healMgMmolMissingDecimal(v, out.acrMgG)
  }

  if (!out.acrMgMmol) {
    const pats = [
      /白蛋白\/肌酐比值[^)]*ACR[^0-9]{0,15}(\d+(?:\.\d+)?)/i,
      /肌酐比值\s*[\(（]\s*ACR\s*[\)）][^0-9]{0,15}(\d+(?:\.\d+)?)/i,
    ]
    for (const p of pats) {
      const m = c.match(p)
      if (m?.[1]) {
        out.acrMgMmol = healMgMmolMissingDecimal(m[1], out.acrMgG)
        break
      }
    }
  }

  if (out.acrMgG) {
    out.acrMgG = normalizeMgGPrecision(out.acrMgG)
  }
  if (out.acrMgMmol) {
    out.acrMgMmol = normalizeMgMmolPrecision(out.acrMgMmol)
  }

  return out
}
