/**
 * Everything on the shelves lives here. Edit this file and the room updates:
 * each entry becomes a real object in the 3D scene, so keep the lists short
 * enough to stay readable — roughly 6-9 items each.
 */

export type Entry = {
  title: string
  /** Author, artist, or director. */
  by: string
  /** Spine colour. Leave it out and one is picked from the palette. */
  color?: string
}

export const books: Entry[] = [
  { title: 'L\'Étranger', by: 'Albert Camus' },
  { title: 'Le Petit Prince', by: 'Antoine de Saint-Exupéry' },
  { title: "Brave New World", by: "Aldous Huxley" },
  { title: 'The Phantom Tollbooth', by: 'Norton Juster' },
  { title: 'Voyage au Bout de la Nuit', by: 'Louis-Ferdinand Céline' },
  { title: 'The Trial', by: 'Franz Kafka' },
]

export const records: Entry[] = [
  { title: "Two Months Off", by: "Underworld" },
  { title: "Le Sens", by: "Dominique A" },
  { title: "Le Bien, Le Mal", by: "Guru" },
  { title: "Five Years", by: "David Bowie" },
  { title: "Fearless", by: "Pink Floyd" }
]

export const films: Entry[] = [
  { title: 'Playtime', by: 'Jacques Tati' },
  { title: 'The Ascent', by: 'Larisa Shepitkov' },
  { title: 'La Haine', by: 'Mathieu Kassovitz' },
  { title: 'Inland Empire', by: 'David Lynch' },
  { title: 'Solaris', by: 'Andrei Tarkovsky' },
]
