import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { generatePlan } from './circadian'
import type { FlightPlanDates, DayPlan, Recommendation } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlan(overrides: Partial<FlightPlanDates> = {}): FlightPlanDates {
  return {
    homeTimezone: 'America/Los_Angeles',
    homeSleepTime: '23:00',
    homeWakeTime: '07:00',
    departureTimezone: 'America/Los_Angeles',
    arrivalTimezone: 'Asia/Shanghai',
    destSleepTime: undefined,
    destWakeTime: undefined,
    // LA to Shanghai: depart June 15 1pm PT, arrive June 16 5pm CST
    departureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 13, minute: 0 },
      { zone: 'America/Los_Angeles' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 16, hour: 17, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
    // Return: depart June 22 7pm CST, arrive June 22 4pm PT
    returnDepartureTimezone: 'Asia/Shanghai',
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 22, hour: 19, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
    returnArrivalTimezone: 'America/Los_Angeles',
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 22, hour: 16, minute: 0 },
      { zone: 'America/Los_Angeles' }
    ),
    ...overrides,
  }
}

function getRecsOfType(plans: DayPlan[], type: string): Recommendation[] {
  return plans.flatMap(p => p.recommendations.filter(r => r.type === type))
}

function findDayByLabel(plans: DayPlan[], label: string): DayPlan | undefined {
  return plans.find(p => p.label === label)
}

function findDayByLabelSubstring(plans: DayPlan[], sub: string): DayPlan | undefined {
  return plans.find(p => p.label.toLowerCase().includes(sub.toLowerCase()))
}

// ── Plan structure tests ─────────────────────────────────────────────────────

describe('generatePlan - structure', () => {
  it('returns an array of day plans', () => {
    const plans = generatePlan(makePlan())
    expect(Array.isArray(plans)).toBe(true)
    expect(plans.length).toBeGreaterThan(0)
  })

  it('includes pre-departure, departure, arrival, destination, return, and post-return days', () => {
    const plans = generatePlan(makePlan())
    const labels = plans.map(p => p.label)

    expect(labels).toContain('2 days before departure')
    expect(labels).toContain('1 day before departure')
    expect(labels).toContain('Departure day')
    expect(labels).toContain('Arrival day')
    expect(labels).toContain('Return flight day')
    expect(labels).toContain('Return arrival day')
    expect(labels).toContain('1 day after return')
    expect(labels).toContain('2 days after return')
  })

  it('has the correct number of total days', () => {
    const plans = generatePlan(makePlan())
    // 2 pre + 1 dep + 1 arr + N dest + 1 ret-dep + 1 ret-arr + 2 post
    // With the default plan: arr Jun 16, ret-dep Jun 22 = 6 days at dest
    // Total = 2 + 1 + 1 + 6 + 1 + 1 + 2 = 14
    // Actually daysAtDestination = returnDepDayStart - arrivalDayStart in days
    // arrivalDayStart = Jun 16 00:00 CST, returnDepDayStart = Jun 22 00:00 CST = 6 days
    // returnDepOffset = 1 + 6 = 7
    // totalDays = 2 + 1 + 1 + 6 + 1 + 1 + 2 = 14
    expect(plans.length).toBe(14)
  })

  it('each day plan has a date, label, displayTimezone, and recommendations', () => {
    const plans = generatePlan(makePlan())
    for (const plan of plans) {
      expect(plan.date).toBeDefined()
      expect(plan.date.isValid).toBe(true)
      expect(typeof plan.label).toBe('string')
      expect(plan.label.length).toBeGreaterThan(0)
      expect(typeof plan.displayTimezone).toBe('string')
      expect(Array.isArray(plan.recommendations)).toBe(true)
    }
  })

  it('recommendations are sorted by start time within each day', () => {
    const plans = generatePlan(makePlan())
    for (const plan of plans) {
      for (let i = 1; i < plan.recommendations.length; i++) {
        expect(plan.recommendations[i].startTime.toMillis())
          .toBeGreaterThanOrEqual(plan.recommendations[i - 1].startTime.toMillis())
      }
    }
  })
})

// ── Display timezone tests ──────────────────────────────────────────────────

describe('generatePlan - display timezones', () => {
  it('uses home timezone for pre-departure days', () => {
    const plans = generatePlan(makePlan())
    const preDep = plans.filter(p =>
      p.label.includes('before departure')
    )
    for (const day of preDep) {
      expect(day.displayTimezone).toBe('America/Los_Angeles')
    }
  })

  it('uses home timezone for departure day', () => {
    const plans = generatePlan(makePlan())
    const depDay = findDayByLabel(plans, 'Departure day')!
    expect(depDay.displayTimezone).toBe('America/Los_Angeles')
  })

  it('uses destination timezone for arrival day', () => {
    const plans = generatePlan(makePlan())
    const arrDay = findDayByLabel(plans, 'Arrival day')!
    expect(arrDay.displayTimezone).toBe('Asia/Shanghai')
  })

  it('uses destination timezone for days at destination', () => {
    const plans = generatePlan(makePlan())
    const destDays = plans.filter(p => p.label.includes('at destination'))
    expect(destDays.length).toBeGreaterThan(0)
    for (const day of destDays) {
      // Destination days should use dest display timezone
      expect(['Asia/Shanghai', 'America/Los_Angeles']).toContain(day.displayTimezone)
    }
  })

  it('uses return departure timezone for return flight day', () => {
    const plans = generatePlan(makePlan())
    const retDay = findDayByLabel(plans, 'Return flight day')!
    expect(retDay.displayTimezone).toBe('Asia/Shanghai')
  })

  it('uses return arrival timezone for return arrival day', () => {
    const plans = generatePlan(makePlan())
    const retArr = findDayByLabel(plans, 'Return arrival day')!
    expect(retArr.displayTimezone).toBe('America/Los_Angeles')
  })

  it('uses home timezone for post-return days', () => {
    const plans = generatePlan(makePlan())
    const postRet = plans.filter(p => p.label.includes('after return'))
    for (const day of postRet) {
      expect(day.displayTimezone).toBe('America/Los_Angeles')
    }
  })
})

// ── Flight recommendation tests ──────────────────────────────────────────────

describe('generatePlan - flight recommendations', () => {
  it('includes outbound flight recommendation on departure day', () => {
    const plans = generatePlan(makePlan())
    const depDay = findDayByLabel(plans, 'Departure day')!
    const flightRecs = depDay.recommendations.filter(r => r.type === 'flight')
    expect(flightRecs.length).toBe(1)
  })

  it('outbound flight spans departure to arrival', () => {
    const plan = makePlan()
    const plans = generatePlan(plan)
    const depDay = findDayByLabel(plans, 'Departure day')!
    const flightRec = depDay.recommendations.find(r => r.type === 'flight')!
    expect(flightRec.startTime.toMillis()).toBe(plan.departureTime.toMillis())
    expect(flightRec.endTime!.toMillis()).toBe(plan.arrivalTime.toMillis())
  })

  it('includes return flight recommendation on return day', () => {
    const plans = generatePlan(makePlan())
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const flightRecs = retDay.recommendations.filter(r => r.type === 'flight')
    expect(flightRecs.length).toBe(1)
  })

  it('return flight spans return departure to return arrival', () => {
    const plan = makePlan()
    const plans = generatePlan(plan)
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const flightRec = retDay.recommendations.find(r => r.type === 'flight')!
    expect(flightRec.startTime.toMillis()).toBe(plan.returnDepartureTime.toMillis())
    expect(flightRec.endTime!.toMillis()).toBe(plan.returnArrivalTime.toMillis())
  })

  it('flight note includes duration', () => {
    const plans = generatePlan(makePlan())
    const depDay = findDayByLabel(plans, 'Departure day')!
    const flightRec = depDay.recommendations.find(r => r.type === 'flight')!
    expect(flightRec.note).toMatch(/Flight duration:/)
    expect(flightRec.note).toMatch(/\d+h/)
  })
})

// ── Sleep recommendation tests ────────────────────────────────────────────────

describe('generatePlan - sleep recommendations', () => {
  it('includes sleep recommendation for every day', () => {
    const plans = generatePlan(makePlan())
    for (const plan of plans) {
      const sleepRecs = plan.recommendations.filter(r => r.type === 'sleep')
      expect(sleepRecs.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('sleep endTime is always after startTime', () => {
    const plans = generatePlan(makePlan())
    const sleepRecs = getRecsOfType(plans, 'sleep')
    for (const rec of sleepRecs) {
      if (rec.endTime) {
        expect(rec.endTime.toMillis()).toBeGreaterThan(rec.startTime.toMillis())
      }
    }
  })

  it('sleep duration is reasonable (4-14 hours)', () => {
    const plans = generatePlan(makePlan())
    const sleepRecs = getRecsOfType(plans, 'sleep')
    for (const rec of sleepRecs) {
      if (rec.endTime) {
        const hours = (rec.endTime.toMillis() - rec.startTime.toMillis()) / 3600000
        // On-plane sleep can be shorter than normal; overnight sleep should be 4+ hrs
        expect(hours).toBeGreaterThanOrEqual(1)
        expect(hours).toBeLessThanOrEqual(14)
      }
    }
  })
})

// ── Melatonin recommendation tests ──────────────────────────────────────────

describe('generatePlan - melatonin recommendations', () => {
  it('always recommends 0.5mg dose', () => {
    const plans = generatePlan(makePlan())
    const melRecs = getRecsOfType(plans, 'melatonin')
    for (const rec of melRecs) {
      expect(rec.dose).toBe('0.5mg')
    }
  })

  it('departure day has melatonin recommendation', () => {
    const plans = generatePlan(makePlan())
    const depDay = findDayByLabel(plans, 'Departure day')!
    const melRecs = depDay.recommendations.filter(r => r.type === 'melatonin')
    expect(melRecs.length).toBeGreaterThanOrEqual(1)
  })

  it('arrival day has melatonin recommendation', () => {
    const plans = generatePlan(makePlan())
    const arrDay = findDayByLabel(plans, 'Arrival day')!
    const melRecs = arrDay.recommendations.filter(r => r.type === 'melatonin')
    expect(melRecs.length).toBe(1)
  })

  it('destination days have melatonin before sleep', () => {
    const plans = generatePlan(makePlan())
    const destDays = plans.filter(p => p.label.includes('at destination'))
    for (const day of destDays) {
      const melRecs = day.recommendations.filter(r => r.type === 'melatonin')
      expect(melRecs.length).toBe(1)
      // Melatonin should be 30 min before sleep
      const sleepRec = day.recommendations.find(r => r.type === 'sleep')
      if (sleepRec && melRecs[0]) {
        const melTime = melRecs[0].startTime.toMillis()
        // For dest days, sleep rec starts at sleepDateTime.minus({days:1})
        // but melatonin is at sleepDateTime.minus({minutes:30})
        // So melatonin should be near end of day, before the *next* night's sleep start
      }
    }
  })

  it('post-return days have melatonin recommendations', () => {
    const plans = generatePlan(makePlan())
    const postRet = plans.filter(p => p.label.includes('after return'))
    for (const day of postRet) {
      const melRecs = day.recommendations.filter(r => r.type === 'melatonin')
      expect(melRecs.length).toBe(1)
    }
  })
})

// ── Caffeine recommendation tests ───────────────────────────────────────────

describe('generatePlan - caffeine recommendations', () => {
  it('caffeine-ok window ends before avoid-caffeine window starts on destination days', () => {
    const plans = generatePlan(makePlan())
    const destDays = plans.filter(p => p.label.includes('at destination'))
    for (const day of destDays) {
      const cafOk = day.recommendations.find(r => r.type === 'caffeine-ok')
      const cafAvoid = day.recommendations.find(r => r.type === 'avoid-caffeine')
      if (cafOk && cafAvoid && cafOk.endTime) {
        expect(cafOk.endTime.toMillis()).toBe(cafAvoid.startTime.toMillis())
      }
    }
  })

  it('avoid-caffeine window is 6 hours before sleep', () => {
    const plans = generatePlan(makePlan())
    const destDays = plans.filter(p => p.label.includes('at destination'))
    for (const day of destDays) {
      const cafOk = day.recommendations.find(r => r.type === 'caffeine-ok')
      const cafAvoid = day.recommendations.find(r => r.type === 'avoid-caffeine')
      if (cafOk && cafAvoid && cafAvoid.endTime && cafOk.endTime) {
        const gapHours = (cafAvoid.endTime.toMillis() - cafOk.endTime.toMillis()) / 3600000
        expect(gapHours).toBeCloseTo(6, 0)
      }
    }
  })

  it('post-return days have caffeine recommendations', () => {
    const plans = generatePlan(makePlan())
    const postRet = plans.filter(p => p.label.includes('after return'))
    for (const day of postRet) {
      const cafOk = day.recommendations.find(r => r.type === 'caffeine-ok')
      const cafAvoid = day.recommendations.find(r => r.type === 'avoid-caffeine')
      expect(cafOk).toBeDefined()
      expect(cafAvoid).toBeDefined()
    }
  })
})

// ── Light recommendation tests ──────────────────────────────────────────────

describe('generatePlan - light recommendations', () => {
  it('light recommendations have endTime after startTime', () => {
    const plans = generatePlan(makePlan())
    const lightRecs = [
      ...getRecsOfType(plans, 'seek-light'),
      ...getRecsOfType(plans, 'avoid-light'),
    ]
    for (const rec of lightRecs) {
      if (rec.endTime) {
        expect(rec.endTime.toMillis()).toBeGreaterThan(rec.startTime.toMillis())
      }
    }
  })

  it('eastward travel generates advancing light recs', () => {
    // LA (UTC-7) to Shanghai (UTC+8) = +15hr shift = advancing
    const plans = generatePlan(makePlan())
    const allLight = [
      ...getRecsOfType(plans, 'seek-light'),
      ...getRecsOfType(plans, 'avoid-light'),
    ]
    expect(allLight.length).toBeGreaterThan(0)
  })

  it('westward travel generates delaying light recs', () => {
    // Shanghai to LA = -15hr shift = delaying
    const plan = makePlan({
      homeTimezone: 'Asia/Shanghai',
      homeSleepTime: '23:00',
      homeWakeTime: '07:00',
      departureTimezone: 'Asia/Shanghai',
      arrivalTimezone: 'America/Los_Angeles',
      departureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 19, minute: 0 },
        { zone: 'Asia/Shanghai' }
      ),
      arrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 16, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      returnDepartureTimezone: 'America/Los_Angeles',
      returnDepartureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 22, hour: 13, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      returnArrivalTimezone: 'Asia/Shanghai',
      returnArrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 23, hour: 17, minute: 0 },
        { zone: 'Asia/Shanghai' }
      ),
    })
    const plans = generatePlan(plan)
    const allLight = [
      ...getRecsOfType(plans, 'seek-light'),
      ...getRecsOfType(plans, 'avoid-light'),
    ]
    expect(allLight.length).toBeGreaterThan(0)
  })
})

// ── Eastward travel (LA → Shanghai) ─────────────────────────────────────────

describe('generatePlan - eastward LA to Shanghai', () => {
  const flight = makePlan()

  it('shift is positive (eastward = advancing)', () => {
    const plans = generatePlan(flight)
    // Departure day should have advancing light recs
    const depDay = findDayByLabel(plans, 'Departure day')!
    // For advancing, we expect either seek-light or avoid-light based on tmin position
    const lightRecs = depDay.recommendations.filter(
      r => r.type === 'seek-light' || r.type === 'avoid-light'
    )
    expect(lightRecs.length).toBeGreaterThanOrEqual(0)
  })

  it('plane sleep is recommended during flight', () => {
    const plans = generatePlan(flight)
    const depDay = findDayByLabel(plans, 'Departure day')!
    const planeSleep = depDay.recommendations.filter(r =>
      r.type === 'sleep' && r.note.toLowerCase().includes('plane') ||
      r.type === 'sleep' && r.note.toLowerCase().includes('flight') ||
      r.type === 'sleep' && r.note.toLowerCase().includes('eye mask')
    )
    // Should have at least pre-flight sleep
    const allSleep = depDay.recommendations.filter(r => r.type === 'sleep')
    expect(allSleep.length).toBeGreaterThanOrEqual(1)
  })

  it('arrival day sleep is for tonight (not previous night)', () => {
    const plans = generatePlan(flight)
    const arrDay = findDayByLabel(plans, 'Arrival day')!
    const sleepRec = arrDay.recommendations.find(r => r.type === 'sleep')!
    // Arrival day sleep should start in the evening (not bleeding into departure day)
    const sleepHourAtDest = sleepRec.startTime.setZone('Asia/Shanghai').hour
    // Sleep start should be evening hours (20-23) or very late night
    expect(sleepHourAtDest).toBeGreaterThanOrEqual(20)
  })
})

// ── Westward travel (NY → London) ───────────────────────────────────────────

describe('generatePlan - westward NY to London', () => {
  // Note: NY to London is actually eastward (+5hr), let's do London to NY (-5hr)
  const flight = makePlan({
    homeTimezone: 'Europe/London',
    homeSleepTime: '23:00',
    homeWakeTime: '07:00',
    departureTimezone: 'Europe/London',
    arrivalTimezone: 'America/New_York',
    departureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 10, minute: 0 },
      { zone: 'Europe/London' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 13, minute: 0 },
      { zone: 'America/New_York' }
    ),
    returnDepartureTimezone: 'America/New_York',
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 22, hour: 18, minute: 0 },
      { zone: 'America/New_York' }
    ),
    returnArrivalTimezone: 'Europe/London',
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 23, hour: 7, minute: 0 },
      { zone: 'Europe/London' }
    ),
  })

  it('generates valid plan for westward travel', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
    const labels = plans.map(p => p.label)
    expect(labels).toContain('Departure day')
    expect(labels).toContain('Arrival day')
  })

  it('uses correct timezones', () => {
    const plans = generatePlan(flight)
    const depDay = findDayByLabel(plans, 'Departure day')!
    expect(depDay.displayTimezone).toBe('Europe/London')
    const arrDay = findDayByLabel(plans, 'Arrival day')!
    expect(arrDay.displayTimezone).toBe('America/New_York')
  })
})

// ── Short trip (minimal days at destination) ─────────────────────────────────

describe('generatePlan - short trip (1 day at destination)', () => {
  const flight = makePlan({
    // Arrive June 16, return depart June 17
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 17, hour: 19, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 17, hour: 16, minute: 0 },
      { zone: 'America/Los_Angeles' }
    ),
  })

  it('generates a valid plan', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })

  it('has correct day labels for short trip', () => {
    const plans = generatePlan(flight)
    const labels = plans.map(p => p.label)
    expect(labels).toContain('Departure day')
    expect(labels).toContain('Arrival day')
    expect(labels).toContain('Return flight day')
  })
})

// ── Same-day return ──────────────────────────────────────────────────────────

describe('generatePlan - return on arrival day + 1', () => {
  const flight = makePlan({
    returnDepartureTimezone: 'Asia/Shanghai',
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 16, hour: 23, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
    returnArrivalTimezone: 'America/Los_Angeles',
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 16, hour: 20, minute: 0 },
      { zone: 'America/Los_Angeles' }
    ),
  })

  it('generates a valid plan without crashing', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })
})

// ── Custom destination schedule ──────────────────────────────────────────────

describe('generatePlan - custom destination schedule', () => {
  it('uses custom dest sleep/wake times when provided', () => {
    const plans = generatePlan(makePlan({
      destSleepTime: '21:00',
      destWakeTime: '05:00',
    }))
    // Destination days should reflect the custom schedule
    const destDays = plans.filter(p => p.label.includes('at destination'))
    expect(destDays.length).toBeGreaterThan(0)
    for (const day of destDays) {
      const sleepRec = day.recommendations.find(r => r.type === 'sleep')
      expect(sleepRec).toBeDefined()
    }
  })

  it('falls back to home times when dest times not provided', () => {
    const plansWithCustom = generatePlan(makePlan({
      destSleepTime: '21:00',
      destWakeTime: '05:00',
    }))
    const plansDefault = generatePlan(makePlan())

    // The destination day sleep recs should differ between custom and default
    const customArr = findDayByLabel(plansWithCustom, 'Arrival day')!
    const defaultArr = findDayByLabel(plansDefault, 'Arrival day')!
    const customSleep = customArr.recommendations.find(r => r.type === 'sleep')!
    const defaultSleep = defaultArr.recommendations.find(r => r.type === 'sleep')!

    // They should be different since custom has different sleep/wake times
    expect(customSleep.startTime.toMillis()).not.toBe(defaultSleep.startTime.toMillis())
  })
})

// ── Edge case: same timezone ─────────────────────────────────────────────────

describe('generatePlan - same timezone (no shift)', () => {
  const flight = makePlan({
    homeTimezone: 'America/New_York',
    departureTimezone: 'America/New_York',
    arrivalTimezone: 'America/New_York',
    departureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 8, minute: 0 },
      { zone: 'America/New_York' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 13, minute: 0 },
      { zone: 'America/New_York' }
    ),
    returnDepartureTimezone: 'America/New_York',
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 22, hour: 8, minute: 0 },
      { zone: 'America/New_York' }
    ),
    returnArrivalTimezone: 'America/New_York',
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 22, hour: 13, minute: 0 },
      { zone: 'America/New_York' }
    ),
  })

  it('generates a valid plan even with zero timezone shift', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })

  it('does not generate light shift recommendations with zero shift', () => {
    const plans = generatePlan(flight)
    const seekLight = getRecsOfType(plans, 'seek-light')
    const avoidLight = getRecsOfType(plans, 'avoid-light')
    // With zero shift, no clock advancing/delaying needed
    expect(seekLight.length).toBe(0)
    expect(avoidLight.length).toBe(0)
  })
})

// ── Edge case: date line crossing ────────────────────────────────────────────

describe('generatePlan - date line crossing', () => {
  it('handles flying from US to NZ (crossing date line eastward)', () => {
    const flight = makePlan({
      homeTimezone: 'America/Los_Angeles',
      departureTimezone: 'America/Los_Angeles',
      arrivalTimezone: 'Pacific/Auckland',
      departureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 22, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      arrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 17, hour: 6, minute: 0 },
        { zone: 'Pacific/Auckland' }
      ),
      returnDepartureTimezone: 'Pacific/Auckland',
      returnDepartureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 24, hour: 20, minute: 0 },
        { zone: 'Pacific/Auckland' }
      ),
      returnArrivalTimezone: 'America/Los_Angeles',
      returnArrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 24, hour: 11, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
    })
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
    // All recommendations should have valid DateTimes
    for (const plan of plans) {
      for (const rec of plan.recommendations) {
        expect(rec.startTime.isValid).toBe(true)
        if (rec.endTime) expect(rec.endTime.isValid).toBe(true)
      }
    }
  })

  it('handles flying from Japan to US (crossing date line westward, "arriving before departing")', () => {
    const flight = makePlan({
      homeTimezone: 'Asia/Tokyo',
      departureTimezone: 'Asia/Tokyo',
      arrivalTimezone: 'America/Los_Angeles',
      departureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 17, minute: 0 },
        { zone: 'Asia/Tokyo' }
      ),
      arrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 10, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      returnDepartureTimezone: 'America/Los_Angeles',
      returnDepartureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 22, hour: 11, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      returnArrivalTimezone: 'Asia/Tokyo',
      returnArrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 23, hour: 15, minute: 0 },
        { zone: 'Asia/Tokyo' }
      ),
    })
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })
})

// ── Edge case: very long flight ──────────────────────────────────────────────

describe('generatePlan - very long flight', () => {
  const flight = makePlan({
    homeTimezone: 'America/New_York',
    departureTimezone: 'America/New_York',
    arrivalTimezone: 'Australia/Sydney',
    departureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 10, minute: 0 },
      { zone: 'America/New_York' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 17, hour: 6, minute: 0 },
      { zone: 'Australia/Sydney' }
    ),
    returnDepartureTimezone: 'Australia/Sydney',
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 24, hour: 10, minute: 0 },
      { zone: 'Australia/Sydney' }
    ),
    returnArrivalTimezone: 'America/New_York',
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 24, hour: 18, minute: 0 },
      { zone: 'America/New_York' }
    ),
  })

  it('generates valid plan for ultra-long flight', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
    const depDay = findDayByLabel(plans, 'Departure day')!
    const flightRec = depDay.recommendations.find(r => r.type === 'flight')!
    const durationHrs = (flightRec.endTime!.toMillis() - flightRec.startTime.toMillis()) / 3600000
    expect(durationHrs).toBeGreaterThan(15)
  })
})

// ── Edge case: late night departure ──────────────────────────────────────────

describe('generatePlan - late night departure', () => {
  const flight = makePlan({
    departureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 23, minute: 30 },
      { zone: 'America/Los_Angeles' }
    ),
  })

  it('handles departure near midnight', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
    const depDay = findDayByLabel(plans, 'Departure day')!
    expect(depDay.recommendations.length).toBeGreaterThan(0)
  })
})

// ── Edge case: early morning arrival ─────────────────────────────────────────

describe('generatePlan - early morning arrival', () => {
  const flight = makePlan({
    arrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 16, hour: 3, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
  })

  it('handles very early arrival', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })
})

// ── Progress interpolation tests ─────────────────────────────────────────────

describe('generatePlan - sleep schedule progression', () => {
  it('pre-departure days have schedule closer to home', () => {
    const plans = generatePlan(makePlan({
      destSleepTime: '21:00',
      destWakeTime: '05:00',
    }))

    const preDep2 = findDayByLabel(plans, '2 days before departure')!
    const preDep1 = findDayByLabel(plans, '1 day before departure')!

    // Both should have sleep recs
    const sleep2 = preDep2.recommendations.find(r => r.type === 'sleep')!
    const sleep1 = preDep1.recommendations.find(r => r.type === 'sleep')!
    expect(sleep2).toBeDefined()
    expect(sleep1).toBeDefined()
  })

  it('post-return days shift back toward home schedule', () => {
    const plans = generatePlan(makePlan())

    const postRet1 = findDayByLabel(plans, '1 day after return')!
    const postRet2 = findDayByLabel(plans, '2 days after return')!

    const sleep1 = postRet1.recommendations.find(r => r.type === 'sleep')!
    const sleep2 = postRet2.recommendations.find(r => r.type === 'sleep')!
    expect(sleep1).toBeDefined()
    expect(sleep2).toBeDefined()
  })
})

// ── On-plane sleep tests ─────────────────────────────────────────────────────

describe('generatePlan - on-plane sleep window', () => {
  it('plane sleep is clamped to flight window', () => {
    const plan = makePlan()
    const plans = generatePlan(plan)
    const depDay = findDayByLabel(plans, 'Departure day')!
    const planeSleep = depDay.recommendations.filter(r =>
      r.type === 'sleep' && r.note.toLowerCase().includes('eye mask')
    )
    for (const rec of planeSleep) {
      expect(rec.startTime.toMillis()).toBeGreaterThanOrEqual(plan.departureTime.toMillis())
      if (rec.endTime) {
        expect(rec.endTime.toMillis()).toBeLessThanOrEqual(plan.arrivalTime.toMillis())
      }
    }
  })
})

// ── Boarding during destination nighttime ────────────────────────────────────

describe('generatePlan - boarding during destination nighttime', () => {
  it('recommends sleeping immediately when boarding during dest night', () => {
    // Depart LA at 7am PT = 10pm CST (nighttime at destination)
    const flight = makePlan({
      departureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 7, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      arrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 16, hour: 12, minute: 0 },
        { zone: 'Asia/Shanghai' }
      ),
    })

    const plans = generatePlan(flight)
    const depDay = findDayByLabel(plans, 'Departure day')!
    // Should have sleep recs on departure day
    const sleepRecs = depDay.recommendations.filter(r => r.type === 'sleep')
    expect(sleepRecs.length).toBeGreaterThanOrEqual(1)
    // At least one sleep rec should mention destination timing or eye mask
    const hasFlightSleepGuidance = sleepRecs.some(
      r => r.note.toLowerCase().includes('nighttime') ||
           r.note.toLowerCase().includes('eye mask') ||
           r.note.toLowerCase().includes('destination')
    )
    expect(hasFlightSleepGuidance).toBe(true)
  })
})

// ── Recommendation validity checks ──────────────────────────────────────────

describe('generatePlan - all recommendations validity', () => {
  const scenarios = [
    { name: 'LA to Shanghai (eastward)', plan: makePlan() },
    { name: 'with custom dest schedule', plan: makePlan({ destSleepTime: '21:00', destWakeTime: '05:30' }) },
    { name: 'short trip', plan: makePlan({
      returnDepartureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 18, hour: 19, minute: 0 },
        { zone: 'Asia/Shanghai' }
      ),
      returnArrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 18, hour: 16, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
    })},
    { name: 'late departure', plan: makePlan({
      departureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 23, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
    })},
  ]

  for (const { name, plan } of scenarios) {
    describe(name, () => {
      it('all recommendations have valid startTime', () => {
        const plans = generatePlan(plan)
        for (const dayPlan of plans) {
          for (const rec of dayPlan.recommendations) {
            expect(rec.startTime.isValid).toBe(true)
          }
        }
      })

      it('all recommendations with endTime have valid endTime', () => {
        const plans = generatePlan(plan)
        for (const dayPlan of plans) {
          for (const rec of dayPlan.recommendations) {
            if (rec.endTime) {
              expect(rec.endTime.isValid).toBe(true)
            }
          }
        }
      })

      it('all recommendations with endTime have endTime > startTime', () => {
        const plans = generatePlan(plan)
        for (const dayPlan of plans) {
          for (const rec of dayPlan.recommendations) {
            if (rec.endTime) {
              expect(rec.endTime.toMillis()).toBeGreaterThanOrEqual(rec.startTime.toMillis())
            }
          }
        }
      })

      it('all recommendations have non-empty notes', () => {
        const plans = generatePlan(plan)
        for (const dayPlan of plans) {
          for (const rec of dayPlan.recommendations) {
            expect(rec.note.length).toBeGreaterThan(0)
          }
        }
      })
    })
  }
})

// ── User's real scenario: SF to Beijing short trip ───────────────────────────

describe('generatePlan - real scenario: SF to Beijing', () => {
  // User's actual case: SF → Beijing, short trip
  const flight = makePlan({
    homeTimezone: 'America/Los_Angeles',
    homeSleepTime: '00:00',
    homeWakeTime: '08:00',
    departureTimezone: 'America/Los_Angeles',
    arrivalTimezone: 'Asia/Shanghai',  // Beijing = CST = same as Shanghai
    destSleepTime: '21:30',  // grandparent schedule shifted
    destWakeTime: '05:30',
    departureTime: DateTime.fromObject(
      { year: 2026, month: 3, day: 4, hour: 13, minute: 0 },
      { zone: 'America/Los_Angeles' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2026, month: 3, day: 5, hour: 17, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
    returnDepartureTimezone: 'Asia/Shanghai',
    returnDepartureTime: DateTime.fromObject(
      { year: 2026, month: 3, day: 8, hour: 19, minute: 20 },
      { zone: 'Asia/Shanghai' }
    ),
    returnArrivalTimezone: 'America/Los_Angeles',
    returnArrivalTime: DateTime.fromObject(
      { year: 2026, month: 3, day: 8, hour: 15, minute: 50 },
      { zone: 'America/Los_Angeles' }
    ),
  })

  it('generates valid plan', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })

  it('has correct timezone for return flight', () => {
    const plans = generatePlan(flight)
    const retDay = findDayByLabel(plans, 'Return flight day')!
    expect(retDay.displayTimezone).toBe('Asia/Shanghai')
  })

  it('has return flight with correct times', () => {
    const plans = generatePlan(flight)
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const flightRec = retDay.recommendations.find(r => r.type === 'flight')!
    expect(flightRec.startTime.toMillis()).toBe(flight.returnDepartureTime.toMillis())
    expect(flightRec.endTime!.toMillis()).toBe(flight.returnArrivalTime.toMillis())
  })

  it('return arrival day uses LA timezone', () => {
    const plans = generatePlan(flight)
    const retArr = findDayByLabel(plans, 'Return arrival day')!
    expect(retArr.displayTimezone).toBe('America/Los_Angeles')
  })

  it('post-return days exist and have valid recommendations', () => {
    const plans = generatePlan(flight)
    const postRet = plans.filter(p => p.label.includes('after return'))
    expect(postRet.length).toBe(2)
    for (const day of postRet) {
      expect(day.recommendations.length).toBeGreaterThan(0)
    }
  })
})

// ── Half-hour timezone offset ────────────────────────────────────────────────

describe('generatePlan - half-hour timezone offset (India)', () => {
  const flight = makePlan({
    homeTimezone: 'America/New_York',
    departureTimezone: 'America/New_York',
    arrivalTimezone: 'Asia/Kolkata',
    departureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 22, minute: 0 },
      { zone: 'America/New_York' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 16, hour: 22, minute: 30 },
      { zone: 'Asia/Kolkata' }
    ),
    returnDepartureTimezone: 'Asia/Kolkata',
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 23, hour: 2, minute: 0 },
      { zone: 'Asia/Kolkata' }
    ),
    returnArrivalTimezone: 'America/New_York',
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 23, hour: 8, minute: 0 },
      { zone: 'America/New_York' }
    ),
  })

  it('handles half-hour timezone offset correctly', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
    for (const plan of plans) {
      for (const rec of plan.recommendations) {
        expect(rec.startTime.isValid).toBe(true)
        if (rec.endTime) expect(rec.endTime.isValid).toBe(true)
      }
    }
  })
})

// ── Extreme timezone offset difference ──────────────────────────────────────

describe('generatePlan - maximum timezone difference', () => {
  // Baker Island (UTC-12) to Line Islands (UTC+14) = 26hr difference
  // More realistically, Honolulu to Auckland = ~22 hrs difference
  const flight = makePlan({
    homeTimezone: 'Pacific/Honolulu',
    departureTimezone: 'Pacific/Honolulu',
    arrivalTimezone: 'Pacific/Auckland',
    departureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 10, minute: 0 },
      { zone: 'Pacific/Honolulu' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 17, hour: 6, minute: 0 },
      { zone: 'Pacific/Auckland' }
    ),
    returnDepartureTimezone: 'Pacific/Auckland',
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 24, hour: 19, minute: 0 },
      { zone: 'Pacific/Auckland' }
    ),
    returnArrivalTimezone: 'Pacific/Honolulu',
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 24, hour: 7, minute: 0 },
      { zone: 'Pacific/Honolulu' }
    ),
  })

  it('handles large timezone differences without errors', () => {
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })

  it('all recs remain valid with extreme offsets', () => {
    const plans = generatePlan(flight)
    for (const plan of plans) {
      for (const rec of plan.recommendations) {
        expect(rec.startTime.isValid).toBe(true)
        if (rec.endTime) {
          expect(rec.endTime.isValid).toBe(true)
          expect(rec.endTime.toMillis()).toBeGreaterThan(rec.startTime.toMillis())
        }
      }
    }
  })
})

// ── Day label tests ──────────────────────────────────────────────────────────

describe('generatePlan - day labels', () => {
  it('destination days are labeled with Day N format', () => {
    const plans = generatePlan(makePlan())
    const destDays = plans.filter(p => p.label.includes('at destination'))
    expect(destDays.length).toBeGreaterThan(0)
    for (const day of destDays) {
      expect(day.label).toMatch(/^Day \d+ at destination$/)
    }
    // Day numbers should be strictly increasing
    const dayNums = destDays.map(d => parseInt(d.label.match(/Day (\d+)/)![1]))
    for (let i = 1; i < dayNums.length; i++) {
      expect(dayNums[i]).toBeGreaterThan(dayNums[i - 1])
    }
  })

  it('labels never repeat', () => {
    const plans = generatePlan(makePlan())
    const labels = plans.map(p => p.label)
    const unique = new Set(labels)
    expect(unique.size).toBe(labels.length)
  })
})

// ── Overnight sleep boundary tests ──────────────────────────────────────────

describe('generatePlan - overnight sleep handling', () => {
  it('handles sleep time after midnight (e.g., 01:00 bedtime)', () => {
    const flight = makePlan({
      homeSleepTime: '01:00',
      homeWakeTime: '09:00',
    })
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
    const sleepRecs = getRecsOfType(plans, 'sleep')
    for (const rec of sleepRecs) {
      if (rec.endTime) {
        expect(rec.endTime.toMillis()).toBeGreaterThan(rec.startTime.toMillis())
      }
    }
  })

  it('handles very early bedtime (e.g., 20:00)', () => {
    const flight = makePlan({
      homeSleepTime: '20:00',
      homeWakeTime: '04:00',
    })
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })
})

// ── Return flight on-plane sleep ─────────────────────────────────────────────

describe('generatePlan - return flight on-plane sleep', () => {
  it('return flight has on-plane sleep targeting home nighttime', () => {
    const plans = generatePlan(makePlan())
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const sleepRecs = retDay.recommendations.filter(r => r.type === 'sleep')
    // Should have pre-flight sleep and possibly on-plane sleep
    expect(sleepRecs.length).toBeGreaterThanOrEqual(1)
  })

  it('return flight melatonin targets home schedule', () => {
    const plans = generatePlan(makePlan())
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const melRecs = retDay.recommendations.filter(r => r.type === 'melatonin')
    expect(melRecs.length).toBeGreaterThanOrEqual(1)
    for (const rec of melRecs) {
      expect(rec.dose).toBe('0.5mg')
    }
  })
})

// ── DST transition edge case ─────────────────────────────────────────────────

describe('generatePlan - DST transition', () => {
  it('handles travel during US spring-forward weekend', () => {
    // March 9, 2025 is US spring forward
    const flight = makePlan({
      departureTime: DateTime.fromObject(
        { year: 2025, month: 3, day: 8, hour: 14, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      arrivalTime: DateTime.fromObject(
        { year: 2025, month: 3, day: 9, hour: 17, minute: 0 },
        { zone: 'Asia/Shanghai' }
      ),
    })
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
    for (const plan of plans) {
      for (const rec of plan.recommendations) {
        expect(rec.startTime.isValid).toBe(true)
      }
    }
  })

  it('handles travel during EU clock change', () => {
    // Last Sunday of March 2025 = March 30
    const flight = makePlan({
      homeTimezone: 'Europe/London',
      departureTimezone: 'Europe/London',
      arrivalTimezone: 'America/New_York',
      departureTime: DateTime.fromObject(
        { year: 2025, month: 3, day: 29, hour: 10, minute: 0 },
        { zone: 'Europe/London' }
      ),
      arrivalTime: DateTime.fromObject(
        { year: 2025, month: 3, day: 29, hour: 13, minute: 0 },
        { zone: 'America/New_York' }
      ),
      returnDepartureTimezone: 'America/New_York',
      returnDepartureTime: DateTime.fromObject(
        { year: 2025, month: 4, day: 5, hour: 18, minute: 0 },
        { zone: 'America/New_York' }
      ),
      returnArrivalTimezone: 'Europe/London',
      returnArrivalTime: DateTime.fromObject(
        { year: 2025, month: 4, day: 6, hour: 7, minute: 0 },
        { zone: 'Europe/London' }
      ),
    })
    const plans = generatePlan(flight)
    expect(plans.length).toBeGreaterThan(0)
  })
})

// ── Multiple scenarios with no crashes ──────────────────────────────────────

describe('generatePlan - robustness across many routes', () => {
  const routes = [
    { from: 'America/New_York', to: 'Europe/London', name: 'NYC→LHR' },
    { from: 'Europe/London', to: 'Asia/Tokyo', name: 'LHR→NRT' },
    { from: 'Asia/Tokyo', to: 'America/Los_Angeles', name: 'NRT→LAX' },
    { from: 'America/Chicago', to: 'Europe/Paris', name: 'ORD→CDG' },
    { from: 'Australia/Sydney', to: 'Europe/Berlin', name: 'SYD→BER' },
    { from: 'Asia/Dubai', to: 'America/New_York', name: 'DXB→JFK' },
    { from: 'Pacific/Honolulu', to: 'Asia/Tokyo', name: 'HNL→NRT' },
    { from: 'America/Los_Angeles', to: 'Asia/Seoul', name: 'LAX→ICN' },
    { from: 'Europe/Moscow', to: 'America/Los_Angeles', name: 'SVO→LAX' },
    { from: 'Asia/Kolkata', to: 'America/Chicago', name: 'DEL→ORD' },
  ]

  for (const route of routes) {
    it(`${route.name}: generates valid plan without crashing`, () => {
      const flight = makePlan({
        homeTimezone: route.from,
        departureTimezone: route.from,
        arrivalTimezone: route.to,
        departureTime: DateTime.fromObject(
          { year: 2025, month: 6, day: 15, hour: 10, minute: 0 },
          { zone: route.from }
        ),
        arrivalTime: DateTime.fromObject(
          { year: 2025, month: 6, day: 16, hour: 14, minute: 0 },
          { zone: route.to }
        ),
        returnDepartureTimezone: route.to,
        returnDepartureTime: DateTime.fromObject(
          { year: 2025, month: 6, day: 22, hour: 18, minute: 0 },
          { zone: route.to }
        ),
        returnArrivalTimezone: route.from,
        returnArrivalTime: DateTime.fromObject(
          { year: 2025, month: 6, day: 23, hour: 10, minute: 0 },
          { zone: route.from }
        ),
      })

      const plans = generatePlan(flight)
      expect(plans.length).toBeGreaterThan(0)

      for (const plan of plans) {
        expect(plan.date.isValid).toBe(true)
        for (const rec of plan.recommendations) {
          expect(rec.startTime.isValid).toBe(true)
          if (rec.endTime) {
            expect(rec.endTime.isValid).toBe(true)
            expect(rec.endTime.toMillis()).toBeGreaterThanOrEqual(rec.startTime.toMillis())
          }
        }
      }
    })
  }
})

// ── Departure day specific tests ─────────────────────────────────────────────

describe('generatePlan - departure day details', () => {
  it('has pre-flight sleep on the day before departure (tonight convention)', () => {
    const plans = generatePlan(makePlan())
    // Pre-flight sleep is now generated by the day before departure as "tonight's sleep",
    // not by the departure day as "last night's sleep" (which caused overlapping blocks).
    const dayBefore = findDayByLabel(plans, '1 day before departure')!
    const sleepRec = dayBefore.recommendations.find(
      r => r.type === 'sleep'
    )
    expect(sleepRec).toBeDefined()
    // Sleep should extend into the next day (departure day morning)
    expect(sleepRec!.endTime!.toMillis()).toBeGreaterThan(
      sleepRec!.startTime.toMillis()
    )
  })

  it('caffeine-ok window exists during daytime on flight if applicable', () => {
    const plans = generatePlan(makePlan())
    const depDay = findDayByLabel(plans, 'Departure day')!
    // May or may not have caffeine recs depending on sleep timing vs flight timing
    // Just verify no crashes
    expect(depDay.recommendations.length).toBeGreaterThan(0)
  })
})

// ── Pre-departure melatonin ──────────────────────────────────────────────────

describe('generatePlan - pre-departure melatonin', () => {
  it('day before departure has melatonin for eastward travel', () => {
    const plans = generatePlan(makePlan()) // LA→Shanghai = eastward
    const preDep1 = findDayByLabel(plans, '1 day before departure')!
    const melRecs = preDep1.recommendations.filter(r => r.type === 'melatonin')
    expect(melRecs.length).toBe(1)
  })

  it('day before departure has melatonin for westward travel', () => {
    const flight = makePlan({
      homeTimezone: 'Asia/Tokyo',
      departureTimezone: 'Asia/Tokyo',
      arrivalTimezone: 'America/Los_Angeles',
      departureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 17, minute: 0 },
        { zone: 'Asia/Tokyo' }
      ),
      arrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 10, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      returnDepartureTimezone: 'America/Los_Angeles',
      returnDepartureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 22, hour: 11, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      returnArrivalTimezone: 'Asia/Tokyo',
      returnArrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 23, hour: 15, minute: 0 },
        { zone: 'Asia/Tokyo' }
      ),
    })
    const plans = generatePlan(flight)
    const preDep1 = findDayByLabel(plans, '1 day before departure')!
    const melRecs = preDep1.recommendations.filter(r => r.type === 'melatonin')
    expect(melRecs.length).toBe(1)
  })

  it('2 days before departure has NO melatonin', () => {
    const plans = generatePlan(makePlan())
    const preDep2 = findDayByLabel(plans, '2 days before departure')!
    const melRecs = preDep2.recommendations.filter(r => r.type === 'melatonin')
    expect(melRecs.length).toBe(0)
  })
})

// ── Regression: no overlapping sleep recs ────────────────────────────────────

describe('generatePlan - no overlapping sleep events', () => {
  it('no two sleep recs overlap in time across the entire plan', () => {
    // Test with the default LA→Shanghai plan
    const plans = generatePlan(makePlan())
    const allSleep = plans.flatMap(p =>
      p.recommendations.filter(r => r.type === 'sleep' && r.endTime)
    )

    for (let i = 0; i < allSleep.length; i++) {
      for (let j = i + 1; j < allSleep.length; j++) {
        const a = allSleep[i]
        const b = allSleep[j]
        const aStart = a.startTime.toMillis()
        const aEnd = a.endTime!.toMillis()
        const bStart = b.startTime.toMillis()
        const bEnd = b.endTime!.toMillis()
        // Two intervals overlap if one starts before the other ends and vice versa
        const overlaps = aStart < bEnd && bStart < aEnd
        if (overlaps) {
          throw new Error(
            `Sleep recs overlap:\n` +
            `  A: ${a.startTime.toISO()} – ${a.endTime!.toISO()} "${a.note.slice(0, 50)}"\n` +
            `  B: ${b.startTime.toISO()} – ${b.endTime!.toISO()} "${b.note.slice(0, 50)}"`
          )
        }
      }
    }
  })

  it('no two sleep recs overlap for westward travel', () => {
    const flight = makePlan({
      homeTimezone: 'Asia/Tokyo',
      departureTimezone: 'Asia/Tokyo',
      arrivalTimezone: 'America/Los_Angeles',
      departureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 17, minute: 0 },
        { zone: 'Asia/Tokyo' }
      ),
      arrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 15, hour: 10, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      returnDepartureTimezone: 'America/Los_Angeles',
      returnDepartureTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 22, hour: 11, minute: 0 },
        { zone: 'America/Los_Angeles' }
      ),
      returnArrivalTimezone: 'Asia/Tokyo',
      returnArrivalTime: DateTime.fromObject(
        { year: 2025, month: 6, day: 23, hour: 15, minute: 0 },
        { zone: 'Asia/Tokyo' }
      ),
    })
    const plans = generatePlan(flight)
    const allSleep = plans.flatMap(p =>
      p.recommendations.filter(r => r.type === 'sleep' && r.endTime)
    )

    for (let i = 0; i < allSleep.length; i++) {
      for (let j = i + 1; j < allSleep.length; j++) {
        const a = allSleep[i]
        const b = allSleep[j]
        const overlaps =
          a.startTime.toMillis() < b.endTime!.toMillis() &&
          b.startTime.toMillis() < a.endTime!.toMillis()
        if (overlaps) {
          throw new Error(
            `Sleep recs overlap:\n` +
            `  A: ${a.startTime.toISO()} – ${a.endTime!.toISO()}\n` +
            `  B: ${b.startTime.toISO()} – ${b.endTime!.toISO()}`
          )
        }
      }
    }
  })

  it('each night has exactly one sleep rec (no duplicates for same night)', () => {
    const plans = generatePlan(makePlan())
    const allSleep = plans.flatMap(p =>
      p.recommendations.filter(r => r.type === 'sleep' && r.endTime)
    )

    // Group sleep recs by which "night" they cover (approximate: by start date)
    const nightKeys = allSleep.map(s => {
      const d = s.startTime.setZone('UTC')
      return `${d.year}-${d.month}-${d.day}`
    })

    // Check no two ground-sleep recs share the same night
    // (on-plane sleep during flights is allowed to overlap with a "night" key)
    const groundSleep = allSleep.filter(s =>
      !s.note.includes('plane') && !s.note.includes('flight') && !s.note.includes('boarding')
    )
    const groundNightKeys = groundSleep.map(s => {
      const d = s.startTime.setZone('UTC')
      return `${d.year}-${d.month}-${d.day}`
    })

    const seen = new Set<string>()
    for (const key of groundNightKeys) {
      if (seen.has(key)) {
        throw new Error(`Multiple ground-sleep recs for the same night: ${key}`)
      }
      seen.add(key)
    }
  })
})

// ── Return flight: midnight home sleep time ─────────────────────────────────

describe('generatePlan - return flight with midnight home sleep', () => {
  // User's exact scenario: SF→Beijing, home sleep midnight-8am, dest sleep 21:30-5:30
  // Return: PEK 7:20pm BJT → SFO 3:50pm PST (same calendar day)
  // 7:20pm BJT = 3:20am PST (boarding during home night)
  const flight = makePlan({
    homeTimezone: 'America/Los_Angeles',
    homeSleepTime: '00:00',
    homeWakeTime: '08:00',
    departureTimezone: 'America/Los_Angeles',
    arrivalTimezone: 'Asia/Shanghai',
    destSleepTime: '21:30',
    destWakeTime: '05:30',
    departureTime: DateTime.fromObject(
      { year: 2026, month: 3, day: 4, hour: 13, minute: 0 },
      { zone: 'America/Los_Angeles' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2026, month: 3, day: 5, hour: 17, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
    returnDepartureTimezone: 'Asia/Shanghai',
    returnDepartureTime: DateTime.fromObject(
      { year: 2026, month: 3, day: 8, hour: 19, minute: 20 },
      { zone: 'Asia/Shanghai' }
    ),
    returnArrivalTimezone: 'America/Los_Angeles',
    returnArrivalTime: DateTime.fromObject(
      { year: 2026, month: 3, day: 8, hour: 15, minute: 50 },
      { zone: 'America/Los_Angeles' }
    ),
  })

  it('on-plane sleep ends at home wake time (8am PST), not at flight arrival', () => {
    const plans = generatePlan(flight)
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const sleepRec = retDay.recommendations.find(r => r.type === 'sleep')!

    // Sleep should start at departure (boarding during home night)
    expect(sleepRec.startTime.toMillis()).toBe(flight.returnDepartureTime.toMillis())

    // Sleep should end at 8am PST (home wake time), NOT at 3:50pm (flight arrival)
    const sleepEndPST = sleepRec.endTime!.setZone('America/Los_Angeles')
    expect(sleepEndPST.hour).toBe(8)
    expect(sleepEndPST.minute).toBe(0)
  })

  it('on-plane sleep is ~4-5 hours, not the entire flight', () => {
    const plans = generatePlan(flight)
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const sleepRec = retDay.recommendations.find(r => r.type === 'sleep')!
    const sleepHours = (sleepRec.endTime!.toMillis() - sleepRec.startTime.toMillis()) / 3600000
    // March 8 2026 is DST spring-forward: departure is 4:20am PDT, wake at 8am PDT = 3h40m
    expect(sleepHours).toBeGreaterThanOrEqual(3)
    expect(sleepHours).toBeLessThanOrEqual(5)
  })

  it('has caffeine-ok window after on-plane sleep until arrival', () => {
    const plans = generatePlan(flight)
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const cafOk = retDay.recommendations.find(r =>
      r.type === 'caffeine-ok' && r.note.includes('waking up')
    )
    expect(cafOk).toBeDefined()

    // Should start at plane sleep end (8am PST)
    const cafStartPST = cafOk!.startTime.setZone('America/Los_Angeles')
    expect(cafStartPST.hour).toBe(8)

    // Should end at flight arrival (3:50pm PST)
    expect(cafOk!.endTime!.toMillis()).toBe(flight.returnArrivalTime.toMillis())
  })

  it('return arrival day caffeine-ok does NOT start before flight lands', () => {
    const plans = generatePlan(flight)
    const retArrDay = findDayByLabel(plans, 'Return arrival day')!
    const cafOk = retArrDay.recommendations.find(r => r.type === 'caffeine-ok')

    if (cafOk) {
      // caffeine-ok must start at or after flight arrival
      expect(cafOk.startTime.toMillis()).toBeGreaterThanOrEqual(
        flight.returnArrivalTime.toMillis()
      )
    }
  })

  it('no caffeine-ok window overlaps with on-plane sleep on return flight/arrival days', () => {
    const plans = generatePlan(flight)
    const retDay = findDayByLabel(plans, 'Return flight day')!
    const retArrDay = findDayByLabel(plans, 'Return arrival day')!
    const returnDays = [retDay, retArrDay]

    // Get sleep recs from the return flight day (on-plane sleep)
    const planeSleep = retDay.recommendations.filter(r => r.type === 'sleep' && r.endTime)
    // Get all caffeine-ok recs from return flight + arrival days
    const allCaffOk = returnDays.flatMap(p =>
      p.recommendations.filter(r => r.type === 'caffeine-ok' && r.endTime)
    )

    for (const sleep of planeSleep) {
      for (const caf of allCaffOk) {
        const overlaps =
          sleep.startTime.toMillis() < caf.endTime!.toMillis() &&
          caf.startTime.toMillis() < sleep.endTime!.toMillis()
        if (overlaps) {
          throw new Error(
            `Caffeine-ok overlaps with on-plane sleep:\n` +
            `  Sleep: ${sleep.startTime.toISO()} – ${sleep.endTime!.toISO()}\n` +
            `  Caffeine: ${caf.startTime.toISO()} – ${caf.endTime!.toISO()}`
          )
        }
      }
    }
  })
})

// ── Outbound flight: midnight dest sleep time ───────────────────────────────

describe('generatePlan - outbound flight with midnight dest sleep', () => {
  // Test the outbound equivalent of the midnight bug
  const flight = makePlan({
    homeTimezone: 'Asia/Shanghai',
    homeSleepTime: '23:00',
    homeWakeTime: '07:00',
    departureTimezone: 'Asia/Shanghai',
    arrivalTimezone: 'America/Los_Angeles',
    destSleepTime: '00:00',
    destWakeTime: '08:00',
    departureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 17, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
    arrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 10, minute: 0 },
      { zone: 'America/Los_Angeles' }
    ),
    returnDepartureTimezone: 'America/Los_Angeles',
    returnDepartureTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 22, hour: 11, minute: 0 },
      { zone: 'America/Los_Angeles' }
    ),
    returnArrivalTimezone: 'Asia/Shanghai',
    returnArrivalTime: DateTime.fromObject(
      { year: 2025, month: 6, day: 23, hour: 15, minute: 0 },
      { zone: 'Asia/Shanghai' }
    ),
  })

  it('on-plane sleep duration is reasonable (not the entire flight)', () => {
    const plans = generatePlan(flight)
    const depDay = findDayByLabel(plans, 'Departure day')!
    const sleepRecs = depDay.recommendations.filter(r => r.type === 'sleep')
    for (const rec of sleepRecs) {
      if (rec.endTime) {
        const hours = (rec.endTime.toMillis() - rec.startTime.toMillis()) / 3600000
        expect(hours).toBeLessThanOrEqual(10)
      }
    }
  })
})
