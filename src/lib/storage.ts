import type { FlightPlan } from '../types'

const STORAGE_KEY = 'timeshifter-plan'

export function savePlan(plan: FlightPlan): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
  } catch {
    // Ignore storage errors
  }
}

export function loadPlan(): FlightPlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FlightPlan
  } catch {
    return null
  }
}
