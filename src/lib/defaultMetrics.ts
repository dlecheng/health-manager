import type { MetricDefinition } from '../types'

/** 内置指标固定 id，保证新旧记录与趋势图引用同一指标 */
export const BUILTIN_IDS = {
  acr: 'builtin-metric-acr',
  proteinQual: 'builtin-metric-protein-qual',
  protein24h: 'builtin-metric-protein-24h',
  creatinine: 'builtin-metric-creatinine',
} as const

export function createDefaultMetricList(): MetricDefinition[] {
  return [
    {
      id: BUILTIN_IDS.acr,
      name: '尿 ACR',
      unit: 'mg/g',
      chartKind: 'number',
    },
    {
      id: BUILTIN_IDS.proteinQual,
      name: '尿蛋白定性',
      unit: '',
      chartKind: 'urine-protein-qual',
    },
    {
      id: BUILTIN_IDS.protein24h,
      name: '24 小时尿蛋白定量',
      unit: 'g/24h',
      chartKind: 'number',
    },
    {
      id: BUILTIN_IDS.creatinine,
      name: '血肌酐',
      unit: 'μmol/L',
      chartKind: 'number',
    },
  ]
}
