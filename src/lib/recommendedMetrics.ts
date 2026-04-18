import type { MetricChartKind } from '../types'

export type RecommendedMetric = {
  name: string
  unit: string
  /** 加入列表时使用的趋势类型，默认数值折线 */
  chartKind?: MetricChartKind
}

/**
 * 常用指标推荐（慢性肾病随访中较常监测的检验项目，可按化验单调整单位）
 * 涵盖：肾小球滤过与损伤标志、蛋白尿、电解质与酸碱、CKD-MBD、肾性贫血、糖脂代谢等。
 */
export const RECOMMENDED_METRICS: readonly RecommendedMetric[] = [
  /* —— 蛋白尿 / 肾损伤相关（前四项为必选保留）—— */
  { name: '尿 ACR', unit: 'mg/g', chartKind: 'number' },
  { name: '尿蛋白定性', unit: '', chartKind: 'urine-protein-qual' },
  { name: '尿蛋白定量', unit: 'g/24h', chartKind: 'number' },
  { name: '尿蛋白/肌酐比值', unit: 'mg/mmol' },
  { name: '沉渣红细胞', unit: '个/HP' },
  { name: '尿隐血', unit: '' },
  /* —— 肾功能 / 滤过 —— */
  { name: '血肌酐', unit: 'μmol/L', chartKind: 'number' },
  { name: 'eGFR', unit: 'mL/min/1.73m²' },
  { name: '血尿素氮', unit: 'mmol/L' },
  { name: '胱抑素C', unit: 'mg/L' },
  /* —— 电解质与酸碱平衡 —— */
  { name: '血钾', unit: 'mmol/L' },
  { name: '血钠', unit: 'mmol/L' },
  { name: '血氯', unit: 'mmol/L' },
  { name: '血碳酸氢根', unit: 'mmol/L' },
  /* —— CKD-MBD（钙磷代谢）—— */
  { name: '血钙', unit: 'mmol/L' },
  { name: '血磷', unit: 'mmol/L' },
  { name: '全段甲状旁腺激素', unit: 'pg/mL' },
  { name: '25羟维生素D', unit: 'ng/mL' },
  /* —— 肾性贫血相关 —— */
  { name: '血红蛋白', unit: 'g/L' },
  { name: '血清铁蛋白', unit: 'ng/mL' },
  { name: '转铁蛋白饱和度', unit: '%' },
  /* —— 血糖（糖尿病肾病常见合并）—— */
  { name: '空腹血糖', unit: 'mmol/L' },
  { name: '糖化血红蛋白', unit: '%' },
  /* —— 血脂 —— */
  { name: '总胆固醇', unit: 'mmol/L' },
  { name: '甘油三酯', unit: 'mmol/L' },
  { name: '低密度脂蛋白胆固醇', unit: 'mmol/L' },
  /* —— 其他常用 —— */
  { name: '血清白蛋白', unit: 'g/L' },
  { name: '尿酸', unit: 'μmol/L' },
]
