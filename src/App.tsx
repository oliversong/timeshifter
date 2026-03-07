import { useState } from 'react'
import type { FlightPlan, FlightPlanDates, DayPlan } from './types'
import { generatePlan } from './lib/circadian'
import { savePlan, loadPlan } from './lib/storage'
import { FlightForm } from './components/FlightForm'
import { PlanTimeline } from './components/PlanTimeline'

function planToStorable(plan: FlightPlanDates): FlightPlan {
  return {
    homeTimezone: plan.homeTimezone,
    homeSleepTime: plan.homeSleepTime,
    homeWakeTime: plan.homeWakeTime,
    departureTimezone: plan.departureTimezone,
    arrivalTimezone: plan.arrivalTimezone,
    destSleepTime: plan.destSleepTime,
    destWakeTime: plan.destWakeTime,
    departureTime: plan.departureTime.toISO() ?? '',
    arrivalTime: plan.arrivalTime.toISO() ?? '',
    daysAtDestination: plan.daysAtDestination,
  }
}

export default function App() {
  const [savedPlan] = useState<FlightPlan | null>(loadPlan)
  const [plans, setPlans] = useState<DayPlan[] | null>(null)
  const [currentPlan, setCurrentPlan] = useState<FlightPlanDates | null>(null)
  const [view, setView] = useState<'form' | 'results'>('form')

  function handleSubmit(plan: FlightPlanDates) {
    const dayPlans = generatePlan(plan)
    setPlans(dayPlans)
    setCurrentPlan(plan)
    savePlan(planToStorable(plan))
    setView('results')
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Timeshifter
            </h1>
            <p className="text-xs text-slate-400">Free jetlag planner — no account needed</p>
          </div>
          {view === 'results' && (
            <button
              type="button"
              onClick={() => setView('form')}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Edit flight
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {view === 'form' ? (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-slate-300 text-sm leading-relaxed">
                Get a personalized schedule for melatonin, light exposure, and sleep
                to minimize jetlag — based on real chronobiology.
              </p>
              <div className="flex flex-wrap justify-center gap-3 text-xs text-slate-500">
                <span>Free &amp; open source</span>
                <span>·</span>
                <span>No account</span>
                <span>·</span>
                <span>0.5mg melatonin (science-backed dose)</span>
                <span>·</span>
                <span>Custom destination schedule</span>
              </div>
            </div>
            <FlightForm initialPlan={savedPlan} onSubmit={handleSubmit} />
          </div>
        ) : plans && currentPlan ? (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-xl p-4 text-sm space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>From</span>
                <span className="font-medium text-white">{currentPlan.departureTimezone}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>To</span>
                <span className="font-medium text-white">{currentPlan.arrivalTimezone}</span>
              </div>
              {(currentPlan.destSleepTime || currentPlan.destWakeTime) && (
                <div className="flex justify-between text-slate-300">
                  <span>Destination schedule</span>
                  <span className="font-medium text-indigo-300">
                    sleep {currentPlan.destSleepTime ?? currentPlan.homeSleepTime} / wake {currentPlan.destWakeTime ?? currentPlan.homeWakeTime}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-300">
                <span>Flight</span>
                <span className="font-medium text-white">
                  {currentPlan.departureTime.toFormat('EEE MMM d, h:mm a')} →{' '}
                  {currentPlan.arrivalTime.setZone(currentPlan.arrivalTimezone).toFormat('EEE MMM d, h:mm a')}
                </span>
              </div>
            </div>

            <PlanTimeline
              plans={plans}
              homeTimezone={currentPlan.homeTimezone}
              destTimezone={currentPlan.arrivalTimezone}
            />
          </div>
        ) : null}
      </main>

      <footer className="mt-12 border-t border-slate-800 px-4 py-6">
        <div className="max-w-2xl mx-auto text-center text-xs text-slate-500 space-y-1">
          <p>Based on established chronobiology research. Not medical advice.</p>
          <p>Melatonin at 0.5mg is more effective for clock-shifting than 3mg doses.</p>
          <p className="text-slate-600">Open source · localStorage only · No tracking</p>
        </div>
      </footer>
    </div>
  )
}
