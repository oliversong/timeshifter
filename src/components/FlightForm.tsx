import { useState } from 'react'
import { DateTime } from 'luxon'
import type { FlightPlan, FlightPlanDates } from '../types'
import { TimezoneSelect } from './TimezoneSelect'

interface Props {
  initialPlan: FlightPlan | null
  onSubmit: (plan: FlightPlanDates) => void
}

const DEFAULT_PLAN: FlightPlan = {
  homeTimezone: 'America/Los_Angeles',
  homeSleepTime: '23:00',
  homeWakeTime: '07:00',
  departureTimezone: 'America/Los_Angeles',
  arrivalTimezone: 'Asia/Shanghai',
  localScheduleTimezone: '',
  departureTime: '',
  arrivalTime: '',
  daysAtDestination: 7,
}

function toLocalDatetimeValue(iso: string, tz: string): string {
  if (!iso) return ''
  const dt = DateTime.fromISO(iso).setZone(tz)
  if (!dt.isValid) return ''
  return dt.toFormat("yyyy-MM-dd'T'HH:mm")
}

export function FlightForm({ initialPlan, onSubmit }: Props) {
  const init = initialPlan ?? DEFAULT_PLAN

  const [homeTimezone, setHomeTimezone] = useState(init.homeTimezone)
  const [homeSleepTime, setHomeSleepTime] = useState(init.homeSleepTime)
  const [homeWakeTime, setHomeWakeTime] = useState(init.homeWakeTime)
  const [departureTimezone, setDepartureTimezone] = useState(init.departureTimezone)
  const [arrivalTimezone, setArrivalTimezone] = useState(init.arrivalTimezone)
  const [localScheduleTimezone, setLocalScheduleTimezone] = useState(init.localScheduleTimezone ?? '')
  const [showCustomTz, setShowCustomTz] = useState(!!init.localScheduleTimezone)

  // Store local datetime strings for inputs, interpret in their respective timezones
  const [departureLocal, setDepartureLocal] = useState(
    init.departureTime ? toLocalDatetimeValue(init.departureTime, init.departureTimezone) : ''
  )
  const [arrivalLocal, setArrivalLocal] = useState(
    init.arrivalTime ? toLocalDatetimeValue(init.arrivalTime, init.arrivalTimezone) : ''
  )
  const [daysAtDestination, setDaysAtDestination] = useState(init.daysAtDestination)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!departureLocal || !arrivalLocal) {
      setError('Please enter departure and arrival times.')
      return
    }

    const departureTime = DateTime.fromISO(departureLocal, { zone: departureTimezone })
    const arrivalTime = DateTime.fromISO(arrivalLocal, { zone: arrivalTimezone })

    if (!departureTime.isValid || !arrivalTime.isValid) {
      setError('Invalid departure or arrival time.')
      return
    }

    if (arrivalTime <= departureTime) {
      setError('Arrival time must be after departure time.')
      return
    }

    if (daysAtDestination < 1 || daysAtDestination > 60) {
      setError('Days at destination must be between 1 and 60.')
      return
    }

    onSubmit({
      homeTimezone,
      homeSleepTime,
      homeWakeTime,
      departureTimezone,
      arrivalTimezone,
      localScheduleTimezone: showCustomTz && localScheduleTimezone ? localScheduleTimezone : undefined,
      departureTime,
      arrivalTime,
      daysAtDestination,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Home schedule */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
          Your Home Schedule
        </h2>
        <TimezoneSelect
          label="Home Timezone"
          value={homeTimezone}
          onChange={setHomeTimezone}
        />
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">Usual Bedtime</label>
            <input
              type="time"
              value={homeSleepTime}
              onChange={e => setHomeSleepTime(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">Usual Wake Time</label>
            <input
              type="time"
              value={homeWakeTime}
              onChange={e => setHomeWakeTime(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </section>

      {/* Flight details */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
          Flight Details
        </h2>
        <div className="space-y-3">
          <TimezoneSelect
            label="Departure Airport Timezone"
            value={departureTimezone}
            onChange={setDepartureTimezone}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">Departure Date & Time</label>
            <input
              type="datetime-local"
              value={departureLocal}
              onChange={e => setDepartureLocal(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {departureLocal && (
              <p className="text-xs text-slate-400">
                Local time in {departureTimezone}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <TimezoneSelect
            label="Arrival Airport Timezone"
            value={arrivalTimezone}
            onChange={setArrivalTimezone}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">Arrival Date & Time</label>
            <input
              type="datetime-local"
              value={arrivalLocal}
              onChange={e => setArrivalLocal(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {arrivalLocal && (
              <p className="text-xs text-slate-400">
                Local time in {arrivalTimezone}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-300">Days at Destination</label>
          <input
            type="number"
            min={1}
            max={60}
            value={daysAtDestination}
            onChange={e => setDaysAtDestination(Number(e.target.value))}
            className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-32"
          />
        </div>
      </section>

      {/* Custom locale timezone */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setShowCustomTz(v => !v)}
          className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <span className="text-lg leading-none">{showCustomTz ? '▾' : '▸'}</span>
          Custom Local Schedule Timezone
          <span className="text-xs text-slate-500 font-normal">(optional)</span>
        </button>

        {showCustomTz && (
          <div className="pl-4 border-l-2 border-slate-700 space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Use this if you'll be keeping a different schedule than the local timezone.
              For example, visiting family who sleep on a different schedule, or working
              remotely on a home-country schedule.
            </p>
            <TimezoneSelect
              label="Local Schedule Timezone"
              value={localScheduleTimezone}
              onChange={setLocalScheduleTimezone}
            />
          </div>
        )}
      </section>

      {error && (
        <div className="px-4 py-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
      >
        Generate My Plan
      </button>
    </form>
  )
}
