import { posLabel } from '../engine/settings'
import ChoiceChips from './ChoiceChips'

/**
 * Part-of-speech specialization of the shared ChoiceChips chooser. Used to
 * narrow a game's word pool to one or more grammatical categories (e.g. only
 * nouns, or only verbs + adjectives) so a round draws consistently-typed
 * words. See ChoiceChips for the toggle behavior contract.
 */
export default function PosChips({ options, value, onChange, className = 'pos-filter' }) {
  return (
    <ChoiceChips
      options={options}
      value={value}
      onChange={onChange}
      getLabel={posLabel}
      chipClassName="pos-chip"
      className={className}
    />
  )
}
