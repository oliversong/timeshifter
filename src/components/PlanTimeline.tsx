import { useState, useMemo } from 'react'
import type { DayPlan, Recommendation, RecommendationType } from '../types'
import { getUtcOffset, formatTime } from '../lib/timezone'

interface Props {
  plans: DayPlan[]
  homeTimezone: string
  destTimezone: string
  localScheduleTimezone?: string
}

type TzView = 'dest' | 'home'

// ── Constants ──────────────────────────────────────────────────────────────
const PX_PER_HR   = 22   // compact but readable
const TIME_COL_W  = 30   // px width of time-label gutter
const COL_HDR_H   = 30   // px height of sticky column header
const DAY_LBL_H   = 26   // px height of sticky day label

// Day/night gradient applied to each 24-hr section
// Night (10pm–6am) = darkest; Day (8am–8pm) = lighter
const NIGHT = '#0b1220'
const DAWN  = '#111b30'
const DAY   = '#192640'
const GRADIENT = [
  `${NIGHT} 0%`,
  `${NIGHT} 25%`,   // 6 am
  `${DAWN}  28.5%`, // 6:50 am
  `${DAY}   33%`,   // 8 am
  `${DAY}   79%`,   // 7 pm
  `${DAWN}  84%`,   // 8 pm
  `${NIGHT} 91.5%`, // 10 pm
  `${NIGHT} 100%`,
].join(', ')

// ── Block colour meta ──────────────────────────────────────────────────────
const META: Record<RecommendationType, {
  fill: string; stroke: string; text: string; label: string
}> = {
  sleep:           { fill: '#1a3460', stroke: '#5b8def', text: '#bfdbfe', label: 'Sleep'       },
  wake:            { fill: '#3a2200', stroke: '#e09a30', text: '#fed7aa', label: 'Wake'        },
  melatonin:       { fill: '#2b1052', stroke: '#b07ef8', text: '#ede0ff', label: 'Melatonin'  },
  'seek-light':    { fill: '#3b2800', stroke: '#f0aa30', text: '#fef3c7', label: 'Seek Light'  },
  'avoid-light':   { fill: '#1e2535', stroke: '#5e7490', text: '#c8d8e8', label: 'Avoid Light' },
  'caffeine-ok':   { fill: '#0e2e1a', stroke: '#36c97e', text: '#a7f3d0', label: 'Caffeine OK' },
  'avoid-caffeine':{ fill: '#2e1010', stroke: '#e06060', text: '#fecaca', label: 'No Caffeine' },
  flight:          { fill: '#0b1e34', stroke: '#38bdf8', text: '#bae6fd', label: 'Flight'      },
}

// ── Columns ────────────────────────────────────────────────────────────────
const COLUMNS: { key: string; label: string; types: RecommendationType[] }[] = [
  { key: 'sleep',    label: 'Sleep',    types: ['sleep', 'wake'] },
  { key: 'light',    label: 'Light',    types: ['seek-light', 'avoid-light'] },
  { key: 'caffeine', label: 'Caffeine', types: ['caffeine-ok', 'avoid-caffeine'] },
  { key: 'flight',   label: 'Flight ✈', types: ['flight'] },
]

// ── Helpers ────────────────────────────────────────────────────────────────
const DAY_MS = 24 * 3_600_000

function fmtHour(h: number): string {
  if (h === 0)  return '12a'
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

function fmtDur(startMs: number, endMs: number): string {
  const mins = Math.round((endMs - startMs) / 60_000)
  if (mins <= 0) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ── Component ──────────────────────────────────────────────────────────────
export function PlanTimeline({ plans, homeTimezone, destTimezone, localScheduleTimezone }: Props) {
  const [tzView,   setTzView]   = useState<TzView>('dest')
  const [selected, setSelected] = useState<Recommendation | null>(null)

  const displayTz   = tzView === 'home' ? homeTimezone : destTimezone
  const secondaryTz = displayTz !== homeTimezone ? homeTimezone : undefined

  const tzOptions: { key: TzView; label: string; tz: string }[] = [
    { key: 'dest', label: 'Destination', tz: destTimezone },
    { key: 'home', label: 'Home',        tz: homeTimezone },
    ...(localScheduleTimezone
      ? [{ key: 'local' as TzView, label: 'Local', tz: localScheduleTimezone }]
      : []),
  ]

  // Legend rows (without melatonin — shown separately in sleep col)
  const legendItems = useMemo(
    () => (Object.entries(META) as [RecommendationType, typeof META[RecommendationType]][])
           .filter(([t]) => t !== 'melatonin'),
    []
  )

  function pick(rec: Recommendation) {
    setSelected(s => s === rec ? null : rec)
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const sidebar = (
    <div className="space-y-3" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* TZ toggle */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 space-y-1.5">
        <p className="text-slate-500 uppercase tracking-widest font-semibold" style={{ fontSize: 9 }}>
          Display timezone
        </p>
        {tzOptions.map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => { setTzView(opt.key as TzView); setSelected(null) }}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors ${
              tzView === opt.key
                ? 'bg-indigo-800/60 border border-indigo-600/40 text-indigo-200'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            }`}
            style={{ fontSize: 11, fontWeight: 500 }}
          >
            {opt.label}
            <span className="block opacity-50" style={{ fontFamily: "'DM Mono', monospace", fontSize: 9 }}>
              {getUtcOffset(opt.tz)}
            </span>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 space-y-1.5">
        <p className="text-slate-500 uppercase tracking-widest font-semibold" style={{ fontSize: 9 }}>
          Legend
        </p>
        {legendItems.map(([, m]) => (
          <div key={m.label} className="flex items-center gap-1.5">
            <div style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              backgroundColor: m.fill, border: `1.5px solid ${m.stroke}`,
            }} />
            <span className="text-slate-400" style={{ fontSize: 10, lineHeight: 1 }}>{m.label}</span>
          </div>
        ))}
        {/* Melatonin pill */}
        <div className="flex items-center gap-1.5">
          <div style={{
            width: 10, height: 10, borderRadius: 99, flexShrink: 0,
            backgroundColor: META.melatonin.stroke,
          }} />
          <span className="text-slate-400" style={{ fontSize: 10, lineHeight: 1 }}>Melatonin 💊</span>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (() => {
        const m = META[selected.type]
        return (
          <div
            className="rounded-xl border p-3 space-y-2"
            style={{ backgroundColor: m.fill + 'cc', borderColor: m.stroke + '55' }}
          >
            <div className="flex items-start justify-between">
              <span className="font-semibold" style={{ color: m.text, fontSize: 12 }}>
                {m.label}
                {selected.dose && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px]"
                    style={{ background: m.stroke + '30', color: m.text }}>
                    {selected.dose}
                  </span>
                )}
              </span>
              <button type="button" onClick={() => setSelected(null)}
                className="text-slate-500 hover:text-white text-xs">✕</button>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#94a3b8' }}>
              {formatTime(selected.startTime, displayTz)}
              {selected.endTime && ` – ${formatTime(selected.endTime, displayTz)}`}
              {secondaryTz && (
                <div className="text-slate-600 mt-0.5">
                  {formatTime(selected.startTime, secondaryTz)}
                  {selected.endTime && ` – ${formatTime(selected.endTime, secondaryTz)}`}
                  {' '}home
                </div>
              )}
            </div>
            <p className="text-slate-300 leading-relaxed" style={{ fontSize: 10 }}>
              {selected.note}
            </p>
          </div>
        )
      })()}
    </div>
  )

  // ── Timeline ──────────────────────────────────────────────────────────────
  return (
    <div
      className="flex gap-3 items-start"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Sticky sidebar (desktop) */}
      <aside className="hidden sm:block w-40 shrink-0 sticky top-3 max-h-[90vh] overflow-y-auto">
        {sidebar}
      </aside>

      {/* Mobile controls (stacked above timeline) */}
      <div className="flex-1 sm:hidden mb-3 space-y-2">{sidebar}</div>

      {/* ── Scrollable timeline ── */}
      <div
        className="flex-1 min-w-0 rounded-xl border border-slate-700/50"
        style={{ maxHeight: '78vh', overflowY: 'auto', overflowX: 'hidden' }}
      >
        {/* Sticky column header */}
        <div
          className="sticky top-0 z-30 flex items-stretch border-b border-slate-700/40"
          style={{ height: COL_HDR_H, backgroundColor: '#0c1424', backdropFilter: 'blur(8px)' }}
        >
          {/* Time gutter */}
          <div className="shrink-0 border-r border-slate-700/20" style={{ width: TIME_COL_W }} />
          {COLUMNS.map((col, ci) => (
            <div
              key={col.key}
              className={`flex-1 flex items-center justify-center ${ci < COLUMNS.length - 1 ? 'border-r border-slate-700/20' : ''}`}
            >
              <span className="text-slate-400 uppercase tracking-widest font-semibold" style={{ fontSize: 8 }}>
                {col.label}
              </span>
            </div>
          ))}
        </div>

        {/* Day sections */}
        {plans.map((plan, dayIdx) => {
          const dayDate    = plan.date.setZone(displayTz)
          const dayStartMs = plan.date.toMillis()

          return (
            <div key={dayIdx}>
              {/* Sticky day label — pins just below column header */}
              <div
                className="sticky z-20 flex items-center gap-2 px-3 border-b border-t border-slate-700/30"
                style={{
                  top:             COL_HDR_H,
                  height:          DAY_LBL_H,
                  backgroundColor: '#0f1c30ee',
                  backdropFilter:  'blur(6px)',
                }}
              >
                <span className="font-bold text-slate-200" style={{ fontSize: 11 }}>
                  {dayDate.toFormat('EEE, MMM d')}
                </span>
                <span className="text-slate-500" style={{ fontSize: 10 }}>{plan.label}</span>
              </div>

              {/* 24-hour content grid */}
              <div
                className="relative flex"
                style={{
                  height:     24 * PX_PER_HR,
                  background: `linear-gradient(to bottom, ${GRADIENT})`,
                }}
              >
                {/* Time label gutter */}
                <div
                  className="shrink-0 relative border-r border-slate-700/20"
                  style={{ width: TIME_COL_W }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      className="absolute right-1 flex items-center justify-end"
                      style={{ top: h * PX_PER_HR - 5, height: PX_PER_HR }}
                    >
                      <span
                        className={h % 3 === 0 ? 'text-slate-400' : 'text-slate-700'}
                        style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, lineHeight: 1 }}
                      >
                        {fmtHour(h)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Activity columns */}
                {COLUMNS.map((col, ci) => {
                  const colRecs = plan.recommendations.filter(r =>
                    (col.types as string[]).includes(r.type)
                  )
                  const melRecs = col.key === 'sleep'
                    ? plan.recommendations.filter(r => r.type === 'melatonin')
                    : []

                  return (
                    <div
                      key={col.key}
                      className={`flex-1 relative ${ci < COLUMNS.length - 1 ? 'border-r border-slate-700/15' : ''}`}
                    >
                      {/* Hour grid lines — every hour visible */}
                      {Array.from({ length: 25 }, (_, h) => (
                        <div
                          key={h}
                          style={{
                            position:   'absolute',
                            left: 0, right: 0,
                            top:        h * PX_PER_HR,
                            height:     1,
                            background: h % 6 === 0
                              ? 'rgba(255,255,255,0.07)'
                              : h % 3 === 0
                              ? 'rgba(255,255,255,0.04)'
                              : 'rgba(255,255,255,0.02)',
                          }}
                        />
                      ))}

                      {/* Recommendation blocks */}
                      {colRecs.map((rec, ri) => {
                        const m    = META[rec.type]
                        const isHl = selected === rec

                        let startMs = rec.startTime.toMillis() - dayStartMs
                        const endMs = (rec.endTime ?? rec.startTime.plus({ minutes: 30 })).toMillis() - dayStartMs

                        startMs = Math.max(0, Math.min(startMs, DAY_MS))
                        const cEnd = Math.max(0, Math.min(endMs, DAY_MS))
                        if (cEnd <= startMs) return null

                        const top    = (startMs / 3_600_000) * PX_PER_HR
                        const height = Math.max(4, (cEnd - startMs) / 3_600_000 * PX_PER_HR)

                        const dur = rec.endTime
                          ? fmtDur(rec.startTime.toMillis(), rec.endTime.toMillis())
                          : ''

                        return (
                          <button
                            key={ri}
                            type="button"
                            onClick={() => pick(rec)}
                            className="absolute focus:outline-none"
                            style={{
                              top:             top + 1,
                              left:            2,
                              right:           2,
                              height:          height - 2,
                              backgroundColor: m.fill,
                              border:          `1px solid ${isHl ? '#fff6' : m.stroke + 'cc'}`,
                              borderRadius:    4,
                              overflow:        'hidden',
                              boxShadow:       isHl ? `0 0 0 2px ${m.stroke}` : 'none',
                              zIndex:          isHl ? 10 : 2,
                              cursor:          'pointer',
                              transition:      'box-shadow 0.1s',
                            }}
                            title={`${m.label}${dur ? ' · ' + dur : ''}: ${formatTime(rec.startTime, displayTz)}${rec.endTime ? ' – ' + formatTime(rec.endTime, displayTz) : ''}`}
                          >
                            {/* Duration + label */}
                            {height >= 16 && (
                              <span style={{
                                position:      'absolute',
                                top:           2,
                                left:          4,
                                fontSize:      8,
                                fontWeight:    700,
                                color:         m.text,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                whiteSpace:    'nowrap',
                                lineHeight:    1,
                              }}>
                                {height >= 28 && dur ? `${m.label} · ${dur}` : dur || m.label}
                              </span>
                            )}
                          </button>
                        )
                      })}

                      {/* Melatonin markers in sleep column */}
                      {melRecs.map((rec, ri) => {
                        const isHl = selected === rec
                        const melMs = rec.startTime.toMillis() - dayStartMs
                        if (melMs < 0 || melMs > DAY_MS) return null
                        const top = (melMs / 3_600_000) * PX_PER_HR

                        return (
                          <button
                            key={`mel-${ri}`}
                            type="button"
                            onClick={() => pick(rec)}
                            className="absolute focus:outline-none"
                            style={{
                              top:             top - 8,
                              left:            2,
                              right:           2,
                              height:          16,
                              backgroundColor: '#220f45',
                              border:          `1px solid ${isHl ? '#fff' : '#b07ef870'}`,
                              borderRadius:    4,
                              display:         'flex',
                              alignItems:      'center',
                              gap:             3,
                              paddingLeft:     4,
                              zIndex:          8,
                              cursor:          'pointer',
                              boxShadow:       `0 0 8px #9333ea35`,
                            }}
                            title={`Melatonin${rec.dose ? ' · ' + rec.dose : ''}: ${formatTime(rec.startTime, displayTz)}`}
                          >
                            <span style={{ fontSize: 9 }}>💊</span>
                            {rec.dose && (
                              <span style={{ fontSize: 8, color: '#e9d5ff', fontWeight: 600 }}>
                                {rec.dose}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
