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
      <label htmlFor={id} className="text-sm font-medium text-stone-600">
        {label}
      </label>
      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full text-left px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 flex justify-between items-center"
        >
          <span className="truncate">{value || 'Select timezone\u2026'}</span>
          <span className="text-stone-400 text-xs ml-2 shrink-0">{value ? getUtcOffset(value) : ''}</span>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
            <div className="p-2 border-b border-stone-100">
              <input
                autoFocus
                type="text"
                placeholder="Search timezones\u2026"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full bg-stone-50 text-stone-800 text-sm px-3 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-stone-400 text-sm">No results</div>
              ) : (
                filtered.map(tz => (
                  <button
                    key={tz}
                    type="button"
                    onClick={() => handleSelect(tz)}
                    className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center hover:bg-stone-50 transition-colors ${tz === value ? 'bg-teal-50 text-teal-700' : 'text-stone-700'}`}
                  >
                    <span className="truncate">{tz}</span>
                    <span className="text-stone-400 text-xs ml-2 shrink-0">{getUtcOffset(tz)}</span>
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
