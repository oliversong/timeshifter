import { useState } from 'react'
import type { Recommendation } from '../types'
import { formatTime } from '../lib/timezone'

const TYPE_CONFIG = {
  'sleep': {
    icon: '🌙',
    label: 'Sleep',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
  },
  'wake': {
    icon: '☀️',
    label: 'Wake',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
  },
  'melatonin': {
    icon: '💊',
    label: 'Melatonin',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
  },
  'seek-light': {
    icon: '☀️',
    label: 'Seek Light',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
  },
  'avoid-light': {
    icon: '🕶️',
    label: 'Avoid Light',
    bg: 'bg-stone-100',
    border: 'border-stone-200',
    text: 'text-stone-600',
  },
  'caffeine-ok': {
    icon: '☕',
    label: 'Caffeine OK',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
  },
  'avoid-caffeine': {
    icon: '🚫',
    label: 'No Caffeine',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
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
              <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">
                {rec.dose}
              </span>
            )}
          </div>
          <div className="text-xs text-stone-500 mt-0.5">
            {startStr}{endStr ? ` – ${endStr}` : ''}
            {startSecondary && (
              <span className="text-stone-400 ml-1.5">
                ({startSecondary}{endSecondary ? ` – ${endSecondary}` : ''} home)
              </span>
            )}
          </div>
        </div>
        <span className="text-stone-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <p className="mt-2 text-xs text-stone-600 leading-relaxed border-t border-stone-200 pt-2">
          {rec.note}
        </p>
      )}
    </button>
  )
}
