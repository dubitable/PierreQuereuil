import { createShelfStore } from './art'
import type { Book } from '../data/openLibrary'

const store = createShelfStore<Book | null>()

export const setBooks = store.set
export const useBooks = store.use
