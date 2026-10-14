import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import vm from 'node:vm'
import { buildSync, transformSync } from 'esbuild'
import { createPinia } from 'pinia'
import { reactive, nextTick } from 'vue'

const require = createRequire(import.meta.url)
function loadModule(relativePath, mocks = {}) {
  const path = new URL(relativePath, import.meta.url)
  const code = Object.keys(mocks).length
    ? transformSync(readFileSync(path, 'utf8'), { loader: 'ts', format: 'cjs' }).code
    : buildSync({ entryPoints: [fileURLToPath(path)], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, performance, setTimeout, clearTimeout, setInterval, clearInterval,
    window: mocks.__window,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  })
  return module.exports
}
const { filterResources } = loadModule('../frontend/src/utils/resource-filter.ts')
const { runInSlices, sortInSlices } = loadModule('../frontend/src/utils/work-slices.ts')

const resource = (id, title, extra = {}) => ({
  id, title, type: 'app', file_path: `${id}.exe`, rating: 0, added_at: 1, updated_at: 1,
  open_count: 0, total_run_time: 0, last_run_at: null, ...extra,
})
const defaults = {
  type: 'all', query: '', activeTags: [], excludedTags: [], contentQuery: '', contentType: '', contentResults: [],
  learnedQuery: '', learnedType: '', learnedResults: [], sortField: 'lastUsed', pinRunning: true, runningIds: new Set(),
}
function finish(steps) {
  let step
  do { step = steps.next() } while (!step.done)
  return step.value
}
const filter = (items, options = {}) => Array.from(finish(filterResources(items, { ...defaults, ...options })).items, r => r.id)

test('title, tag, pinyin and token ranking retain their priorities and pinned boost', () => {
  const items = [resource('part', 'My Discord'), resource('tag', 'Chat', { tags: [{ id: 1, name: 'discord' }] }),
    resource('exact', 'Discord'), resource('prefix', 'Discord Client'), resource('pin', 'Discord Tool', { pinned: 1 })]
  assert.deepEqual(filter(items, { query: 'discord' }), ['pin', 'exact', 'tag', 'prefix', 'part'])
  assert.deepEqual(filter([resource('chinese', '\u6570\u4ea7\u8d44\u6e90\u7ba1\u5bb6')], { query: 'shuc' }), ['chinese'])
  assert.deepEqual(filter([resource('latin', 'Discord')], { query: '\u6211\u7684discord' }), ['latin'])
})

test('content and learned matches are scoped to query/type, deduplicated, then tag-filtered', () => {
  const app = resource('app', 'Finance', { tags: [{ id: 1, name: 'work' }] })
  const doc = resource('doc', 'Report', { type: 'document' })
  const content = resource('content', 'Attachment', { type: 'document' })
  const options = { query: 'budget', type: 'document', contentQuery: 'budget', contentType: 'document',
    contentResults: [doc, content, content, app], learnedQuery: 'budget', learnedType: 'document',
    learnedResults: [{ resourceId: 'doc', score: 2 }, { resourceId: 'app', score: 4 }, { resourceId: 'missing', score: 3 }] }
  assert.deepEqual(filter([app, doc], options), ['doc', 'content'])
  assert.deepEqual(filter([app, doc], { ...options, query: 'different' }), [])
  assert.deepEqual(filter([app, doc], { ...options, excludedTags: [0] }), [])
})

test('positive tags use AND, unclassified is an alternative, exclusions win', () => {
  const items = [resource('none', 'None'), resource('one', 'One', { tags: [{ id: 1, name: 'A' }] }),
    resource('both', 'Both', { tags: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] })]
  assert.deepEqual(filter(items, { activeTags: [1, 2] }), ['both'])
  assert.deepEqual(filter(items, { activeTags: [0, 1, 2] }), ['none', 'both'])
  assert.deepEqual(filter(items, { activeTags: [0, 1], excludedTags: [2] }), ['none', 'one'])
  const summary = finish(filterResources(items, { ...defaults, activeTags: [0, 1], excludedTags: [2] }))
  assert.equal(summary.tagCounts.get(1), 1)
  assert.equal(summary.tagCounts.has(2), false)
  assert.equal(summary.untaggedCount, 1)
  assert.equal(summary.searchTags.length, 2)
  assert.equal(summary.byId.size, items.length)
})

test('normal sorting preserves pinned/running priority and user sort fields', () => {
  const items = [resource('a', 'Alpha', { last_run_at: 3 }), resource('b', 'Beta', { last_run_at: 5 }),
    resource('pin', 'Zeta', { pinned: 1 }), resource('run', 'Gamma')]
  assert.deepEqual(filter(items, { runningIds: new Set(['run']) }), ['pin', 'run', 'b', 'a'])
  assert.deepEqual(filter(items, { sortField: 'name', pinRunning: false, runningIds: new Set(['run']) }), ['pin', 'a', 'b', 'run'])
  assert.deepEqual(filter([], { query: 'anything' }), [])
})

test('large matching and stable sorting yield to timers, and cancelled work never returns results', async () => {
  const items = Array.from({ length: 10_000 }, (_, i) => resource(String(i), `Resource ${i}`))
  let pulses = 0
  const timer = setInterval(() => pulses++, 0)
  try {
    const result = await runInSlices(filterResources(items, { ...defaults, query: 'resource' }), () => false)
    assert.equal(result.items.length, items.length)
    assert.ok(pulses > 2, `timer ran only ${pulses} times`)
    let cancelled = false
    setTimeout(() => { cancelled = true }, 5)
    assert.equal(await runInSlices(filterResources(items, { ...defaults, query: 'zzzz' }), () => cancelled), undefined)
    const ties = Array.from({ length: 1100 }, (_, i) => ({ id: i, rank: i % 4 }))
    const sorted = await runInSlices(sortInSlices(ties.slice(), (a, b) => a.rank - b.rank), () => false)
    assert.deepEqual(Array.from(sorted, r => r.id), ties.slice().sort((a, b) => a.rank - b.rank).map(r => r.id))
  } finally {
    clearInterval(timer)
  }
})

test('the store cancels superseded searches and observes edits, tag filters and disposal', async () => {
  const pinia = createPinia()
  const settings = reactive({ resourceSort: 'lastUsed', cardDisplay: { pinRunning: true } })
  const { useResourceStore } = loadModule('../frontend/src/stores/resources.ts', {
    './settings': { useSettingsStore: () => settings },
    '../utils/resource-filter': { filterResources }, '../utils/work-slices': { runInSlices },
  })
  const store = useResourceStore(pinia)
  const waitForIdle = async () => {
    await nextTick()
    for (let i = 0; i < 1000 && store.filtering; i++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(store.filtering, false)
  }
  try {
    store.items = Array.from({ length: 1500 }, (_, i) => resource(String(i), `Other ${i}`))
    store.addOrUpdate(resource('needle', 'Needle'))
    assert.equal(store.counts.all, 1501)
    assert.equal(store.counts.app, 1501)
    store.searchQuery = 'other'
    await nextTick()
    store.searchQuery = 'needle'
    await waitForIdle()
    assert.equal(store.filteredQuery, 'needle')
    assert.deepEqual(Array.from(store.filtered, r => r.id), ['needle'])
    store.addOrUpdate(resource('needle', 'Renamed', { type: 'document' }))
    assert.equal(store.counts.app, 1500)
    assert.equal(store.counts.document, 1)
    await waitForIdle()
    assert.equal(store.filtered.length, 0)
    store.searchQuery = ''
    store.activeTags.push(2)
    await waitForIdle()
    assert.equal(store.filtered.length, 0)
    store.items[0].tags = [{ id: 2, name: 'Included' }]
    store.refreshFiltered()
    await waitForIdle()
    assert.equal(store.filtered.length, 1)
    store.searchQuery = 'other'
    await nextTick()
    store.$dispose()
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(store.filteredQuery, '')
  } finally {
    store.$dispose()
  }
})

test('resource pages preserve order, tag data, privacy and equal-timestamp boundaries', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(loadModule('../backend/db/schema.ts').SCHEMA_SQL)
    db.exec('ALTER TABLE resources ADD COLUMN is_private INTEGER DEFAULT 0; ALTER TABLE resources ADD COLUMN file_size INTEGER DEFAULT 0')
    const insert = db.prepare('INSERT INTO resources(id,type,title,file_path,added_at,updated_at,is_private) VALUES (?,?,?,?,?,?,?)')
    for (let i = 0; i < 451; i++) insert.run(String(i), 'app', `Item ${i}`, `${i}.exe`, i < 420 ? 7 : 8, 1, i % 7 === 0 ? 1 : 0)
    db.exec("INSERT INTO tags(id,name) VALUES (1,'Work'); INSERT INTO resource_tags(resource_id,tag_id) VALUES ('10',1)")
    const { getResourcePage, getAllResources, getResourceHealthCandidates } = loadModule('../backend/db/queries.ts', {
      './index': { getDb: () => db }, '../utils/path-size': { getPathSize: () => 0 },
    })
    const healthCandidates = getResourceHealthCandidates()
    assert.equal(healthCandidates.length, 451)
    assert.equal(Object.hasOwn(healthCandidates[0], 'tags'), false)
    assert.equal(Object.hasOwn(healthCandidates[0], 'title'), false)
    for (const hidePrivate of [false, true]) {
      const all = []
      let cursor
      for (;;) {
        const page = getResourcePage(cursor, hidePrivate)
        assert.ok(page.resources.length <= 200)
        all.push(...page.resources)
        if (!page.nextCursor) break
        cursor = page.nextCursor
      }
      assert.deepEqual(all.map(r => r.id), Array.from(getAllResources(undefined, hidePrivate), r => r.id))
      assert.equal(new Set(all.map(r => r.id)).size, all.length)
      assert.equal(all.find(r => r.id === '10').tags[0].name, 'Work')
      assert.equal(all.some(r => r.id === '0'), !hidePrivate)
    }
    for (const cursor of [null, {}, { addedAt: '7', rowId: 1 }, { addedAt: 7, rowId: -1 }, { addedAt: Infinity, rowId: 1 }]) {
      assert.throws(() => getResourcePage(cursor), /Invalid resource page cursor/)
    }
  } finally {
    db.close()
  }
})

test('paged reloads retain incoming edits and removals, and older reloads cannot overwrite newer ones', async () => {
  const settings = reactive({ resourceSort: 'lastUsed', cardDisplay: { pinRunning: true } })
  let releasePage
  let calls = 0
  const api = {
    resources: {
      getPage: async () => ++calls === 1
        ? { resources: [resource('a', 'Old A'), resource('b', 'Old B')], nextCursor: { addedAt: 1, rowId: 2 } }
        : new Promise(resolve => { releasePage = resolve }),
      remove: async () => {},
    },
    monitor: { running: async () => [] },
  }
  const { useResourceStore } = loadModule('../frontend/src/stores/resources.ts', {
    './settings': { useSettingsStore: () => settings },
    '../utils/resource-filter': { filterResources }, '../utils/work-slices': { runInSlices }, __window: { api },
  })
  const store = useResourceStore(createPinia())
  try {
    const refresh = store.loadAll()
    while (!releasePage) await new Promise(resolve => setTimeout(resolve, 1))
    store.addOrUpdate(resource('a', 'Edited A'))
    store.addOrUpdate(resource('d', 'New D'))
    await store.remove('b')
    releasePage({ resources: [resource('c', 'Old C')], nextCursor: null })
    await refresh
    assert.deepEqual(Array.from(store.items, r => [r.id, r.title]), [['a', 'Edited A'], ['c', 'Old C'], ['d', 'New D']])
    let releaseOlder
    api.resources.getPage = () => new Promise(resolve => { releaseOlder = resolve })
    const older = store.loadAll()
    api.resources.getPage = async () => ({ resources: [resource('latest', 'Latest')], nextCursor: null })
    await store.loadAll()
    await nextTick()
    assert.equal(store.filtered.length, 0, 'a new snapshot must not remount the entire stale page')
    assert.equal(store.filtering, true)
    releaseOlder({ resources: [resource('outdated', 'Outdated')], nextCursor: null })
    await older
    assert.deepEqual(Array.from(store.items, r => r.id), ['latest'])
    assert.equal(store.loading, false)
  } finally {
    store.$dispose()
  }
})
