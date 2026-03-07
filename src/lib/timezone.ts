import { DateTime } from 'luxon'

export function getAllTimezones(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Intl as any).supportedValuesOf('timeZone') as string[]
  } catch {
    // Fallback for older environments
    return [
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
      'Europe/Berlin', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok',
      'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
    ]
  }
}

export function getUtcOffset(timezone: string): string {
  const dt = DateTime.now().setZone(timezone)
  const offset = dt.offset  // minutes
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const hours = Math.floor(abs / 60)
  const mins = abs % 60
  if (mins === 0) return `UTC${sign}${hours}`
  return `UTC${sign}${hours}:${String(mins).padStart(2, '0')}`
}

export function formatTime(dt: DateTime, timezone: string): string {
  return dt.setZone(timezone).toFormat('h:mm a')
}

export function formatDate(dt: DateTime, timezone: string): string {
  return dt.setZone(timezone).toFormat('EEE, MMM d')
}
