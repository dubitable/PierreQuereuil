/**
 * How far the record has turned, in radians. Written by `Turntable` every frame
 * it moves and read by the cat, which sits on the platter and has to turn with
 * it — the two are in different parts of the tree, and a store that notified
 * React would re-render the room sixty times a second to move one object. A
 * plain mutable object costs nothing and is read inside the frame loop.
 */
export const platter = { spin: 0 }
