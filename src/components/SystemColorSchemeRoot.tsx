import { useEffect, type ReactNode } from 'react'
import { useSystemDark } from '../hooks/useSystemDark'

/** 将系统浅色/深色偏好同步到 `<html class="dark">`，供 Tailwind `dark:` 使用 */
export function SystemColorSchemeRoot({ children }: { children: ReactNode }) {
  const dark = useSystemDark()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  return <>{children}</>
}
