import type { HealthRecord } from '../types'

const KEY = 'health-manager-records'

export function readRecordsRaw(): unknown[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

export function writeRecords(records: HealthRecord[]): void {
  localStorage.setItem(KEY, JSON.stringify(records))
}
