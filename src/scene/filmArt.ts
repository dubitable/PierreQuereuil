import { createShelfStore } from './art'
import type { Film } from '../data/tmdb'

const store = createShelfStore<Film | null>()

export const setFilms = store.set
export const useFilms = store.use
