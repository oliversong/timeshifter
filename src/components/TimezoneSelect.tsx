import { useState, useRef, useEffect, useId } from 'react'
import { getAllTimezones, getUtcOffset } from '../lib/timezone'

interface Props {
  value: string
  onChange: (tz: string) => void
  label: string
  id?: string
}

const allTimezones = getAllTimezones()

export function TimezoneSelect({ value, onChange, label, id: idProp }: Props) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = query.length < 1
    ? allTimezones
    : allTimezones.filter(tz =>
        tz.toLowerCase().includes(query.toLowerCase()) ||
        getUtcOffset(tz).toLowerCase().includes(query.toLowerCase())
      )

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(tz: string) {
    onChange(tz)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      <label htmlFor={id} className="text-sm font-medium text-slate-300">
        {label}
      </label>
      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full text-left px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex justify-between items-center"
        >
          <span className="truncate">{value || 'Select timezone…'}</span>
          <span className="text-slate-400 text-xs ml-2 shrink-0">{value ? getUtcOffset(value) : ''}</span>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-700">
              <input
                autoFocus
                type="text"
                placeholder="Search timezones…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full bg-slate-700 text-white text-sm px-3 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-slate-400 text-sm">No results</div>
              ) : (
                filtered.map(tz => (
                  <button
                    key={tz}
                    type="button"
                    onClick={() => handleSelect(tz)}
                    className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center hover:bg-slate-700 transition-colors ${tz === value ? 'bg-indigo-900 text-indigo-300' : 'text-white'}`}
                  >
                    <span className="truncate">{tz}</span>
                    <span className="text-slate-400 text-xs ml-2 shrink-0">{getUtcOffset(tz)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
