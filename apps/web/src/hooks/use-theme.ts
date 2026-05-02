import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'auto'

const THEME_COOKIE = 'theme'

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1]
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

function resolveDark(theme: Theme): boolean {
  if (typeof window === 'undefined') return false
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', resolveDark(theme))
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = readCookie(THEME_COOKIE)
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved
    return 'auto'
  })

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'auto') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('auto')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = (t: Theme) => {
    writeCookie(THEME_COOKIE, t)
    setThemeState(t)
  }

  return [theme, setTheme] as const
}
