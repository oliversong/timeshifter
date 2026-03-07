# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` - Start dev server (Vite, http://localhost:5173)
- `npm run build` - Type-check with `tsc -b` then build with Vite
- `npm run lint` - ESLint
- `npx tsc --noEmit` - Type-check without building

No test framework is configured.

## Architecture

Free, open-source jetlag planner. React + TypeScript, Vite, Tailwind CSS v4, Luxon for dates. All data stored in localStorage (no backend).

**Two-view app**: `App.tsx` toggles between `FlightForm` (input) and `PlanTimeline` (results). The form produces a `FlightPlanDates` object, which is passed to `generatePlan()` to create a `DayPlan[]` array of daily recommendations.

**Core algorithm** (`src/lib/circadian.ts`): Generates a multi-day plan spanning 2 days pre-departure through 2 days post-return. Key concepts:
- **Tmin** (temperature minimum) = wake time - 2 hours. Light/melatonin recommendations are anchored relative to Tmin.
- **Eastward = advance clock** (seek light after Tmin), **Westward = delay clock** (seek light before Tmin).
- Sleep schedule interpolates from home to destination using a progress curve (0% at -2 days, 60% at arrival, +15%/day after).

**Dual type system for persistence**: `FlightPlan` stores DateTime fields as ISO strings (for localStorage). `FlightPlanDates` uses Luxon `DateTime` objects (for runtime). Conversion happens in `App.tsx:planToStorable()` and `storage.ts`.

## Tech Notes

- Tailwind v4: uses `@import "tailwindcss"` in CSS and `@tailwindcss/vite` plugin (not v3 config file approach)
- `Intl.supportedValuesOf('timeZone')` requires cast: `(Intl as any).supportedValuesOf(...)` since TS lib doesn't include it
- All timezone handling uses IANA timezone strings and Luxon's `.setZone()` for display
