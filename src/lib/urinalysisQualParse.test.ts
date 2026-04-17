import { describe, expect, it } from 'vitest'
import { parseUrinalysisQualFromText } from './urinalysisQualParse'

describe('parseUrinalysisQualFromText', () => {
  it('parses negative protein and occult blood from OCR lines', () => {
    const text = `尿 隐 血 (ERY) 2+， 阴性 (-)
尿 重 自 (PRO) 。。 阴性 (-) 阴性 (-)
尿 葡萄 糖 (UGLU) 。 阴性 (-) 阴性 (-)`

    expect(parseUrinalysisQualFromText(text)).toEqual({
      urineOccultBlood: '2+',
      urineProtein: '阴性(-)',
      urineGlucose: '阴性(-)',
    })
  })

  it('parses weak positive protein when ± is OCR damaged', () => {
    const text = `尿 隐 血 (ERY) 2 阴性 (-)
尿 蛋 白 (PRO) 。 弱 阳 性 ( 雪 。。 阳性 ()
尿 葡萄 糖 (UGLU) 。 阴性-) 阴性 (-)`

    expect(parseUrinalysisQualFromText(text)).toEqual({
      urineOccultBlood: '2+',
      urineProtein: '弱阳性(±)',
      urineGlucose: '阴性(-)',
    })
  })
})
