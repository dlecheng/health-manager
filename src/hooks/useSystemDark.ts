import { useSyncExternalStore } from 'react'

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', onStoreChange)
  return () => mq.removeEventListener('change', onStoreChange)
}

function getSnapshot() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function getServerSnapshot() {
  return false
}

/** 与系统「浅色 / 深色」外观设置同步 */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
