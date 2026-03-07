import { DateTime, Duration } from 'luxon'

function dtMax(a: DateTime, b: DateTime): DateTime {
  return a.toMillis() >= b.toMillis() ? a : b
}
function dtMin(a: DateTime, b: DateTime): DateTime {
  return a.toMillis() <= b.toMillis() ? a : b
}
import type { FlightPlanDates, DayPlan, Recommendation } from '../types'

function parseTimeInZone(timeStr: string, zone: string, date: DateTime): DateTime {
  const [h, m] = timeStr.split(':').map(Number)
  return date.setZone(zone).set({ hour: h, minute: m, second: 0, millisecond: 0 })
}

function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000
}


function tmin(wakeTime: DateTime): DateTime {
  return wakeTime.minus(Duration.fromMillis(hoursToMs(2)))
}

function addHours(dt: DateTime, hours: number): DateTime {
  return dt.plus(Duration.fromMillis(hoursToMs(hours)))
}

/**
 * Interpolate sleep times across the adjustment period.
 * On day 0 (2 days before departure) we're on home schedule.
 * By arrival day we should be shifting toward destination.
 */
function interpolateSleep(
  homeSleep: number,   // minutes from midnight
  homeWake: number,
  targetSleep: number,
  targetWake: number,
  progress: number     // 0..1
): { sleep: number; wake: number } {
  // progress=0 → home, progress=1 → target
  // Interpolate but limit to 1.5hr/day max shift
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const p = clamp(progress)

  function interpolateMinutes(a: number, b: number, t: number): number {
    // Handle wraparound: work in [-720, 720] space relative to a
    let diff = b - a
    // Normalize diff to [-720, 720] (within 12hr each way)
    while (diff > 720) diff -= 1440
    while (diff < -720) diff += 1440
    let result = a + diff * t
    // Normalize to [0, 1440)
    while (result < 0) result += 1440
    while (result >= 1440) result -= 1440
    return result
  }

  return {
    sleep: interpolateMinutes(homeSleep, targetSleep, p),
    wake: interpolateMinutes(homeWake, targetWake, p),
  }
}

function minutesFromMidnight(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function minutesToTimeStr(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const min = Math.floor(m % 60)
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function dayLabel(dayOffset: number, totalDays: number): string {
  if (dayOffset === -2) return '2 days before departure'
  if (dayOffset === -1) return '1 day before departure'
  if (dayOffset === 0) return 'Departure day'
  if (dayOffset === 1) return 'Arrival day'
  const destDay = dayOffset - 1
  if (destDay === totalDays) return 'Last day at destination'
  if (destDay === totalDays + 1) return '1 day after return'
  return `Day ${destDay} at destination`
}

export function generatePlan(flight: FlightPlanDates): DayPlan[] {
  const {
    homeTimezone,
    homeSleepTime,
    homeWakeTime,
    departureTimezone,
    arrivalTimezone,
    destSleepTime,
    destWakeTime,
    departureTime,
    arrivalTime,
    daysAtDestination,
  } = flight

  // Display timezone for destination days is always the arrival timezone
  const destDisplayTz = arrivalTimezone

  // Compute home sleep/wake in minutes from midnight
  const homeSleepMin = minutesFromMidnight(homeSleepTime)
  const homeWakeMin = minutesFromMidnight(homeWakeTime)

  // Determine destination wake/sleep times
  // If the user specified custom destination sleep times, use those; otherwise keep home times
  const destWakeMin = destWakeTime ? minutesFromMidnight(destWakeTime) : homeWakeMin
  const destSleepMin = destSleepTime ? minutesFromMidnight(destSleepTime) : homeSleepMin

  // Total timezone offset difference (positive = destination is east = need to advance clock)
  const depDate = departureTime.setZone(departureTimezone)
  const arrDate = arrivalTime.setZone(arrivalTimezone)
  const homeOffsetHrs = depDate.offset / 60
  const destOffsetHrs = arrDate.offset / 60
  const shiftHrs = destOffsetHrs - homeOffsetHrs  // positive = eastward = advance clock

  // Number of days in plan: 2 before departure + flight day + arrival day + days at destination + 2 after
  // We'll generate from 2 days before departure through daysAtDestination + 1 after arrival
  const planStartDate = departureTime.setZone(homeTimezone).startOf('day').minus({ days: 2 })
  const totalDays = 2 + 1 + 1 + daysAtDestination + 1  // 2 pre, dep, arr, dest days, 1 post

  // Flight duration
  const flightDurationMs = arrivalTime.toMillis() - departureTime.toMillis()
  const flightDurationHrs = flightDurationMs / 1000 / 3600

  const plans: DayPlan[] = []

  for (let i = 0; i < totalDays; i++) {
    const dayOffset = i - 2  // -2, -1, 0 (dep), 1 (arr), 2..N+2
    const isFlightDay = dayOffset === 0
    const isArrivalDay = dayOffset === 1
    const isPreDep = dayOffset < 0
    const isPostArr = dayOffset > 1

    // Progress: how far along the adjustment are we?
    // Pre-departure days: start shifting 2 days before
    // By the time we arrive (dayOffset=1), we should be at ~50-75% adjusted
    // After arrival, continue to full adjustment
    let progress: number
    if (dayOffset <= -2) {
      progress = 0
    } else if (dayOffset === -1) {
      progress = 0.2
    } else if (dayOffset === 0) {
      progress = 0.4
    } else if (dayOffset === 1) {
      progress = 0.6
    } else {
      const daysAfterArrival = dayOffset - 1
      progress = Math.min(1, 0.6 + daysAfterArrival * 0.15)
    }

    // Current sleep/wake times (interpolated between home and destination)
    const { sleep: curSleepMin, wake: curWakeMin } = interpolateSleep(
      homeSleepMin,
      homeWakeMin,
      destSleepMin,
      destWakeMin,
      progress
    )

    // Determine display timezone and date for this day
    let displayTz: string
    let dayDate: DateTime

    if (isPreDep) {
      displayTz = homeTimezone
      dayDate = planStartDate.plus({ days: i })
    } else if (isFlightDay) {
      displayTz = homeTimezone
      dayDate = departureTime.setZone(homeTimezone).startOf('day')
    } else if (isArrivalDay) {
      displayTz = destDisplayTz
      dayDate = arrivalTime.setZone(destDisplayTz).startOf('day')
    } else {
      displayTz = destDisplayTz
      dayDate = arrivalTime.setZone(destDisplayTz).startOf('day').plus({ days: dayOffset - 1 })
    }

    // Build sleep/wake DateTime objects in current display tz
    const wakeTimeStr = minutesToTimeStr(curWakeMin)
    const sleepTimeStr = minutesToTimeStr(curSleepMin)

    const wakeDateTime = parseTimeInZone(wakeTimeStr, displayTz, dayDate)
    let sleepDateTime = parseTimeInZone(sleepTimeStr, displayTz, dayDate)

    // Sleep is typically after midnight, so if sleep < wake (same day), push sleep to next day
    if (sleepDateTime <= wakeDateTime) {
      sleepDateTime = sleepDateTime.plus({ days: 1 })
    }

    // Tmin = wake - 2hr
    const tminTime = tmin(wakeDateTime)

    const recommendations: Recommendation[] = []

    // Direction: positive shiftHrs = eastward = advance clock (sleep/wake earlier)
    const advancing = shiftHrs > 0
    const delaying = shiftHrs < 0

    if (isFlightDay) {
      // ── Pre-flight: previous night's sleep ──
      recommendations.push({
        type: 'sleep',
        startTime: sleepDateTime.minus({ days: 1 }),
        endTime: wakeDateTime,
        note: 'Get a good night\'s sleep before your flight. Try not to stay up too late — you\'ll need your circadian system in good shape.',
      })

      // ── Flight band (spans full departure → arrival) ──
      const flightDurStr = (() => {
        const h = Math.floor(flightDurationHrs)
        const m = Math.round((flightDurationHrs - h) * 60)
        return m > 0 ? `${h}h ${m}m` : `${h}h`
      })()
      recommendations.push({
        type: 'flight',
        startTime: departureTime,
        endTime: arrivalTime,
        note: `Flight duration: ${flightDurStr}. Your recommendations below tell you when to sleep, take melatonin, and avoid caffeine during the flight.`,
      })

      // ── Compute on-plane sleep window ──
      // Goal: sleep during destination nighttime to align body clock.
      // Destination "night" = destSleepTime → destWakeTime the next morning.
      const destSleepHr   = Math.floor(destSleepMin / 60)
      const destSleepMn   = destSleepMin % 60
      const destWakeHr    = Math.floor(destWakeMin / 60)
      const destWakeMn    = destWakeMin % 60

      const depAtDest = departureTime.setZone(arrivalTimezone)

      // Find the next occurrence of destSleepTime at destination after boarding
      let nextDestSleep = depAtDest.set({ hour: destSleepHr, minute: destSleepMn, second: 0, millisecond: 0 })
      if (nextDestSleep <= depAtDest) nextDestSleep = nextDestSleep.plus({ days: 1 })

      // Check if we're boarding during destination nighttime (already past sleep time)
      const prevDestSleep = nextDestSleep.minus({ days: 1 })
      let nextDestWake    = prevDestSleep.set({ hour: destWakeHr, minute: destWakeMn }).plus({ days: 1 })
      if (nextDestWake <= prevDestSleep) nextDestWake = nextDestWake.plus({ days: 1 })
      const boardingDuringDestNight = depAtDest >= prevDestSleep && depAtDest < nextDestWake

      let targetSleepStart: DateTime
      let targetSleepEnd: DateTime

      if (boardingDuringDestNight) {
        // Already night at destination → sleep ASAP after boarding
        targetSleepStart = departureTime
        targetSleepEnd   = nextDestWake
      } else {
        // Daytime at destination → stay awake until destination sleep time
        targetSleepStart = nextDestSleep
        targetSleepEnd   = nextDestSleep.set({ hour: destWakeHr, minute: destWakeMn }).plus({ days: 1 })
        if (targetSleepEnd <= nextDestSleep) targetSleepEnd = targetSleepEnd.plus({ days: 1 })
      }

      // Clamp to actual flight window
      const planeSleepStart = dtMax(targetSleepStart, departureTime)
      const planeSleepEnd   = dtMin(targetSleepEnd,   arrivalTime)

      if (planeSleepEnd.toMillis() - planeSleepStart.toMillis() > 30 * 60 * 1000) {
        const sleepHrs = (planeSleepEnd.toMillis() - planeSleepStart.toMillis()) / 3600000
        const sleepHrsStr = `${Math.floor(sleepHrs)}h ${Math.round((sleepHrs % 1) * 60)}m`

        recommendations.push({
          type: 'sleep',
          startTime: planeSleepStart,
          endTime: planeSleepEnd,
          note: boardingDuringDestNight
            ? `It's already nighttime at your destination when you board. Try to sleep from the start of the flight for ~${sleepHrsStr}. Use an eye mask and earplugs. Recline your seat and avoid screens.`
            : `Stay awake until this point — it's daytime at your destination. Then try to sleep for ~${sleepHrsStr} to align with destination nighttime. Use an eye mask and earplugs.`,
        })

        // Melatonin: 30 min before plane sleep (or at boarding if sleep is immediate)
        const melTime = planeSleepStart.minus({ minutes: 30 })
        const actualMelTime = dtMax(melTime, departureTime)
        recommendations.push({
          type: 'melatonin',
          startTime: actualMelTime,
          dose: '0.5mg',
          note: boardingDuringDestNight
            ? 'Take 0.5mg melatonin at boarding — it\'s nighttime at your destination and you should sleep soon. 0.5mg is the optimal clock-shifting dose; higher doses (3mg) cause grogginess but shift the clock no better.'
            : `Take 0.5mg melatonin 30 minutes before your target sleep window on the plane (${planeSleepStart.setZone(arrivalTimezone).toFormat('h:mm a')} destination time).`,
        })

        // Avoid caffeine 6 hours before plane sleep
        const noCaffStart = planeSleepStart.minus({ hours: 6 })
        const actualNoCaffStart = dtMax(noCaffStart, departureTime)
        if (actualNoCaffStart < planeSleepStart) {
          if (actualNoCaffStart > departureTime) {
            recommendations.push({
              type: 'caffeine-ok',
              startTime: departureTime,
              endTime: actualNoCaffStart,
              note: 'Caffeine is fine during this window on the plane. It helps you stay alert and awake while it\'s daytime at your destination.',
            })
          }
          recommendations.push({
            type: 'avoid-caffeine',
            startTime: actualNoCaffStart,
            endTime: planeSleepStart,
            note: 'Avoid caffeine during this window — you\'ll want to fall asleep soon. Caffeine has a 5–6 hour half-life and will interfere with your ability to sleep on the plane.',
          })
        }
      }

      // ── Light before departure ──
      if (advancing) {
        if (tminTime > departureTime.setZone(homeTimezone)) {
          recommendations.push({
            type: 'avoid-light',
            startTime: addHours(tminTime, -3),
            endTime: tminTime,
            note: 'Avoid bright light before your temperature minimum to help advance your clock eastward.',
          })
        } else {
          recommendations.push({
            type: 'seek-light',
            startTime: addHours(tminTime, 2),
            endTime: addHours(tminTime, 5),
            note: 'Seek bright light after your temperature minimum to advance your clock for eastward travel.',
          })
        }
      } else if (delaying) {
        recommendations.push({
          type: 'seek-light',
          startTime: addHours(tminTime, -3),
          endTime: tminTime,
          note: 'Seek bright light before your temperature minimum to delay your clock for westward travel.',
        })
        recommendations.push({
          type: 'avoid-light',
          startTime: tminTime,
          endTime: addHours(tminTime, 3),
          note: 'Avoid bright light after your temperature minimum when traveling west.',
        })
      }

    } else if (isArrivalDay || isPostArr) {
      // Destination days: recommend based on shifted schedule
      recommendations.push({
        type: 'sleep',
        startTime: sleepDateTime.minus({ days: 1 }),
        endTime: wakeDateTime,
        note: isArrivalDay
          ? 'Try to sleep at this time to start syncing to your destination schedule.'
          : 'Maintain this sleep window to continue adjusting your circadian rhythm.',
      })

      // Melatonin before bed
      recommendations.push({
        type: 'melatonin',
        startTime: sleepDateTime.minus({ minutes: 30 }),
        dose: '0.5mg',
        note: '0.5mg melatonin 30 min before sleep is more effective for clock-shifting than higher doses (3mg+). It signals the body to begin the sleep transition.',
      })

      // Light recommendations based on direction
      if (advancing) {
        // Eastward: avoid light before Tmin, seek after
        recommendations.push({
          type: 'avoid-light',
          startTime: addHours(tminTime, -3),
          endTime: tminTime,
          note: 'Avoid bright light in the early morning to prevent delaying your clock further. Stay in dim light or wear sunglasses.',
        })
        recommendations.push({
          type: 'seek-light',
          startTime: addHours(tminTime, 1),
          endTime: addHours(tminTime, 4),
          note: 'Get bright light exposure after your temperature minimum. This is the most powerful signal to advance your clock.',
        })
      } else if (delaying) {
        // Westward: seek light before Tmin, avoid after
        recommendations.push({
          type: 'seek-light',
          startTime: addHours(tminTime, -3),
          endTime: tminTime,
          note: 'Get bright light before your temperature minimum to delay your clock for westward adjustment.',
        })
        recommendations.push({
          type: 'avoid-light',
          startTime: tminTime,
          endTime: addHours(tminTime, 3),
          note: 'Avoid bright light in this window when traveling west — it would advance your clock in the wrong direction.',
        })
      }

      // Caffeine windows
      const caffeineOkEnd = sleepDateTime.minus({ hours: 6 })
      recommendations.push({
        type: 'caffeine-ok',
        startTime: wakeDateTime,
        endTime: caffeineOkEnd,
        note: 'Caffeine is fine during this window. It can help you stay awake and alert at the right times.',
      })
      recommendations.push({
        type: 'avoid-caffeine',
        startTime: caffeineOkEnd,
        endTime: sleepDateTime,
        note: 'Avoid caffeine in the last 6 hours before sleep — its half-life will keep you awake at the wrong time.',
      })

    } else if (isPreDep) {
      // Pre-departure: start shifting gradually
      recommendations.push({
        type: 'sleep',
        startTime: sleepDateTime,
        endTime: wakeDateTime.plus({ days: 1 }),
        note: dayOffset === -1
          ? 'Shift your sleep slightly earlier/later to start adjusting before your flight.'
          : 'Maintain your normal sleep schedule today.',
      })

      if (dayOffset === -1) {
        // Day before: melatonin to start shifting
        if (advancing) {
          recommendations.push({
            type: 'melatonin',
            startTime: sleepDateTime.minus({ minutes: 30 }),
            dose: '0.5mg',
            note: 'Start taking melatonin before bed to begin advancing your clock before departure.',
          })
          recommendations.push({
            type: 'avoid-light',
            startTime: addHours(tminTime, -3),
            endTime: tminTime,
            note: 'Avoid bright light early in the morning to help advance your clock.',
          })
          recommendations.push({
            type: 'seek-light',
            startTime: addHours(tminTime, 1),
            endTime: addHours(tminTime, 4),
            note: 'Seek bright light in late morning to advance your circadian rhythm.',
          })
        } else if (delaying) {
          recommendations.push({
            type: 'melatonin',
            startTime: sleepDateTime.plus({ hours: 1 }),
            dose: '0.5mg',
            note: 'Take melatonin slightly later than usual to begin delaying your clock before departure.',
          })
          recommendations.push({
            type: 'seek-light',
            startTime: addHours(tminTime, -3),
            endTime: tminTime,
            note: 'Get bright light early to delay your clock for westward travel.',
          })
        }

        const caffeineOkEnd = sleepDateTime.minus({ hours: 6 })
        recommendations.push({
          type: 'caffeine-ok',
          startTime: wakeDateTime,
          endTime: caffeineOkEnd,
          note: 'Caffeine is fine in this window.',
        })
        recommendations.push({
          type: 'avoid-caffeine',
          startTime: caffeineOkEnd,
          endTime: sleepDateTime,
          note: 'Avoid caffeine in the 6 hours before sleep.',
        })
      }
    }

    // Sort recommendations by start time
    recommendations.sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis())

    plans.push({
      date: dayDate,
      label: dayLabel(dayOffset, daysAtDestination),
      displayTimezone: displayTz,
      recommendations,
    })
  }

  return plans
}
