import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { getAllTimezones, getUtcOffset, formatTime, formatDate } from './timezone'

describe('getAllTimezones', () => {
  it('returns a non-empty array of timezone strings', () => {
    const tzs = getAllTimezones()
    expect(Array.isArray(tzs)).toBe(true)
    expect(tzs.length).toBeGreaterThan(0)
  })

  it('includes common timezones', () => {
    const tzs = getAllTimezones()
    expect(tzs).toContain('America/New_York')
    expect(tzs).toContain('Europe/London')
    expect(tzs).toContain('Asia/Tokyo')
    expect(tzs).toContain('Australia/Sydney')
  })

  it('returns valid IANA timezone identifiers', () => {
    const tzs = getAllTimezones()
    for (const tz of tzs.slice(0, 20)) {
      const dt = DateTime.now().setZone(tz)
      expect(dt.isValid).toBe(true)
    }
  })
})

describe('getUtcOffset', () => {
  it('returns UTC+0 for UTC', () => {
    expect(getUtcOffset('UTC')).toBe('UTC+0')
  })

  it('formats positive whole-hour offsets', () => {
    // Asia/Tokyo is always UTC+9 (no DST)
    const offset = getUtcOffset('Asia/Tokyo')
    expect(offset).toBe('UTC+9')
  })

  it('formats negative whole-hour offsets without DST ambiguity', () => {
    // Use a fixed-offset zone to avoid DST issues
    // Pacific/Honolulu is always UTC-10
    const offset = getUtcOffset('Pacific/Honolulu')
    expect(offset).toBe('UTC-10')
  })

  it('formats half-hour offsets correctly', () => {
    // Asia/Kolkata is always UTC+5:30
    const offset = getUtcOffset('Asia/Kolkata')
    expect(offset).toBe('UTC+5:30')
  })

  it('formats 45-minute offsets correctly', () => {
    // Asia/Kathmandu is always UTC+5:45
    const offset = getUtcOffset('Asia/Kathmandu')
    expect(offset).toBe('UTC+5:45')
  })

  it('handles negative half-hour offset', () => {
    // America/St_Johns is UTC-3:30 (standard) or UTC-2:30 (DST)
    const offset = getUtcOffset('America/St_Johns')
    expect(offset).toMatch(/^UTC-[23]:30$/)
  })
})

describe('formatTime', () => {
  it('formats time in 12-hour format with AM/PM', () => {
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 14, minute: 30 },
      { zone: 'UTC' }
    )
    expect(formatTime(dt, 'UTC')).toBe('2:30 PM')
  })

  it('formats midnight correctly', () => {
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 0, minute: 0 },
      { zone: 'UTC' }
    )
    expect(formatTime(dt, 'UTC')).toBe('12:00 AM')
  })

  it('formats noon correctly', () => {
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 12, minute: 0 },
      { zone: 'UTC' }
    )
    expect(formatTime(dt, 'UTC')).toBe('12:00 PM')
  })

  it('converts between timezones when formatting', () => {
    // 2pm UTC = 10pm in Asia/Shanghai (UTC+8)
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 14, minute: 0 },
      { zone: 'UTC' }
    )
    expect(formatTime(dt, 'Asia/Shanghai')).toBe('10:00 PM')
  })

  it('handles cross-midnight timezone conversion', () => {
    // 11pm UTC = 7am next day in Asia/Shanghai (UTC+8)
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 23, minute: 0 },
      { zone: 'UTC' }
    )
    expect(formatTime(dt, 'Asia/Shanghai')).toBe('7:00 AM')
  })

  it('handles cross-midnight going backwards', () => {
    // 2am UTC = 7pm previous day in America/Los_Angeles (UTC-7 in June DST)
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 2, minute: 0 },
      { zone: 'UTC' }
    )
    expect(formatTime(dt, 'America/Los_Angeles')).toBe('7:00 PM')
  })
})

describe('formatDate', () => {
  it('formats date with day of week and month', () => {
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 10 },
      { zone: 'UTC' }
    )
    expect(formatDate(dt, 'UTC')).toBe('Sun, Jun 15')
  })

  it('shows correct date when timezone shifts the day', () => {
    // June 15 at 11pm UTC = June 16 in Asia/Shanghai
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 23, minute: 0 },
      { zone: 'UTC' }
    )
    expect(formatDate(dt, 'Asia/Shanghai')).toBe('Mon, Jun 16')
  })

  it('shows correct date when timezone shifts day backwards', () => {
    // June 15 at 2am UTC = June 14 in America/Los_Angeles (UTC-7 in June)
    const dt = DateTime.fromObject(
      { year: 2025, month: 6, day: 15, hour: 2, minute: 0 },
      { zone: 'UTC' }
    )
    expect(formatDate(dt, 'America/Los_Angeles')).toBe('Sat, Jun 14')
  })
})
