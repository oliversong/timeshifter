import { useState } from 'react'
import type { DayPlan, Recommendation, RecommendationType } from '../types'
import { EventCard } from './EventCard'
import { formatDate, getUtcOffset } from '../lib/timezone'

interface Props {
  plans: DayPlan[]
  homeTimezone: string
  destTimezone: string
}

type TzView = 'dest' | 'home'

const TIMELINE_COLORS: Record<RecommendationType, string> = {
  'sleep': 'bg-indigo-800',
  'wake': 'bg-amber-500',
  'melatonin': 'bg-purple-600',
  'seek-light': 'bg-yellow-400',
  'avoid-light': 'bg-slate-600',
  'caffeine-ok': 'bg-green-700',
  'avoid-caffeine': 'bg-red-800',
}

function TimelineBar({ recommendations, displayTimezone }: { recommendations: Recommendation[], displayTimezone: string }) {
  // Render a 24-hour bar with colored blocks
  const dayStart = recommendations[0]?.startTime.setZone(displayTimezone).startOf('day')
  if (!dayStart) return <div className="h-6 bg-slate-800 rounded" />

  const dayStartMs = dayStart.toMillis()
  const dayMs = 24 * 3600 * 1000

  return (
    <div className="relative h-6 bg-slate-800 rounded overflow-hidden">
      {recommendations.map((rec, i) => {
        const start = rec.startTime.setZone(displayTimezone)
        const end = rec.endTime ? rec.endTime.setZone(displayTimezone) : start.plus({ minutes: 30 })

        // Position relative to start of day in display tz
        let startMs = start.toMillis() - dayStartMs
        let endMs = end.toMillis() - dayStartMs

        // Clamp to day bounds
        startMs = Math.max(0, Math.min(startMs, dayMs))
        endMs = Math.max(0, Math.min(endMs, dayMs))
        if (endMs <= startMs) return null

        const left = (startMs / dayMs) * 100
        const width = ((endMs - startMs) / dayMs) * 100

        return (
          <div
            key={i}
            className={`absolute h-full ${TIMELINE_COLORS[rec.type]} opacity-80`}
            style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
            title={`${rec.type}: ${start.toFormat('h:mm a')}${rec.endTime ? ` – ${end.toFormat('h:mm a')}` : ''}`}
          />
        )
      })}
      {/* Hour markers */}
      {[6, 12, 18].map(h => (
        <div
          key={h}
          className="absolute h-full w-px bg-slate-600/50"
          style={{ left: `${(h / 24) * 100}%` }}
        />
      ))}
    </div>
  )
}

export function PlanTimeline({ plans, homeTimezone, destTimezone }: Props) {
  const [tzView, setTzView] = useState<TzView>('dest')
  const [expandedDay, setExpandedDay] = useState<number>(
    // Auto-expand arrival day (index 3)
    Math.min(3, plans.length - 1)
  )

  const displayTz = tzView === 'home' ? homeTimezone : destTimezone

  const secondaryTz = tzView !== 'home' ? homeTimezone : undefined

  const tzOptions: { key: TzView; label: string; tz: string }[] = [
    { key: 'dest', label: 'Destination', tz: destTimezone },
    { key: 'home', label: 'Home', tz: homeTimezone },
  ]

  return (
    <div className="space-y-4">
      {/* Timezone toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-400">Display times in:</span>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {tzOptions.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTzView(opt.key)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                tzView === opt.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
              <span className="ml-1 text-slate-400 text-xs">{getUtcOffset(opt.tz)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(TIMELINE_COLORS) as [RecommendationType, string][]).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${color}`} />
            <span className="text-xs text-slate-400 capitalize">{type.replace('-', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Day cards */}
      <div className="space-y-2">
        {plans.map((plan, i) => {
          const isExpanded = expandedDay === i
          const dateStr = formatDate(plan.date, displayTz)

          return (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedDay(isExpanded ? -1 : i)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-semibold text-white">{plan.label}</span>
                    <span className="text-xs text-slate-400">{dateStr}</span>
                  </div>
                  <TimelineBar
                    recommendations={plan.recommendations}
                    displayTimezone={displayTz}
                  />
                </div>
                <span className="text-slate-500 text-sm ml-2">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2 border-t border-slate-700 pt-3">
                  {plan.recommendations.length === 0 ? (
                    <p className="text-slate-400 text-sm">No specific recommendations for this day.</p>
                  ) : (
                    plan.recommendations.map((rec, j) => (
                      <EventCard
                        key={j}
                        rec={rec}
                        displayTimezone={displayTz}
                        secondaryTimezone={secondaryTz}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
