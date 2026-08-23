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

// TODO: swap these placeholders for your actual favourites.
export const books: Entry[] = [
  { title: 'Piranesi', by: 'Susanna Clarke' },
  { title: 'Dune', by: 'Frank Herbert' },
  { title: 'Solaris', by: 'Stanisław Lem' },
  { title: 'The Dispossessed', by: 'Ursula K. Le Guin' },
  { title: 'Pachinko', by: 'Min Jin Lee' },
  { title: 'Stoner', by: 'John Williams' },
  { title: 'Kitchen', by: 'Banana Yoshimoto' },
]

export const records: Entry[] = [
  { title: "Two Months Off", by: "Underworld" },
  { title: "Le Sens", by: "Dominique A" },
  { title: "Le Bien, Le Mal", by: "Guru" },
  { title: "Five Years", by: "David Bowie" },
  { title: "Fearless", by: "Pink Floyd" }
]

export const films: Entry[] = [
  { title: 'Chungking Express', by: 'Wong Kar-wai' },
  { title: 'Perfect Days', by: 'Wim Wenders' },
  { title: 'Paprika', by: 'Satoshi Kon' },
  { title: 'La Haine', by: 'Mathieu Kassovitz' },
  { title: 'Arrival', by: 'Denis Villeneuve' },
  { title: 'Burning', by: 'Lee Chang-dong' },
]
