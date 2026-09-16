import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export const Theme = {
  light: "light",
  dark: "dark",
} as const

export type Theme = (typeof Theme)[keyof typeof Theme]

const STORAGE_KEY = "helpdesk-theme"

// Mirrors the inline script in index.html, which applies this same
// preference to `<html>` before React mounts so there's no flash of the
// wrong theme on load.
function getPreferredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === Theme.light || stored === Theme.dark) return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? Theme.dark
    : Theme.light
}

const ThemeContext = createContext<{
  theme: Theme
  toggleTheme: () => void
} | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getPreferredTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === Theme.dark)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  function toggleTheme() {
    setTheme((prev) => (prev === Theme.dark ? Theme.light : Theme.dark))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
