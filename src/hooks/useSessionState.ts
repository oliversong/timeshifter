import { useState, useCallback } from 'react'

/**
 * Like useState, but persists to sessionStorage so values survive
 * Vite HMR refreshes during development. The stored value is cleared
 * when the browser tab closes.
 */
export function useSessionState<T>(key: string, defaultValue: T) {
  const storageKey = `__dev_form_${key}`

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey)
      if (stored !== null) return JSON.parse(stored)
    } catch {
      // ignore parse errors
    }
    return defaultValue
  })

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue(prev => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(resolved))
        } catch {
          // quota exceeded – just skip persistence
        }
        return resolved
      })
    },
    [storageKey]
  )

  return [value, set] as const
}
