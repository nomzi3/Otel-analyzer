import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'otel-dark-mode'

export interface DarkModeContextValue {
  dark: boolean
  toggle: () => void
}

export const DarkModeContext = createContext<DarkModeContextValue>({
  dark: false,
  toggle: () => {},
})

export function useDarkMode() {
  return useContext(DarkModeContext)
}

export function useDarkModeState(): DarkModeContextValue {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) return stored === 'true'
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try { localStorage.setItem(STORAGE_KEY, String(dark)) } catch {}
  }, [dark])

  const toggle = () => setDark(d => !d)

  return { dark, toggle }
}
