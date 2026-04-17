import { describe, expect, it } from 'vitest'
import { parseUrineAcrFromText } from './urineAcrPanelParse'

describe('parseUrineAcrFromText', () => {
  it('keeps mg/mmol decimal when OCR drops the point', () => {
    const text = `──── 第 1 张（8b24bd9f3f9ad5b5b9046b294145d8c3.jpg） ────
11:02 11 5G ED
《 检验 报告 详情 OO
( 装 半 管 尿 即 可 ) 尿 微量 白 蛋 白 肌 酬 三 项 (ACR)
(随机 尿 )
报告 单 号 : 00000618990153;3658550229;
( 装 半 管 尿 即 可 ) RHMESEBAE =I (ACR) (随机
FR)
检测 指标 结果 参考 值 单位
尿 微 量 白 蛋 白 (Alb-U) 10207 ”0.0-25.0 mg/L
3540.0-
FRANEF(Cr-U) 21648.0 。 246000 mmol/L
REE EE/NEFLE
ACR) 471217  0.0-3.394 mg/mmol
REE EE/NETLE
值 (mg/g) (Ab- 41.6527  0-30.000 mg/g
U/Cr-U (ACR) )
| 报告 信息
申请 日 期
申请 医生
报告 日 期 2025-09-20 10:43:22
报告 医生 陈 科 详`

    expect(parseUrineAcrFromText(text)).toEqual({
      acrMgG: '41.652',
      acrMgMmol: '4.712',
    })
  })

  it('truncates OCR tail noise for mg/g and mg/mmol', () => {
    const text = `12.11 :4 46 ED
果 检验 报告 详情 @
尿 微量 白 蛋白 肌 酥 二 项
报告 单 号 : 00000633499980;3559813531;
检测 指标 结果 参考 值 单位
尿 微量 白 蛋白 (Alb-U) 78.91 0.0-25.0 mg/L
3540.0-
尿 肌 栈 (Cr-U) 90260 。 246000 hmolL
8.7411 0.0-3.394 ”mg/mmol
尿 微量 白 蛋白 / 肌 酬 比
值 (mg/g) (Alb- 77.2741 ”0-30.000 ”mg/g
U/cr-u (AcR) )`

    expect(parseUrineAcrFromText(text)).toEqual({
      acrMgG: '77.274',
      acrMgMmol: '8.741',
    })
  })

  it('prefers the value nearest mg/mmol over Alb-U result', () => {
    const text = `13:10 :345G 大
尿 微量 白 蛋 白 肌 酬 二 项
检测 指标 结果 参考 值 单位
尿 微量 白 蛋 白 (Alb-U) 103.21 0.0-25.0 mg/L
3540.0-
尿 肌 栈 (Cr-U) 182620 。 246000 hmolL
尿 微量 白 蛋白 / 肌 本 比
值 ACR) 5.6511 。 0.0-3.394 ”mg/mmol
尿 微量 白 蛋白 / 肌 酬 比
值 (mg/g) (Alb- ”49.9561 ”0-30000 ”mg/g
U/cr-u (AcR) )`

    expect(parseUrineAcrFromText(text)).toEqual({
      acrMgG: '49.956',
      acrMgMmol: '5.651',
    })
  })
})
