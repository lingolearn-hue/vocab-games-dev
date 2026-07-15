import ChipRow from './ChipRow'
import './ChipRow.css'

/**
 * Generic multi-select chip chooser for any small, fixed set of values
 * (levels, parts of speech, etc). This is the one central place the
 * "toggle chip filter" behavior is implemented; specialized wrappers like
 * LevelChooser and PosChips just supply the value list and a label function.
 *
 * Contract:
 *  - `value` is either `null` (meaning "everything active / no filter") or
 *    an array of the currently-selected values.
 *  - Clicking a chip while `value` is `null` narrows the selection to just
 *    that one value.
 *  - Clicking an already-selected chip removes it; if that empties the
 *    selection, it collapses back to `null` rather than an empty array, so
 *    the UI never shows "everything is off".
 *  - Selecting every available chip also collapses back to `null`, since
 *    "all selected" and "no filter" mean the same thing.
 *
 * Chips are auto-scaled (via ChipRow) to always fit on one row.
 */
export default function ChoiceChips({ options, value, onChange, getLabel = String, chipClassName = 'level-chip', className = 'level-filter' }) {
  if (!options?.length) return null

  function isActive(opt) {
    return !value || value.includes(opt)
  }

  function toggle(opt) {
    if (!value) {
      onChange([opt])
      return
    }
    let next
    if (value.includes(opt)) {
      const filtered = value.filter(o => o !== opt)
      next = filtered.length === 0 ? null : filtered
    } else {
      const merged = [...value, opt]
      next = merged.length === options.length ? null : merged
    }
    onChange(next)
  }

  return (
    <ChipRow className={className}>
      {options.map(opt => (
        <button
          key={opt}
          className={`${chipClassName} ${isActive(opt) ? 'active' : ''}`}
          onClick={() => toggle(opt)}
        >
          {getLabel(opt)}
        </button>
      ))}
    </ChipRow>
  )
}
