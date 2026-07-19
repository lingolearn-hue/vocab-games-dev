/**
 * Topic category taxonomy — parent groups and their leaf children.
 * Shared across all languages; a word's `categories` array stores leaf
 * IDs only (e.g. "animals"), never the parent — the parent/child mapping
 * lives here so the tree can be restructured without touching vocab data.
 *
 * A word may carry 0+ leaf tags. Untagged words are unaffected by any
 * category filter (same convention as the existing 'vulgar' tag).
 */

export const CATEGORY_TREE = [
  {
    id: 'nature', label: 'Nature',
    leaves: [
      { id: 'animals',   label: 'Animals' },
      { id: 'plants',    label: 'Plants' },
      { id: 'weather',   label: 'Weather' },
      { id: 'landscape', label: 'Landscape' },
    ],
  },
  {
    id: 'people', label: 'People',
    leaves: [
      { id: 'family',     label: 'Family' },
      { id: 'body',       label: 'Body' },
      { id: 'emotions',   label: 'Emotions' },
      { id: 'appearance', label: 'Appearance' },
    ],
  },
  {
    id: 'life', label: 'Life',
    leaves: [
      { id: 'food',     label: 'Food' },
      { id: 'clothing', label: 'Clothing' },
      { id: 'home',     label: 'Home' },
      { id: 'shopping', label: 'Shopping' },
    ],
  },
  {
    id: 'time', label: 'Time',
    leaves: [
      { id: 'calendar', label: 'Calendar' },
      { id: 'numbers',  label: 'Numbers' },
    ],
  },
  {
    id: 'places', label: 'Places',
    leaves: [
      { id: 'travel',     label: 'Travel' },
      { id: 'directions', label: 'Directions' },
      { id: 'countries',  label: 'Countries' },
    ],
  },
  {
    id: 'society', label: 'Society',
    leaves: [
      { id: 'work',       label: 'Work' },
      { id: 'school',     label: 'School' },
      { id: 'technology', label: 'Technology' },
      { id: 'health',     label: 'Health' },
      { id: 'economy',    label: 'Economy' },
    ],
  },
  {
    id: 'science', label: 'Science',
    leaves: [
      { id: 'physics',   label: 'Physics' },
      { id: 'chemistry', label: 'Chemistry' },
      { id: 'biology',   label: 'Biology' },
    ],
  },
  {
    id: 'abstract', label: 'Abstract',
    leaves: [
      { id: 'verbs',       label: 'Verbs' },
      { id: 'connectors',  label: 'Connectors' },
      { id: 'questions',   label: 'Questions' },
      { id: 'quantifiers', label: 'Quantifiers' },
      { id: 'concepts',    label: 'Concepts' },
      { id: 'grammar',     label: 'Grammar' },
    ],
  },
]

/** Flat lookup: leaf id -> { parentId, parentLabel, leafLabel } */
export const LEAF_INFO = CATEGORY_TREE.reduce((acc, parent) => {
  for (const leaf of parent.leaves) {
    acc[leaf.id] = { parentId: parent.id, parentLabel: parent.label, leafLabel: leaf.label }
  }
  return acc
}, {})

export function leavesForParent(parentId) {
  return CATEGORY_TREE.find(p => p.id === parentId)?.leaves ?? []
}
