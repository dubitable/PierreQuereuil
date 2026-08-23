/**
 * One palette for the whole room.
 *
 * The Kenney furniture kit ships untextured: every mesh uses a flat material
 * with a semantic name (`wood`, `metal`, `carpet`, ...). We remap those names
 * onto the palette below, which is what stops the scene looking like the
 * stock asset pack and makes the sourced props agree with the ones we build
 * from primitives.
 */
export const KENNEY_MATERIALS: Record<string, string> = {
  wood: '#c9ad86',
  metal: '#dcd7cb',
  metalMedium: '#a9a296',
  metalDark: '#6b675f',
  carpet: '#d7a08b',
  carpetDarker: '#bf8a75',
  carpetWhite: '#f2eee5',
  plant: '#93a98c',
  lamp: '#ffe9b0',
  _defaultMat: '#efebe1',
}

export const palette = {
  background: '#f4f1ea',
  floor: '#e9e3d7',
  ink: '#3d3833',
  inkSoft: '#8a8378',
  accent: '#b26a4f',
  vinyl: '#2f2b28',
  label: '#d7a08b',
}

/** Muted spine colours, cycled through books, sleeves, and DVD cases. */
export const spines = [
  '#b26a4f',
  '#7d8f7a',
  '#c9a05c',
  '#6f8090',
  '#a3838f',
  '#8a7f6d',
  '#9c6b62',
]

export const spineColor = (i: number) => spines[i % spines.length]!
