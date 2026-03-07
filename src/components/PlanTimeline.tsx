import { useState, useMemo } from 'react'
import { DateTime } from 'luxon'
import type { DayPlan, Recommendation, RecommendationType } from '../types'
import { getUtcOffset, formatTime } from '../lib/timezone'

interface Props {
  plans: DayPlan[]
  homeTimezone: string
  destTimezone: string
  localScheduleTimezone?: string
}

type TzView = 'dest' | 'home'

// ── Visual config per recommendation type ──────────────────────────────────
const META: Record<RecommendationType, {
  fill: string; stroke: string; textColor: string; label: string; isMarker?: boolean
}> = {
  'sleep':           { fill: '#061020', stroke: '#2563eb', textColor: '#93c5fd', label: 'Sleep' },
  'wake':            { fill: '#2d1200', stroke: '#d97706', textColor: '#fcd34d', label: 'Wake' },
  'melatonin':       { fill: '#160a2e', stroke: '#9333ea', textColor: '#c084fc', label: 'Melatonin', isMarker: true },
  'seek-light':      { fill: '#2d1c00', stroke: '#ca8a04', textColor: '#fde047', label: 'Seek Light' },
  'avoid-light':     { fill: '#0d1117', stroke: '#334155', textColor: '#94a3b8', label: 'Avoid Light' },
  'caffeine-ok':     { fill: '#021a0e', stroke: '#16a34a', textColor: '#4ade80', label: 'Caffeine OK' },
  'avoid-caffeine':  { fill: '#190303', stroke: '#dc2626', textColor: '#f87171', label: 'No Caffeine' },
  'flight':          { fill: '#03111f', stroke: '#0284c7', textColor: '#7dd3fc', label: 'Flight' },
}

// ── Column definitions (which rec types live in which column) ──────────────
const COLUMNS: { key: string; label: string; types: RecommendationType[] }[] = [
  { key: 'sleep',     label: 'Sleep',     types: ['sleep', 'wake'] },
  { key: 'light',     label: 'Light',     types: ['seek-light', 'avoid-light'] },
  { key: 'melatonin', label: 'Melatonin', types: ['melatonin'] },
  { key: 'caffeine',  label: 'Caffeine',  types: ['caffeine-ok', 'avoid-caffeine'] },
  { key: 'flight',    label: 'Flight',    types: ['flight'] },
]

const PX_PER_HR  = 48   // vertical pixels per hour
const TIME_COL_W = 38   // px width of left time-label column

function yFor(dt: DateTime, originMs: number): number {
  return (dt.toMillis() - originMs) / 3_600_000 * PX_PER_HR
}

function fmtHour(h: number): string {
  if (h === 0)  return '12a'
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

export function PlanTimeline({ plans, homeTimezone, destTimezone, localScheduleTimezone }: Props) {
  const [tzView, setTzView]   = useState<TzView>('dest')
  const [selected, setSelected] = useState<Recommendation | null>(null)

  const displayTz = tzView === 'home' ? homeTimezone : destTimezone
  const secondaryTz = displayTz !== homeTimezone ? homeTimezone : undefined

  const tzOptions: { key: TzView; label: string; tz: string }[] = [
    { key: 'dest', label: 'Destination', tz: destTimezone },
    { key: 'home', label: 'Home',        tz: homeTimezone },
    ...(localScheduleTimezone
      ? [{ key: 'local' as TzView, label: 'Local Schedule', tz: localScheduleTimezone }]
      : []),
  ]

  // ── Compute global time range ────────────────────────────────────────────
  // originMs = absolute epoch ms of the very first plan day's midnight in displayTz
  const originMs = useMemo(() => {
    return plans[0].date.setZone(displayTz).startOf('day').toMillis()
  }, [plans, displayTz])

  const endMs = useMemo(() => {
    return plans[plans.length - 1].date.setZone(displayTz).endOf('day').toMillis()
  }, [plans, displayTz])

  const totalHours  = (endMs - originMs) / 3_600_000
  const totalHeight = Math.ceil(totalHours) * PX_PER_HR

  // ── Hour marks for time axis (every 3 hours) ─────────────────────────────
  const hourMarks = useMemo(() => {
    const marks: { ms: number; h: number }[] = []
    let cur = DateTime.fromMillis(originMs, { zone: displayTz })
    const end = DateTime.fromMillis(endMs, { zone: displayTz })
    while (cur <= end) {
      if (cur.hour % 3 === 0) marks.push({ ms: cur.toMillis(), h: cur.hour })
      cur = cur.plus({ hours: 1 })
    }
    return marks
  }, [originMs, endMs, displayTz])

  // ── Day boundaries (midnight in displayTz) ───────────────────────────────
  const dayBoundaries = useMemo(() => {
    const bounds: { ms: number; dateStr: string; planLabel?: string }[] = []
    let cur = DateTime.fromMillis(originMs, { zone: displayTz })
    const end = DateTime.fromMillis(endMs, { zone: displayTz })
    while (cur <= end) {
      const curMs = cur.toMillis()
      const plan = plans.find(p =>
        p.date.setZone(displayTz).startOf('day').toMillis() === curMs
      )
      bounds.push({ ms: curMs, dateStr: cur.toFormat('EEE, MMM d'), planLabel: plan?.label })
      cur = cur.plus({ days: 1 })
    }
    return bounds
  }, [originMs, endMs, displayTz, plans])

  // ── Group recommendations by column ─────────────────────────────────────
  const recsByCol = useMemo(() => {
    const map: Record<string, Recommendation[]> = Object.fromEntries(
      COLUMNS.map(c => [c.key, []])
    )
    for (const plan of plans) {
      for (const rec of plan.recommendations) {
        const col = COLUMNS.find(c => (c.types as string[]).includes(rec.type))
        if (col) map[col.key].push(rec)
      }
    }
    return map
  }, [plans])

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }} className="space-y-3">

      {/* ── Timezone picker ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500 uppercase tracking-widest font-medium" style={{ fontSize: 10 }}>
          Times in
        </span>
        <div className="flex gap-0.5 bg-slate-800/70 border border-slate-700/40 rounded-lg p-0.5">
          {tzOptions.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setTzView(opt.key as TzView); setSelected(null) }}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                tzView === opt.key
                  ? 'bg-slate-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{ fontSize: 12 }}
            >
              {opt.label}
              <span className="ml-1.5 opacity-50" style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
                {getUtcOffset(opt.tz)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="rounded-xl border border-slate-700/50 overflow-hidden bg-slate-950">

        {/* Sticky column headers */}
        <div
          className="sticky top-0 z-30 flex border-b border-slate-700/40 bg-slate-950"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          {/* Time col header */}
          <div
            className="shrink-0 border-r border-slate-700/30 flex items-end px-1 pb-1.5"
            style={{ width: TIME_COL_W }}
          >
            <span className="text-slate-600 uppercase tracking-widest" style={{ fontSize: 8 }}>hr</span>
          </div>
          {/* Activity col headers */}
          {COLUMNS.map((col, ci) => (
            <div
              key={col.key}
              className={`flex-1 text-center py-2 ${ci < COLUMNS.length - 1 ? 'border-r border-slate-700/30' : ''}`}
            >
              <span
                className="text-slate-500 uppercase tracking-widest font-semibold"
                style={{ fontSize: 9 }}
              >
                {col.label}
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable body: time labels + columns */}
        <div className="relative flex" style={{ height: totalHeight }}>

          {/* Time label column */}
          <div
            className="shrink-0 relative border-r border-slate-700/20"
            style={{ width: TIME_COL_W }}
          >
            {hourMarks.map((mark, i) => (
              <div
                key={i}
                className="absolute right-1.5 flex items-center"
                style={{ top: yFor(DateTime.fromMillis(mark.ms, { zone: displayTz }), originMs) - 7 }}
              >
                <span
                  className={mark.h === 0 || mark.h === 12 ? 'text-slate-400' : 'text-slate-600'}
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, lineHeight: 1 }}
                >
                  {fmtHour(mark.h)}
                </span>
              </div>
            ))}
          </div>

          {/* Activity columns */}
          {COLUMNS.map((col, ci) => (
            <div
              key={col.key}
              className={`flex-1 relative ${ci < COLUMNS.length - 1 ? 'border-r border-slate-700/20' : ''}`}
            >
              {/* Hour grid lines */}
              {hourMarks.map((mark, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0"
                  style={{
                    top: yFor(DateTime.fromMillis(mark.ms, { zone: displayTz }), originMs),
                    height: 1,
                    backgroundColor: mark.h === 0 ? '#1e293b' : mark.h === 12 ? '#1a2540' : '#0f1929',
                  }}
                />
              ))}

              {/* Recommendation blocks */}
              {recsByCol[col.key].map((rec, ri) => {
                const meta  = META[rec.type]
                const topY  = yFor(rec.startTime, originMs)
                const endDt = rec.endTime ?? rec.startTime.plus({ minutes: 30 })
                const botY  = yFor(endDt, originMs)
                const h     = Math.max(3, botY - topY)
                const isHl  = selected === rec

                if (meta.isMarker) {
                  // Melatonin → circular pill
                  return (
                    <button
                      key={ri}
                      type="button"
                      onClick={() => setSelected(isHl ? null : rec)}
                      className="absolute focus:outline-none"
                      style={{
                        top:       topY - 10,
                        left:      '50%',
                        transform: 'translateX(-50%)',
                        width:     20,
                        height:    20,
                        borderRadius: 99,
                        backgroundColor: meta.stroke,
                        border:    isHl ? '2px solid #fff' : `1px solid ${meta.stroke}`,
                        boxShadow: isHl ? `0 0 12px ${meta.stroke}` : `0 0 6px ${meta.stroke}80`,
                        zIndex:    isHl ? 15 : 8,
                        display:   'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize:  10,
                        cursor:    'pointer',
                      }}
                      title={`Melatonin: ${formatTime(rec.startTime, displayTz)}${rec.dose ? ` · ${rec.dose}` : ''}`}
                    >
                      💊
                    </button>
                  )
                }

                return (
                  <button
                    key={ri}
                    type="button"
                    onClick={() => setSelected(isHl ? null : rec)}
                    className="absolute focus:outline-none"
                    style={{
                      top:             topY + 1,
                      left:            2,
                      right:           2,
                      height:          h - 2,
                      backgroundColor: meta.fill,
                      border:          `1px solid ${isHl ? '#ffffff40' : meta.stroke + 'aa'}`,
                      borderRadius:    4,
                      overflow:        'hidden',
                      boxShadow:       isHl ? `0 0 0 2px ${meta.stroke}` : 'none',
                      zIndex:          isHl ? 10 : 2,
                      cursor:          'pointer',
                      transition:      'box-shadow 0.1s',
                    }}
                    title={`${meta.label}: ${formatTime(rec.startTime, displayTz)}${rec.endTime ? ` – ${formatTime(rec.endTime, displayTz)}` : ''}`}
                  >
                    {h >= 20 && (
                      <span
                        style={{
                          position:    'absolute',
                          top:         3,
                          left:        4,
                          fontSize:    8,
                          fontWeight:  700,
                          color:       meta.textColor,
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                          whiteSpace:  'nowrap',
                          overflow:    'hidden',
                          maxWidth:    'calc(100% - 8px)',
                        }}
                      >
                        {meta.label}
                      </span>
                    )}
                    {h >= 36 && rec.endTime && (
                      <span
                        style={{
                          position:   'absolute',
                          bottom:     3,
                          left:       4,
                          fontSize:   8,
                          color:      meta.textColor + '99',
                          fontFamily: "'DM Mono', monospace",
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatTime(rec.startTime, displayTz)} – {formatTime(rec.endTime, displayTz)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          {/* Day boundary overlays — span full width including time column */}
          {dayBoundaries.map((bound, i) => {
            const y = yFor(DateTime.fromMillis(bound.ms, { zone: displayTz }), originMs)
            return (
              <div
                key={i}
                style={{
                  position:       'absolute',
                  left:           0,
                  right:          0,
                  top:            y,
                  zIndex:         20,
                  pointerEvents:  'none',
                }}
              >
                <div style={{ height: 1, backgroundColor: '#1e3a5f' }} />
                <div
                  style={{
                    display:         'flex',
                    alignItems:      'center',
                    gap:             6,
                    paddingLeft:     TIME_COL_W + 6,
                    paddingTop:      3,
                    paddingBottom:   3,
                    backgroundColor: 'rgba(3, 10, 24, 0.96)',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                    {bound.dateStr}
                  </span>
                  {bound.planLabel && (
                    <span style={{ fontSize: 10, color: '#475569' }}>
                      {bound.planLabel}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (() => {
        const meta = META[selected.type]
        return (
          <div
            className="rounded-xl border p-4 space-y-2"
            style={{
              backgroundColor: meta.fill + 'ee',
              borderColor:     meta.stroke + '55',
              boxShadow:       `0 0 0 1px ${meta.stroke}18, 0 4px 20px ${meta.stroke}10`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold" style={{ color: meta.textColor, fontSize: 13 }}>
                  {meta.label}
                </span>
                {selected.dose && (
                  <span
                    className="px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      fontSize: 10,
                      backgroundColor: meta.stroke + '22',
                      color: meta.textColor,
                      border: `1px solid ${meta.stroke}44`,
                    }}
                  >
                    {selected.dose}
                  </span>
                )}
                <span
                  className="text-slate-400"
                  style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}
                >
                  {formatTime(selected.startTime, displayTz)}
                  {selected.endTime && ` – ${formatTime(selected.endTime, displayTz)}`}
                  {secondaryTz && (
                    <span className="text-slate-600 ml-2">
                      ({formatTime(selected.startTime, secondaryTz)}
                      {selected.endTime && ` – ${formatTime(selected.endTime, secondaryTz)}`} home)
                    </span>
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-slate-500 hover:text-slate-200 transition-colors shrink-0"
                style={{ fontSize: 14 }}
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 leading-relaxed" style={{ fontSize: 13 }}>
              {selected.note}
            </p>
          </div>
        )
      })()}

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
        {(Object.entries(META) as [RecommendationType, typeof META[RecommendationType]][]).map(([, m]) => (
          <div key={m.label} className="flex items-center gap-1.5">
            <div
              style={{
                width:           m.isMarker ? 10 : 14,
                height:          m.isMarker ? 10 : 10,
                borderRadius:    m.isMarker ? 99 : 3,
                backgroundColor: m.isMarker ? m.stroke : m.fill,
                border:          `1px solid ${m.stroke}`,
                flexShrink:      0,
              }}
            />
            <span className="text-slate-400" style={{ fontSize: 11 }}>{m.label}</span>
          </div>
        ))}
      </div>

    </div>
  )
}
