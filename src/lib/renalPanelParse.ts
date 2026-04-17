/**
 * 从 OCR 全文中提取肾功常见项：尿素、血肌酐、尿酸、eGFR。
 * 注意：「估算肾小球肌酐滤过率」等行也含「肌酐」，必须与血清肌酐行区分。
 *
 * 策略：先按行解析；再在「整段文字压成一行」上做正则补全，缓解 OCR 换行、空格导致的漏检。
 */

/** 明显非肾功血生化表的行（尿常规等） */
const SKIP_LINE =
  /尿微量|尿蛋白\/|ACR\)|Alb-U|Cr-U|尿干化学|尿酮|粒细胞|尿隐血|亚硝酸盐|尿葡萄糖|尿胆|尿胆原|比重|酸碱度|透明度|颜色\(/

/** eGFR / 肾小球滤过率类指标行（勿当作血肌酐）；兼容 OCR：GFR_CR、率 (GFR_CR) */
function isEgfrIndicatorLine(line: string): boolean {
  if (
    /估算肾小球/.test(line) ||
    /GFR[-_]?CR/i.test(line) ||
    /eGFR/i.test(line) ||
    /估算.*滤过/.test(line) ||
    (/肾小球/.test(line) && /滤过/.test(line) && /肌酐|肌栈/.test(line))
  ) {
    return true
  }
  // 表格外单独一行：乱码如 SHBEROR + 数值 + mL/min
  if (/m[lL]\s*\/\s*min/.test(line)) {
    const mm = line.match(/(\d+(?:\.\d+)?)\s*m[lL]\s*\/\s*min/i)
    const v = mm ? parseFloat(mm[1]) : NaN
    if (Number.isFinite(v) && v >= 3 && v <= 200) return true
  }
  return false
}

/** 血清肌酐；兼容 OCR 将「酐」识成「栈」、「Cr」识成「Cn」 */
function isSerumCreatinineLine(line: string): boolean {
  if (/尿肌酐|尿微量/i.test(line)) return false
  if (isEgfrIndicatorLine(line)) return false
  if (/血肌酐/.test(line)) return true
  if (/肌\s*栈|肌酐/.test(line) && /[\(（]\s*C[nr]/i.test(line)) return true
  if (/肌酐\s*[\(（]\s*[Cc][nr]/i.test(line)) return true
  if (/肌酐/i.test(line) && !/^尿/.test(line.trim())) return true
  return false
}

function firstNumberAfterLastParen(line: string): string | undefined {
  const last = line.lastIndexOf(')')
  const tail = last >= 0 ? line.slice(last + 1) : line
  const m = tail.match(/(\d+(?:\.\d+)?)/)
  return m?.[1]
}

function firstNumberFrom(line: string, fromIndex: number): string | undefined {
  const tail = line.slice(fromIndex)
  const m = tail.match(/(\d+(?:\.\d+)?)/)
  return m?.[1]
}

export type RenalPanelKey = 'urea' | 'creatinine' | 'uricAcid' | 'egfr'

export type RenalPanelValues = Partial<Record<RenalPanelKey, string>>

/** 将 OCR 文本压成单行，便于跨行匹配「肌酐 (换行) (Cr)」等情况 */
function compactOcrText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/　/g, ' ')
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 在整段文字上补全：当按行未识别到时，用更宽松的正则再抓一次。
 */
function supplementFromCompact(
  compact: string,
  out: RenalPanelValues,
): RenalPanelValues {
  const next: RenalPanelValues = { ...out }

  if (!next.creatinine) {
    const patterns: RegExp[] = [
      // OCR: 肌 栈 (Cn 96 — 栈=酐，Cn=Cr
      /肌\s*栈\s*[\(（]\s*C[nr]\s*[\)）]?\s*(\d+(?:\.\d+)?)/i,
      /肌酐\s*[\(（]\s*[CcＣ][nrｒ]\s*[\)）][^0-9]{0,25}(\d+(?:\.\d+)?)/i,
      /血肌酐[^0-9]{0,15}(\d+(?:\.\d+)?)/,
    ]
    for (const p of patterns) {
      const m = compact.match(p)
      if (m?.[1]) {
        next.creatinine = m[1]
        break
      }
    }
  }

  if (!next.egfr) {
    const patterns: RegExp[] = [
      // OCR: 率 (GFR_CR) 93.05 — 下划线、前序乱码
      /GFR_CR\s*[\)）]\s*(\d+(?:\.\d+)?)/i,
      /[\(（]\s*GFR_CR\s*[\)）]\s*(\d+(?:\.\d+)?)/i,
      /GFR[-－]?\s*CR\s*[\)）][^0-9]{0,25}(\d+(?:\.\d+)?)/i,
      /估算肾小球肌酐滤过率[^0-9]{0,35}(\d+(?:\.\d+)?)/,
      /eGFR[^0-9]{0,20}(\d+(?:\.\d+)?)/i,
      // 单独一行：… 95.15 mL/min（标签被 OCR 成 SHBEROR 等）
      /(\d+(?:\.\d+)?)\s*m[lL]\s*\/\s*min\b/i,
    ]
    for (const p of patterns) {
      const m = compact.match(p)
      if (m?.[1] && !/^0{5,}/.test(m[1])) {
        const v = parseFloat(m[1])
        if (Number.isFinite(v) && v >= 3 && v <= 200) {
          next.egfr = m[1]
          break
        }
      }
    }
  }

  if (!next.urea) {
    // OCR: (Ureal) 等拼写
    const m = compact.match(
      /尿素\s*[\(（]?\s*Ure[a-z]*\s*[\)）]?[^0-9]{0,20}(\d+(?:\.\d+)?)/i,
    )
    if (m?.[1]) next.urea = m[1]
  }

  if (!next.uricAcid) {
    const m = compact.match(
      /尿酸\s*[\(（]?\s*UA\s*[\)）]?[^0-9]{0,20}(\d+(?:\.\d+)?)/i,
    )
    if (m?.[1]) next.uricAcid = m[1]
  }

  return next
}

function parseLineByLine(text: string): RenalPanelValues {
  const t = text.replace(/\r\n/g, '\n').replace(/　/g, ' ')
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)

  const out: RenalPanelValues = {}

  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue

    if (isEgfrIndicatorLine(line) && out.egfr === undefined) {
      const ml = line.match(/(\d+(?:\.\d+)?)\s*m[lL]\s*\/\s*min/i)
      const v =
        ml?.[1] ??
        firstNumberAfterLastParen(line) ??
        firstNumberFrom(line, line.search(/\d/))
      if (v && !/^0{6,}/.test(v)) {
        const n = parseFloat(v)
        if (Number.isFinite(n) && n >= 3 && n <= 200) out.egfr = v
      }
      continue
    }

    if (/尿素|Ure/i.test(line) && !/尿肌酐/.test(line) && out.urea === undefined) {
      const at = line.search(/尿素|Ure/i)
      if (at >= 0) {
        const v =
          firstNumberAfterLastParen(line) ?? firstNumberFrom(line, at)
        if (v) out.urea = v
      }
    }

    if (isSerumCreatinineLine(line) && out.creatinine === undefined) {
      const at = line.search(/血肌酐|肌\s*栈|肌酐/i)
      if (at >= 0) {
        const v =
          firstNumberAfterLastParen(line) ?? firstNumberFrom(line, at)
        if (v) out.creatinine = v
      }
    }

    if (/尿酸|UA/i.test(line) && !/尿微量/i.test(line) && out.uricAcid === undefined) {
      const at = line.search(/尿酸|UA/i)
      if (at >= 0) {
        const v =
          firstNumberAfterLastParen(line) ?? firstNumberFrom(line, at)
        if (v) out.uricAcid = v
      }
    }
  }

  return out
}

/**
 * @param text OCR 原始文本（建议 chi_sim+eng）
 */
export function parseRenalPanelFromText(text: string): RenalPanelValues {
  const lineOut = parseLineByLine(text)
  const compact = compactOcrText(text)
  return supplementFromCompact(compact, lineOut)
}
