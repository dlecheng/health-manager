/** 趋势图绘制方式 */
export type MetricChartKind = 'number' | 'urine-protein-qual'

export type MetricDefinition = {
  id: string
  name: string
  unit: string
  chartKind: MetricChartKind
}

/**
 * 一条记录中某个指标的取值；快照在保存时写入，便于指标改名后历史仍可辨认
 */
export type RecordValue = {
  metricId: string
  value: string
  nameSnapshot: string
  unitSnapshot: string
}

export type HealthRecord = {
  id: string
  date: string
  values: RecordValue[]
}
