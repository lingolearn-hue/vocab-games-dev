import { useMemo } from 'react'
import { CATEGORY_TREE, LEAF_INFO, resolveLabel } from '../engine/categories'
import ChipRow from './ChipRow'
import ChoiceChips from './ChoiceChips'
import './ChipRow.css'

/**
 * Two-level topic filter: a parent row (Nature, People, Life, ...) plus an
 * on-demand leaf row that only appears once exactly one parent is active,
 * letting you drill from "Nature" down to just "Animals".
 *
 * `value` is the flat array of selected LEAF ids (or null = no filter) —
 * the same shape filterByCategory/settings.categories.global expects.
 * `lang` selects which language the chip labels are shown in (the target
 * language being studied), falling back to English if untranslated.
 * Selecting a parent selects all of its present leaves at once; selecting
 * a second parent broadens any already-active parent back to its full
 * leaf set first (so drilling into one topic doesn't silently narrow a
 * topic you'd already broadened out of). Leaf-level narrowing only makes
 * sense with a single parent active, so the leaf row hides otherwise.
 */
export default function CategoryChooser({ entries, value, onChange, lang = 'en', className = 'category-filter' }) {
  const presentLeaves = useMemo(() => {
    const set = new Set()
    for (const e of entries) for (const c of (e.categories ?? [])) set.add(c)
    return set
  }, [entries])

  const parents = useMemo(
    () => CATEGORY_TREE
      .map(p => ({ ...p, leaves: p.leaves.filter(l => presentLeaves.has(l.id)) }))
      .filter(p => p.leaves.length > 0),
    [presentLeaves]
  )

  if (parents.length === 0) return null

  const activeParents = parents.filter(p => p.leaves.some(l => value?.includes(l.id)))

  function toggleParent(parent) {
    const leafIds = parent.leaves.map(l => l.id)
    const isActive = leafIds.some(id => value?.includes(id))

    if (isActive) {
      const next = (value ?? []).filter(id => !leafIds.includes(id))
      onChange(next.length ? next : null)
      return
    }

    // Broaden any already-active parent(s) to their full leaf set before
    // adding this one, so a previously-drilled-into topic doesn't stay
    // narrowed once we're in multi-parent mode.
    let broadened = [...(value ?? [])]
    for (const p of activeParents) {
      broadened = Array.from(new Set([...broadened, ...p.leaves.map(l => l.id)]))
    }
    onChange(Array.from(new Set([...broadened, ...leafIds])))
  }

  const drilledParent = activeParents.length === 1 ? activeParents[0] : null

  return (
    <div className={className}>
      <ChipRow className={`${className}-parents`}>
        {parents.map(p => (
          <button
            key={p.id}
            className={`level-chip ${activeParents.includes(p) ? 'active' : ''}`}
            onClick={() => toggleParent(p)}
          >
            {resolveLabel(p.labels, lang)}
          </button>
        ))}
      </ChipRow>

      {drilledParent && (
        <ChoiceChips
          options={drilledParent.leaves.map(l => l.id)}
          value={value}
          onChange={onChange}
          getLabel={id => resolveLabel(LEAF_INFO[id].leafLabels, lang)}
          chipClassName="level-chip category-leaf-chip"
          className={`${className}-leaves`}
        />
      )}
    </div>
  )
}
