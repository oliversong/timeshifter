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

/**
 * Push a light recommendation, clipping to the waking window [wake, sleep].
 * If the clipped window has zero duration, the rec is dropped entirely.
 */
function pushLight(
  recs: Recommendation[],
  type: 'seek-light' | 'avoid-light',
  start: DateTime,
  end: DateTime,
  wake: DateTime,
  sleep: DateTime,
  note: string,
): void {
  const clippedStart = dtMax(start, wake)
  const clippedEnd   = dtMin(end,   sleep)
  if (clippedEnd > clippedStart) {
    recs.push({ type, startTime: clippedStart, endTime: clippedEnd, note })
  }
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

function dayLabel(dayOffset: number, returnDepOffset: number): string {
  if (dayOffset === -2) return '2 days before departure'
  if (dayOffset === -1) return '1 day before departure'
  if (dayOffset === 0) return 'Departure day'
  if (dayOffset === 1) return 'Arrival day'
  if (dayOffset === returnDepOffset) return 'Return flight day'
  if (dayOffset === returnDepOffset + 1) return 'Return arrival day'
  if (dayOffset === returnDepOffset + 2) return '1 day after return'
  if (dayOffset === returnDepOffset + 3) return '2 days after return'
  const destDay = dayOffset - 1
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
    returnDepartureTimezone,
    returnDepartureTime,
    returnArrivalTimezone,
    returnArrivalTime,
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

  // Outbound shift: positive = destination is east = advance clock
  const depDate = departureTime.setZone(departureTimezone)
  const arrDate = arrivalTime.setZone(arrivalTimezone)
  const homeOffsetHrs = depDate.offset / 60
  const destOffsetHrs = arrDate.offset / 60
  const shiftHrs = destOffsetHrs - homeOffsetHrs

  // Return shift: from destination back to home (reverse direction)
  const retDepDate = returnDepartureTime.setZone(returnDepartureTimezone)
  const retArrDate = returnArrivalTime.setZone(returnArrivalTimezone)
  const retShiftHrs = retArrDate.offset / 60 - retDepDate.offset / 60

  // Compute how many calendar days between outbound arrival and return departure (in dest tz)
  const arrivalDayStart = arrivalTime.setZone(destDisplayTz).startOf('day')
  const returnDepDayStart = returnDepartureTime.setZone(returnDepartureTimezone).startOf('day')
  const daysAtDestination = Math.max(0, Math.round(
    returnDepDayStart.diff(arrivalDayStart, 'days').days
  ))

  // dayOffset of the return departure day (1=arrival, 2..N=dest days, N+1=return dep)
  const returnDepOffset = 1 + daysAtDestination

  // Plan spans: 2 pre-dep + dep + arr + dest days + ret-dep + ret-arr + 2 post-return
  const planStartDate = departureTime.setZone(homeTimezone).startOf('day').minus({ days: 2 })
  const totalDays = 2 + 1 + 1 + daysAtDestination + 1 + 1 + 2

  // Outbound flight duration
  const flightDurationMs = arrivalTime.toMillis() - departureTime.toMillis()
  const flightDurationHrs = flightDurationMs / 1000 / 3600

  // Return flight duration
  const retFlightDurationMs = returnArrivalTime.toMillis() - returnDepartureTime.toMillis()
  const retFlightDurationHrs = retFlightDurationMs / 1000 / 3600

  const plans: DayPlan[] = []

  for (let i = 0; i < totalDays; i++) {
    const dayOffset = i - 2  // -2, -1, 0 (dep), 1 (arr), ...
    const isFlightDay = dayOffset === 0
    const isArrivalDay = dayOffset === 1
    const isReturnFlightDay = dayOffset === returnDepOffset
    const isReturnArrivalDay = dayOffset === returnDepOffset + 1
    const isPreDep = dayOffset < 0
    const isDestDay = dayOffset > 1 && dayOffset < returnDepOffset
    const isPostReturn = dayOffset > returnDepOffset + 1

    // Progress toward destination (0 = home schedule, 1 = fully on dest schedule)
    // Shifts 0 → 1 during outbound journey and dest stay, then 1 → 0 on return
    let progress: number
    if (dayOffset <= -2) {
      progress = 0
    } else if (dayOffset === -1) {
      progress = 0.2
    } else if (dayOffset === 0) {
      progress = 0.4
    } else if (dayOffset === 1) {
      progress = 0.6
    } else if (dayOffset <= returnDepOffset) {
      const daysAfterArrival = dayOffset - 1
      progress = Math.min(1, 0.6 + daysAfterArrival * 0.15)
    } else if (dayOffset === returnDepOffset + 1) {
      progress = 0.6  // return arrival — still partly on dest schedule
    } else {
      const daysAfterReturnArr = dayOffset - (returnDepOffset + 1)
      progress = Math.max(0, 0.6 - daysAfterReturnArr * 0.3)
    }

    // For post-return days, interpolate back from dest to home
    const isReturning = dayOffset >= returnDepOffset
    const { sleep: curSleepMin, wake: curWakeMin } = isReturning
      ? interpolateSleep(destSleepMin, destWakeMin, homeSleepMin, homeWakeMin, 1 - progress)
      : interpolateSleep(homeSleepMin, homeWakeMin, destSleepMin, destWakeMin, progress)

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
    } else if (isReturnFlightDay) {
      displayTz = returnDepartureTimezone
      dayDate = returnDepartureTime.setZone(returnDepartureTimezone).startOf('day')
    } else if (isReturnArrivalDay) {
      displayTz = returnArrivalTimezone
      dayDate = returnArrivalTime.setZone(returnArrivalTimezone).startOf('day')
    } else if (isPostReturn) {
      displayTz = homeTimezone
      const daysAfterReturnArr = dayOffset - (returnDepOffset + 1)
      dayDate = returnArrivalTime.setZone(homeTimezone).startOf('day').plus({ days: daysAfterReturnArr })
    } else {
      // Destination days
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

    // Outbound direction: positive = eastward = advance clock
    const advancing = shiftHrs > 0
    const delaying = shiftHrs < 0

    // Return direction (going back home)
    const retAdvancing = retShiftHrs > 0
    const retDelaying = retShiftHrs < 0

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

      // ── Light before departure (clip to waking hours before takeoff) ──
      const flightLightSleep = dtMin(sleepDateTime, departureTime)
      if (advancing) {
        if (tminTime > departureTime.setZone(homeTimezone)) {
          pushLight(recommendations, 'avoid-light',
            addHours(tminTime, -3), tminTime,
            wakeDateTime, flightLightSleep,
            'Avoid bright light before your temperature minimum to help advance your clock eastward.')
        } else {
          pushLight(recommendations, 'seek-light',
            addHours(tminTime, 2), addHours(tminTime, 5),
            wakeDateTime, flightLightSleep,
            'Seek bright light after your temperature minimum to advance your clock for eastward travel.')
        }
      } else if (delaying) {
        pushLight(recommendations, 'seek-light',
          addHours(tminTime, -3), tminTime,
          wakeDateTime, flightLightSleep,
          'Seek bright light before your temperature minimum to delay your clock for westward travel.')
        pushLight(recommendations, 'avoid-light',
          tminTime, addHours(tminTime, 3),
          wakeDateTime, flightLightSleep,
          'Avoid bright light after your temperature minimum when traveling west.')
      }

    } else if (isArrivalDay || isDestDay) {
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

      // Light recommendations based on outbound direction (clipped to waking hours)
      if (advancing) {
        pushLight(recommendations, 'avoid-light',
          addHours(tminTime, -3), tminTime,
          wakeDateTime, sleepDateTime,
          'Avoid bright light in the early morning to prevent delaying your clock further. Stay in dim light or wear sunglasses.')
        pushLight(recommendations, 'seek-light',
          addHours(tminTime, 1), addHours(tminTime, 4),
          wakeDateTime, sleepDateTime,
          'Get bright light exposure after your temperature minimum. This is the most powerful signal to advance your clock.')
      } else if (delaying) {
        pushLight(recommendations, 'seek-light',
          addHours(tminTime, -3), tminTime,
          wakeDateTime, sleepDateTime,
          'Get bright light before your temperature minimum to delay your clock for westward adjustment.')
        pushLight(recommendations, 'avoid-light',
          tminTime, addHours(tminTime, 3),
          wakeDateTime, sleepDateTime,
          'Avoid bright light in this window when traveling west — it would advance your clock in the wrong direction.')
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

    } else if (isReturnFlightDay) {
      // ── Pre-return-flight: previous night's sleep at destination ──
      recommendations.push({
        type: 'sleep',
        startTime: sleepDateTime.minus({ days: 1 }),
        endTime: wakeDateTime,
        note: 'Get a good night\'s sleep before your return flight. Your body is still partly on destination time.',
      })

      // ── Return flight band ──
      const retFlightDurStr = (() => {
        const h = Math.floor(retFlightDurationHrs)
        const m = Math.round((retFlightDurationHrs - h) * 60)
        return m > 0 ? `${h}h ${m}m` : `${h}h`
      })()
      recommendations.push({
        type: 'flight',
        startTime: returnDepartureTime,
        endTime: returnArrivalTime,
        note: `Return flight duration: ${retFlightDurStr}. Adjust your sleep, melatonin, and light exposure to help re-sync to your home timezone.`,
      })

      // ── On-plane sleep window for return: target home nighttime ──
      const homeSleepHr = Math.floor(homeSleepMin / 60)
      const homeSleepMn = homeSleepMin % 60
      const homeWakeHr  = Math.floor(homeWakeMin / 60)
      const homeWakeMn  = homeWakeMin % 60

      const retDepAtHome = returnDepartureTime.setZone(returnArrivalTimezone)

      let nextHomeSleep = retDepAtHome.set({ hour: homeSleepHr, minute: homeSleepMn, second: 0, millisecond: 0 })
      if (nextHomeSleep <= retDepAtHome) nextHomeSleep = nextHomeSleep.plus({ days: 1 })

      const prevHomeSleep = nextHomeSleep.minus({ days: 1 })
      let nextHomeWake    = prevHomeSleep.set({ hour: homeWakeHr, minute: homeWakeMn }).plus({ days: 1 })
      if (nextHomeWake <= prevHomeSleep) nextHomeWake = nextHomeWake.plus({ days: 1 })
      const boardingDuringHomeNight = retDepAtHome >= prevHomeSleep && retDepAtHome < nextHomeWake

      let retTargetSleepStart: DateTime
      let retTargetSleepEnd: DateTime

      if (boardingDuringHomeNight) {
        retTargetSleepStart = returnDepartureTime
        retTargetSleepEnd   = nextHomeWake
      } else {
        retTargetSleepStart = nextHomeSleep
        retTargetSleepEnd   = nextHomeSleep.set({ hour: homeWakeHr, minute: homeWakeMn }).plus({ days: 1 })
        if (retTargetSleepEnd <= nextHomeSleep) retTargetSleepEnd = retTargetSleepEnd.plus({ days: 1 })
      }

      const retPlaneSleepStart = dtMax(retTargetSleepStart, returnDepartureTime)
      const retPlaneSleepEnd   = dtMin(retTargetSleepEnd,   returnArrivalTime)

      if (retPlaneSleepEnd.toMillis() - retPlaneSleepStart.toMillis() > 30 * 60 * 1000) {
        const sleepHrs = (retPlaneSleepEnd.toMillis() - retPlaneSleepStart.toMillis()) / 3600000
        const sleepHrsStr = `${Math.floor(sleepHrs)}h ${Math.round((sleepHrs % 1) * 60)}m`

        recommendations.push({
          type: 'sleep',
          startTime: retPlaneSleepStart,
          endTime: retPlaneSleepEnd,
          note: boardingDuringHomeNight
            ? `It's nighttime at home when you board. Try to sleep from the start of the return flight for ~${sleepHrsStr} to re-sync with your home schedule.`
            : `Stay awake until this point — it's daytime at home. Then sleep for ~${sleepHrsStr} to align with your home nighttime.`,
        })

        const retMelTime     = retPlaneSleepStart.minus({ minutes: 30 })
        const actualRetMel   = dtMax(retMelTime, returnDepartureTime)
        recommendations.push({
          type: 'melatonin',
          startTime: actualRetMel,
          dose: '0.5mg',
          note: `Take 0.5mg melatonin to help shift back to your home clock. ${boardingDuringHomeNight ? 'Take it at boarding.' : `Take it 30 minutes before your target sleep window (${retPlaneSleepStart.setZone(returnArrivalTimezone).toFormat('h:mm a')} home time).`}`,
        })

        const retNoCaffStart      = retPlaneSleepStart.minus({ hours: 6 })
        const actualRetNoCaffStart = dtMax(retNoCaffStart, returnDepartureTime)
        if (actualRetNoCaffStart < retPlaneSleepStart) {
          if (actualRetNoCaffStart > returnDepartureTime) {
            recommendations.push({
              type: 'caffeine-ok',
              startTime: returnDepartureTime,
              endTime: actualRetNoCaffStart,
              note: 'Caffeine is fine during this window on the return flight.',
            })
          }
          recommendations.push({
            type: 'avoid-caffeine',
            startTime: actualRetNoCaffStart,
            endTime: retPlaneSleepStart,
            note: 'Avoid caffeine — you\'ll want to sleep soon to re-sync with your home schedule.',
          })
        }
      }

      // Light on return flight day (clipped to waking hours before takeoff)
      const retLightSleep = dtMin(sleepDateTime, returnDepartureTime)
      if (retAdvancing) {
        if (tminTime > returnDepartureTime.setZone(returnDepartureTimezone)) {
          pushLight(recommendations, 'avoid-light',
            addHours(tminTime, -3), tminTime,
            wakeDateTime, retLightSleep,
            'Avoid bright light before your temperature minimum to help re-advance your clock back home.')
        } else {
          pushLight(recommendations, 'seek-light',
            addHours(tminTime, 2), addHours(tminTime, 5),
            wakeDateTime, retLightSleep,
            'Seek bright light after your temperature minimum to advance your clock back toward home.')
        }
      } else if (retDelaying) {
        pushLight(recommendations, 'seek-light',
          addHours(tminTime, -3), tminTime,
          wakeDateTime, retLightSleep,
          'Get bright light before your temperature minimum to delay your clock back toward home.')
        pushLight(recommendations, 'avoid-light',
          tminTime, addHours(tminTime, 3),
          wakeDateTime, retLightSleep,
          'Avoid bright light after your temperature minimum when re-adjusting westward.')
      }

    } else if (isReturnArrivalDay || isPostReturn) {
      // Post-return days: shifting back to home schedule
      recommendations.push({
        type: 'sleep',
        startTime: sleepDateTime.minus({ days: 1 }),
        endTime: wakeDateTime,
        note: isReturnArrivalDay
          ? 'Try to sleep at this time to re-sync with your home schedule.'
          : 'Maintain this sleep window to continue adjusting back to your home rhythm.',
      })

      recommendations.push({
        type: 'melatonin',
        startTime: sleepDateTime.minus({ minutes: 30 }),
        dose: '0.5mg',
        note: '0.5mg melatonin before sleep helps shift your clock back to your home timezone.',
      })

      if (retAdvancing) {
        pushLight(recommendations, 'avoid-light',
          addHours(tminTime, -3), tminTime,
          wakeDateTime, sleepDateTime,
          'Avoid bright light in the early morning to re-advance your clock back home.')
        pushLight(recommendations, 'seek-light',
          addHours(tminTime, 1), addHours(tminTime, 4),
          wakeDateTime, sleepDateTime,
          'Get bright light exposure after your temperature minimum to advance your clock back home.')
      } else if (retDelaying) {
        pushLight(recommendations, 'seek-light',
          addHours(tminTime, -3), tminTime,
          wakeDateTime, sleepDateTime,
          'Get bright light before your temperature minimum to re-delay your clock back home.')
        pushLight(recommendations, 'avoid-light',
          tminTime, addHours(tminTime, 3),
          wakeDateTime, sleepDateTime,
          'Avoid bright light after your temperature minimum when re-adjusting westward.')
      }

      const caffeineOkEnd = sleepDateTime.minus({ hours: 6 })
      recommendations.push({
        type: 'caffeine-ok',
        startTime: wakeDateTime,
        endTime: caffeineOkEnd,
        note: 'Caffeine is fine during this window.',
      })
      recommendations.push({
        type: 'avoid-caffeine',
        startTime: caffeineOkEnd,
        endTime: sleepDateTime,
        note: 'Avoid caffeine in the last 6 hours before sleep.',
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
          pushLight(recommendations, 'avoid-light',
            addHours(tminTime, -3), tminTime,
            wakeDateTime, sleepDateTime,
            'Avoid bright light early in the morning to help advance your clock.')
          pushLight(recommendations, 'seek-light',
            addHours(tminTime, 1), addHours(tminTime, 4),
            wakeDateTime, sleepDateTime,
            'Seek bright light in late morning to advance your circadian rhythm.')
        } else if (delaying) {
          recommendations.push({
            type: 'melatonin',
            startTime: sleepDateTime.plus({ hours: 1 }),
            dose: '0.5mg',
            note: 'Take melatonin slightly later than usual to begin delaying your clock before departure.',
          })
          pushLight(recommendations, 'seek-light',
            addHours(tminTime, -3), tminTime,
            wakeDateTime, sleepDateTime,
            'Get bright light early to delay your clock for westward travel.')
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
      label: dayLabel(dayOffset, returnDepOffset),
      displayTimezone: displayTz,
      recommendations,
    })
  }

  return plans
}
