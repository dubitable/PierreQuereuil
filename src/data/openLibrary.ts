/**
 * Book covers come from Open Library, resolved at build time alongside the
 * films. No API key: the search endpoint is open, and fetching a cover by its
 * numeric id is not rate-limited the way ISBN and OLID lookups are.
 */
import type { Entry } from './collections'
import { creditedTo } from './match'

export type Book = {
  title: string
  author: string
  year: string
  /** ~17KB. Small enough to dress all seven shelves eagerly. */
  coverUrl: string
  /** ~49KB. Fetched only for the book you pull off the shelf. */
  largeUrl: string
  olUrl: string
}

const SEARCH = 'https://openlibrary.org/search.json'
const COVERS = 'https://covers.openlibrary.org/b/id'
const FIELDS = 'title,author_name,first_publish_year,cover_i,key,edition_count'
/** Open Library asks callers to identify themselves. */
const AGENT = 'pierrequereuil.com portfolio (build-time cover lookup)'

/** How many pages of editions to scan for a cover. 100 each. */
const EDITION_PAGES = 3
const EDITION_LIMIT = 100
/** Formats whose "cover" is a disc sleeve or a scanned title page, not a jacket. */
const NON_PRINT = /audio|cassette|\bcd\b|spoken|mp3|ebook|kindle|large print|library binding/i

type SearchDoc = {
  title?: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  key?: string
  edition_count?: number
}

type Edition = {
  title?: string
  covers?: number[]
  publish_date?: string
  physical_format?: string
  publishers?: string[]
}

/** Titles compare on letters and digits alone: casing and punctuation vary wildly. */
const normalizeTitle = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')

/** Open Library's publish dates run from "1961" to "03/02/2022" to "1970?". */
function editionYear(edition: Edition) {
  const found = /\b(1[5-9]\d\d|20\d\d)\b/.exec(edition.publish_date ?? '')
  return found ? Number(found[1]) : 0
}

function isPrinted(edition: Edition) {
  return (
    !NON_PRINT.test(edition.physical_format ?? '') &&
    !NON_PRINT.test(edition.publishers?.[0] ?? '')
  )
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': AGENT },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

/**
 * The cover a work is filed under is whichever scan happened to be uploaded
 * first, and it is usually a poor one — a faded 1943 paperback for *Le Petit
 * Prince*, an Icelandic reprint, once a scanned title page. So pick a cover
 * from the work's editions instead:
 *
 * - **the same title as the shelf**, which is what selects the language. The
 *   entry says "Le Petit Prince", so French editions win and the Catalan,
 *   Nissart and Ancient Greek printings drop out.
 * - **printed**, since an audiobook's cover is a disc sleeve.
 * - **newest**, which is the edition currently in shops and so the artwork
 *   most people picture.
 *
 * Returns null when nothing qualifies, and the work's own cover is used.
 */
async function pickCover(workKey: string, title: string): Promise<number | null> {
  const wanted = normalizeTitle(title)
  const editions: Edition[] = []

  for (let page = 0; page < EDITION_PAGES; page++) {
    const data = await json<{ entries?: Edition[] }>(
      `https://openlibrary.org${workKey}/editions.json?limit=${EDITION_LIMIT}&offset=${page * EDITION_LIMIT}`,
    )
    const entries = data?.entries ?? []
    editions.push(...entries)
    if (entries.length < EDITION_LIMIT) break
  }

  const usable = editions.filter(
    (edition) =>
      (edition.covers?.[0] ?? -1) > 0 &&
      normalizeTitle(edition.title ?? '') === wanted &&
      isPrinted(edition),
  )
  if (!usable.length) return null

  // const newest = usable.reduce((best, edition) =>
  //   editionYear(edition) > editionYear(best) ? edition : best,
  // )

  return usable![0].covers![0]!
}

async function lookupBook(entry: Entry): Promise<Book | null> {
  const query = new URLSearchParams({
    title: entry.title,
    author: entry.by,
    limit: '10',
    fields: FIELDS,
  })

  const found = await json<{ docs?: SearchDoc[] }>(`${SEARCH}?${query}`)
  const withCovers = (found?.docs ?? []).filter((doc) => (doc.cover_i ?? 0) > 0 && doc.key)
  if (!withCovers.length) return null

  // These are *works*, not editions — one record per book, with every printing
  // folded into it. Open Library's relevance order alone is not enough: it puts
  // a work titled "Kitchen (A Black cat book)" above plain "Kitchen", and for
  // some authors the canonical record credits only another script (吉本 ばなな
  // rather than Banana Yoshimoto), so the author signal can be absent entirely.
  // Score on both, then break ties on how widely the work has been published,
  // which is what separates the real record from a stray reprint of it.
  const wanted = normalizeTitle(entry.title)
  const score = (doc: SearchDoc) =>
    (creditedTo(doc.author_name, entry.by) ? 4 : 0) +
    (normalizeTitle(doc.title ?? '') === wanted ? 2 : 0)

  const hit = withCovers.slice().sort((a, b) => {
    const byScore = score(b) - score(a)
    if (byScore !== 0) return byScore
    return (b.edition_count ?? 0) - (a.edition_count ?? 0)
  })[0]!

  const coverId = (await pickCover(hit.key!, entry.title)) ?? hit.cover_i!

  return {
    // The shelf's own spelling wins: Open Library's casing is inconsistent
    // ("Le petit prince"), and the title here was written deliberately.
    title: entry.title,
    // Keep the shelf's spelling when the edition credits someone unrecognisable.
    author: creditedTo(hit.author_name, entry.by) ? hit.author_name![0]! : entry.by,
    year: hit.first_publish_year ? String(hit.first_publish_year) : '',
    coverUrl: `${COVERS}/${coverId}-M.jpg`,
    largeUrl: `${COVERS}/${coverId}-L.jpg`,
    olUrl: `https://openlibrary.org${hit.key}`,
  }
}

/**
 * Resolves the shelf. Every failure — offline, no match, a bad response —
 * yields a null entry rather than throwing: the bookcase has to keep working
 * as plain coloured covers, and a build must never fail over a book jacket.
 */
export async function resolveBooks(entries: Entry[]): Promise<(Book | null)[]> {
  return Promise.all(
    entries.map(async (entry) => {
      try {
        return await lookupBook(entry)
      } catch {
        return null
      }
    }),
  )
}
