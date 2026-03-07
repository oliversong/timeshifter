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
    returnDepartureTimezone: plan.returnDepartureTimezone,
    returnDepartureTime: plan.returnDepartureTime.toISO() ?? '',
    returnArrivalTimezone: plan.returnArrivalTimezone,
    returnArrivalTime: plan.returnArrivalTime.toISO() ?? '',
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

  if (view === 'results' && plans && currentPlan) {
    return (
      <PlanTimeline
        plans={plans}
        homeTimezone={currentPlan.homeTimezone}
        destTimezone={currentPlan.arrivalTimezone}
        onEditFlight={() => setView('form')}
        sidebarInfo={{
          from: currentPlan.departureTimezone,
          to: currentPlan.arrivalTimezone,
          outboundLabel: `${currentPlan.departureTime.toFormat('EEE MMM d, h:mm a')} → ${currentPlan.arrivalTime.setZone(currentPlan.arrivalTimezone).toFormat('EEE MMM d, h:mm a')}`,
          returnLabel: `${currentPlan.returnDepartureTime.setZone(currentPlan.returnDepartureTimezone).toFormat('EEE MMM d, h:mm a')} → ${currentPlan.returnArrivalTime.setZone(currentPlan.returnArrivalTimezone).toFormat('EEE MMM d, h:mm a')}`,
          destSchedule: (currentPlan.destSleepTime || currentPlan.destWakeTime)
            ? `sleep ${currentPlan.destSleepTime ?? currentPlan.homeSleepTime} / wake ${currentPlan.destWakeTime ?? currentPlan.homeWakeTime}`
            : undefined,
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-800 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-white tracking-tight">Timeshifter</h1>
          <p className="text-xs text-slate-400">Free jetlag planner — no account needed</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
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
