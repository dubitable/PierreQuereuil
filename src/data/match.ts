/**
 * Matching people's names across services, loosely.
 *
 * Transliterations disagree on endings often enough that an exact comparison is
 * too strict — TMDB's "Larisa Shepitko" and the shelf's "Shepitkov" are the same
 * person — so a shared five-letter stem on the surname counts as a match.
 */

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim()

/** Length of surname that has to agree before two spellings count as one name. */
const STEM = 5

export function sameName(a: string, b: string) {
  const left = norm(a).split(' ').filter(Boolean).pop()
  const right = norm(b).split(' ').filter(Boolean).pop()
  if (!left || !right) return false
  if (left === right) return true
  return (
    (left.length >= STEM && right.startsWith(left.slice(0, STEM))) ||
    (right.length >= STEM && left.startsWith(right.slice(0, STEM)))
  )
}

/**
 * Whether any of the names credited on a result is the one we were after.
 * Services often list several — every author of an anthology, or the same
 * author in two scripts — and one hit is enough.
 */
export function creditedTo(credits: string[] | undefined, wanted: string) {
  return (credits ?? []).some((credit) => sameName(credit, wanted))
}
