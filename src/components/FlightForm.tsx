import { useState } from 'react'
import DatePicker from 'react-datepicker'
import { DateTime } from 'luxon'
import type { FlightPlan, FlightPlanDates } from '../types'
import { TimezoneSelect } from './TimezoneSelect'
import 'react-datepicker/dist/react-datepicker.css'


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
  destSleepTime: '',
  destWakeTime: '',
  departureTime: '',
  arrivalTime: '',
  daysAtDestination: 7,
}

/** Parse "HH:mm" time string into a JS Date (today's date, local clock) */
function timeStringToDate(time: string): Date | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

/** Format a JS Date back to "HH:mm" */
function dateToTimeString(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Convert an ISO string to a JS Date representing the wall-clock time in tz */
function isoToLocalDate(iso: string, tz: string): Date | null {
  if (!iso) return null
  const dt = DateTime.fromISO(iso).setZone(tz)
  if (!dt.isValid) return null
  // Create a JS Date whose local clock matches the wall-clock time in tz
  return new Date(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute)
}

export function FlightForm({ initialPlan, onSubmit }: Props) {
  const init = initialPlan ?? DEFAULT_PLAN

  const [homeTimezone, setHomeTimezone] = useState(init.homeTimezone)
  const [homeSleepDate, setHomeSleepDate] = useState<Date | null>(
    timeStringToDate(init.homeSleepTime)
  )
  const [homeWakeDate, setHomeWakeDate] = useState<Date | null>(
    timeStringToDate(init.homeWakeTime)
  )
  const [departureTimezone, setDepartureTimezone] = useState(init.departureTimezone)
  const [arrivalTimezone, setArrivalTimezone] = useState(init.arrivalTimezone)
  const [destSleepTime, setDestSleepTime] = useState(init.destSleepTime ?? '')
  const [destWakeTime, setDestWakeTime] = useState(init.destWakeTime ?? '')
  const [showCustomSchedule, setShowCustomSchedule] = useState(!!(init.destSleepTime || init.destWakeTime))

  const [departureDate, setDepartureDate] = useState<Date | null>(
    init.departureTime ? isoToLocalDate(init.departureTime, init.departureTimezone) : null
  )
  const [arrivalDate, setArrivalDate] = useState<Date | null>(
    init.arrivalTime ? isoToLocalDate(init.arrivalTime, init.arrivalTimezone) : null
  )
  const [daysAtDestination, setDaysAtDestination] = useState(init.daysAtDestination)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!departureDate || !arrivalDate) {
      setError('Please select departure and arrival times.')
      return
    }

    // Interpret the JS Date wall-clock values as times in the respective timezones
    const departureTime = DateTime.fromObject(
      {
        year: departureDate.getFullYear(),
        month: departureDate.getMonth() + 1,
        day: departureDate.getDate(),
        hour: departureDate.getHours(),
        minute: departureDate.getMinutes(),
      },
      { zone: departureTimezone }
    )

    const arrivalTime = DateTime.fromObject(
      {
        year: arrivalDate.getFullYear(),
        month: arrivalDate.getMonth() + 1,
        day: arrivalDate.getDate(),
        hour: arrivalDate.getHours(),
        minute: arrivalDate.getMinutes(),
      },
      { zone: arrivalTimezone }
    )

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
      homeSleepTime: homeSleepDate ? dateToTimeString(homeSleepDate) : '23:00',
      homeWakeTime: homeWakeDate ? dateToTimeString(homeWakeDate) : '07:00',
      departureTimezone,
      arrivalTimezone,
      destSleepTime: showCustomSchedule && destSleepTime ? destSleepTime : undefined,
      destWakeTime: showCustomSchedule && destWakeTime ? destWakeTime : undefined,
      departureTime,
      arrivalTime,
      daysAtDestination,
    })
  }

  const pickerClass =
    'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Home schedule */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-800 border-b border-stone-200 pb-2">
          Your Home Schedule
        </h2>
        <TimezoneSelect
          label="Home Timezone"
          value={homeTimezone}
          onChange={setHomeTimezone}
        />
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-stone-600">Usual Bedtime</label>
            <DatePicker
              selected={homeSleepDate}
              onChange={setHomeSleepDate}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption="Time"
              dateFormat="h:mm aa"
              placeholderText="Select time"
              className={pickerClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-stone-600">Usual Wake Time</label>
            <DatePicker
              selected={homeWakeDate}
              onChange={setHomeWakeDate}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption="Time"
              dateFormat="h:mm aa"
              placeholderText="Select time"
              className={pickerClass}
            />
          </div>
        </div>
      </section>

      {/* Flight details */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-800 border-b border-stone-200 pb-2">
          Flight Details
        </h2>
        <div className="space-y-3">
          <TimezoneSelect
            label="Departure Airport Timezone"
            value={departureTimezone}
            onChange={setDepartureTimezone}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-stone-600">Departure Date & Time</label>
            <DatePicker
              selected={departureDate}
              onChange={setDepartureDate}
              showTimeSelect
              timeIntervals={5}
              timeCaption="Time"
              dateFormat="MMM d, yyyy  h:mm aa"
              placeholderText="Select date & time"
              className={pickerClass}
            />
            {departureDate && (
              <p className="text-xs text-stone-400">Local time in {departureTimezone}</p>
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
            <label className="text-sm font-medium text-stone-600">Arrival Date & Time</label>
            <DatePicker
              selected={arrivalDate}
              onChange={setArrivalDate}
              showTimeSelect
              timeIntervals={5}
              timeCaption="Time"
              dateFormat="MMM d, yyyy  h:mm aa"
              placeholderText="Select date & time"
              className={pickerClass}
            />
            {arrivalDate && (
              <p className="text-xs text-stone-400">Local time in {arrivalTimezone}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-stone-600">Days at Destination</label>
          <input
            type="number"
            min={1}
            max={60}
            value={daysAtDestination}
            onChange={e => setDaysAtDestination(Number(e.target.value))}
            className="px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-32"
          />
        </div>
      </section>

      {/* Custom destination schedule */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setShowCustomSchedule(v => !v)}
          className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 transition-colors"
        >
          <span className="text-lg leading-none">{showCustomSchedule ? '▾' : '▸'}</span>
          Custom Destination Sleep Schedule
          <span className="text-xs text-stone-400 font-normal">(optional)</span>
        </button>

        {showCustomSchedule && (
          <div className="pl-4 border-l-2 border-stone-200 space-y-3">
            <p className="text-xs text-stone-400 leading-relaxed">
              Use this if you'll be keeping a different sleep schedule than your home routine.
              For example, if you normally sleep at midnight but plan to sleep at 10pm at your destination.
              Leave blank to default to your home sleep times.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-stone-600">Destination Bedtime</label>
                <input
                  type="time"
                  value={destSleepTime}
                  onChange={e => setDestSleepTime(e.target.value)}
                  className="px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-stone-600">Destination Wake Time</label>
                <input
                  type="time"
                  value={destWakeTime}
                  onChange={e => setDestWakeTime(e.target.value)}
                  className="px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full py-3 px-6 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-stone-50"
      >
        Generate My Plan
      </button>
    </form>
  )
}
