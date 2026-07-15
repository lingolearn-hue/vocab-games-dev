import { useRef, useLayoutEffect, useState } from 'react'

/**
 * Wraps a row of chips and makes them elastic: they grow to fill the
 * available row width when there's slack, and shrink (via real font-size and
 * padding, not a visual transform) when they'd otherwise overflow — so they
 * always occupy exactly one row, never wrapping, and never leaving the row
 * looking sparse with empty space at the end.
 *
 * Mechanism: measures natural content width vs. available width, then sets
 * a `--chip-row-scale` CSS variable on the wrapper. Chip rules opt in by
 * multiplying their own font-size/padding by `var(--chip-row-scale, 1)` via
 * calc() — see index.css's .level-chip / .pos-chip etc. This keeps real
 * layout metrics (so chips don't blur or look visually "off" the way a
 * transform: scale() would), while ChipRow stays a single, generic,
 * reusable measuring component that knows nothing about chip styling.
 *
 * Bounded to a sane range (0.6–1.4) so text never becomes illegible or
 * comically oversized with very few/short chips.
 */
const MIN_SCALE = 0.4
const MAX_SCALE = 1.4

export default function ChipRow({ className = '', children }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    function measure() {
      // Reset to natural size first so we measure true content width
      outer.style.setProperty('--chip-row-scale', '1')
      const cs = getComputedStyle(outer)
      const hPadding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const available = outer.clientWidth - hPadding
      const needed    = inner.scrollWidth
      if (available <= 0 || needed <= 0) return
      const raw = available / needed
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw)))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(outer)
    return () => ro.disconnect()
  }, [children])

  return (
    <div
      ref={outerRef}
      className={`chip-row-outer ${className}`}
      style={{ '--chip-row-scale': scale }}
    >
      <div ref={innerRef} className="chip-row-inner">
        {children}
      </div>
    </div>
  )
}
