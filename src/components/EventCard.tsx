import { useState } from 'react'
import type { Recommendation } from '../types'
import { formatTime } from '../lib/timezone'

const TYPE_CONFIG = {
  'sleep': {
    icon: '🌙',
    label: 'Sleep',
    bg: 'bg-indigo-950',
    border: 'border-indigo-700',
    text: 'text-indigo-300',
  },
  'wake': {
    icon: '☀️',
    label: 'Wake',
    bg: 'bg-amber-950',
    border: 'border-amber-700',
    text: 'text-amber-300',
  },
  'melatonin': {
    icon: '💊',
    label: 'Melatonin',
    bg: 'bg-purple-950',
    border: 'border-purple-700',
    text: 'text-purple-300',
  },
  'seek-light': {
    icon: '☀️',
    label: 'Seek Light',
    bg: 'bg-yellow-950',
    border: 'border-yellow-600',
    text: 'text-yellow-300',
  },
  'avoid-light': {
    icon: '🕶️',
    label: 'Avoid Light',
    bg: 'bg-slate-800',
    border: 'border-slate-600',
    text: 'text-slate-300',
  },
  'caffeine-ok': {
    icon: '☕',
    label: 'Caffeine OK',
    bg: 'bg-green-950',
    border: 'border-green-700',
    text: 'text-green-300',
  },
  'avoid-caffeine': {
    icon: '🚫',
    label: 'No Caffeine',
    bg: 'bg-red-950',
    border: 'border-red-800',
    text: 'text-red-300',
  },
  'flight': {
    icon: '✈️',
    label: 'Flight',
    bg: 'bg-sky-950',
    border: 'border-sky-800',
    text: 'text-sky-300',
  },
} as const

interface Props {
  rec: Recommendation
  displayTimezone: string
  secondaryTimezone?: string
}

export function EventCard({ rec, displayTimezone, secondaryTimezone }: Props) {
  const [expanded, setExpanded] = useState(false)
  const cfg = TYPE_CONFIG[rec.type]

  const startStr = formatTime(rec.startTime, displayTimezone)
  const endStr = rec.endTime ? formatTime(rec.endTime, displayTimezone) : null

  const startSecondary = secondaryTimezone ? formatTime(rec.startTime, secondaryTimezone) : null
  const endSecondary = secondaryTimezone && rec.endTime ? formatTime(rec.endTime, secondaryTimezone) : null

  return (
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${cfg.bg} ${cfg.border} hover:brightness-110`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
            {rec.dose && (
              <span className="text-xs bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded">
                {rec.dose}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {startStr}{endStr ? ` – ${endStr}` : ''}
            {startSecondary && (
              <span className="text-slate-500 ml-1.5">
                ({startSecondary}{endSecondary ? ` – ${endSecondary}` : ''} home)
              </span>
            )}
          </div>
        </div>
        <span className="text-slate-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <p className="mt-2 text-xs text-slate-300 leading-relaxed border-t border-slate-700 pt-2">
          {rec.note}
        </p>
      )}
    </button>
  )
}
