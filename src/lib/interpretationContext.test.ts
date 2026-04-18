import { describe, expect, it } from 'vitest'
import { buildInterpretationContext } from './interpretationContext'
import type { HealthRecord, MetricDefinition } from '../types'

describe('buildInterpretationContext', () => {
  it('returns empty message when no records', () => {
    const metrics: MetricDefinition[] = [
      {
        id: 'm1',
        name: '血肌酐',
        unit: 'μmol/L',
        chartKind: 'number',
      },
    ]
    const r = buildInterpretationContext(metrics, [])
    expect(r.recordCount).toBe(0)
    expect(r.summaryText).toContain('没有任何已保存记录')
  })

  it('includes latest value and trend when two points exist', () => {
    const metrics: MetricDefinition[] = [
      {
        id: 'm1',
        name: '血肌酐',
        unit: 'μmol/L',
        chartKind: 'number',
      },
    ]
    const records: HealthRecord[] = [
      {
        id: 'a',
        date: '2024-01-01',
        values: [
          {
            metricId: 'm1',
            value: '80',
            nameSnapshot: '血肌酐',
            unitSnapshot: 'μmol/L',
          },
        ],
      },
      {
        id: 'b',
        date: '2024-02-01',
        values: [
          {
            metricId: 'm1',
            value: '90',
            nameSnapshot: '血肌酐',
            unitSnapshot: 'μmol/L',
          },
        ],
      },
    ]
    const r = buildInterpretationContext(metrics, records)
    expect(r.latestDate).toBe('2024-02-01')
    expect(r.summaryText).toContain('2024-02-01')
    expect(r.summaryText).toMatch(/上升|下降|稳定/)
  })
})
