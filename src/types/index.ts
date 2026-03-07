import { DateTime } from 'luxon'

export interface FlightPlan {
  homeTimezone: string
  homeSleepTime: string   // "23:30"
  homeWakeTime: string    // "08:00"
  departureTimezone: string
  arrivalTimezone: string
  localScheduleTimezone?: string
  departureTime: string   // ISO string stored in localStorage
  arrivalTime: string     // ISO string stored in localStorage
  daysAtDestination: number
}

export interface FlightPlanDates {
  homeTimezone: string
  homeSleepTime: string
  homeWakeTime: string
  departureTimezone: string
  arrivalTimezone: string
  localScheduleTimezone?: string
  departureTime: DateTime
  arrivalTime: DateTime
  daysAtDestination: number
}

export type RecommendationType =
  | 'sleep'
  | 'wake'
  | 'melatonin'
  | 'seek-light'
  | 'avoid-light'
  | 'caffeine-ok'
  | 'avoid-caffeine'

export interface Recommendation {
  type: RecommendationType
  startTime: DateTime
  endTime?: DateTime
  dose?: string
  note: string
}

export interface DayPlan {
  date: DateTime
  label: string   // e.g. "Day before departure", "Flight day", "Day 1 at destination"
  displayTimezone: string
  recommendations: Recommendation[]
}
