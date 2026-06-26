import '@testing-library/jest-dom/vitest'
// Provide an in-memory IndexedDB so Dexie-backed code (the offline cache
// persister) works under jsdom/Node during unit tests.
import 'fake-indexeddb/auto'
