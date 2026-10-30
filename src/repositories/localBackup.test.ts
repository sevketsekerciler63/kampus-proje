import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportLocalStorageBackup, importLocalStorageBackup } from './localBackup'
import { enqueueStorageWrite } from './storageWriteCoordinator'

const storageKeys = [
  'kampus-proje-demo-projects-v1',
  'kampus-proje-demo-tasks-v1',
  'kampus-proje-demo-members-v1',
  'kampus-proje-demo-milestones-v1',
  'kampus-proje-demo-reports-v1',
  'kampus-proje-demo-deliverables-v1',
] as const

function validStorage() {
  return Object.fromEntries(storageKeys.map((key) => [key, []]))
}

const createdAt = '2026-10-06T08:00:00.000Z'

function validProject(id: string) {
  return { id, createdAt, name: id, problem: 'Problem', goal: 'Amaç', scope: 'Kapsam', advisor: 'Danışman' }
}

function validTask(id: string, projectId = 'project-a') {
  return { id, createdAt, projectId, title: id, description: 'Geçerli görev açıklaması', assigneeName: 'Ayşe Kaya', status: 'todo', priority: 'medium' }
}

function validMember(id: string, projectId = 'project-a') {
  return { id, createdAt, projectId, name: id, email: `${id}@example.edu`, responsibility: 'Geliştirme' }
}

describe('localStorage backup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('exports exactly the six known storage keys in a versioned snapshot envelope', async () => {
    localStorage.setItem(storageKeys[0], JSON.stringify([validProject('project-a')]))
    localStorage.setItem(storageKeys[1], JSON.stringify([validTask('task-a')]))

    await expect(exportLocalStorageBackup()).resolves.toEqual({
      ok: true,
      data: JSON.stringify({
        version: 1,
        storage: {
          [storageKeys[0]]: [validProject('project-a')],
          [storageKeys[1]]: [validTask('task-a')],
          [storageKeys[2]]: [],
          [storageKeys[3]]: [],
          [storageKeys[4]]: [],
          [storageKeys[5]]: [],
        },
      }),
    })
  })

  it('returns an error result when export encounters corrupt stored JSON', async () => {
    localStorage.setItem(storageKeys[0], '{not-json')

    await expect(exportLocalStorageBackup()).resolves.toEqual({
      ok: false,
      message: expect.any(String),
    })
  })

  it('returns an error result instead of exporting structurally invalid domain data', async () => {
    localStorage.setItem(storageKeys[3], JSON.stringify([{}]))

    await expect(exportLocalStorageBackup()).resolves.toEqual({
      ok: false,
      message: expect.any(String),
    })
  })

  it('waits for queued writes before exporting a snapshot', async () => {
    let releaseWrite!: () => void
    const writeCanFinish = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const pendingWrite = enqueueStorageWrite(storageKeys[0], async () => {
      await writeCanFinish
      localStorage.setItem(storageKeys[0], JSON.stringify([validProject('queued-project')]))
    })

    const exportPromise = exportLocalStorageBackup()
    let settled = false
    void exportPromise.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseWrite()
    await pendingWrite
    await expect(exportPromise).resolves.toEqual({
      ok: true,
      data: expect.stringContaining('queued-project'),
    })
  })

  it('imports a valid snapshot by replacing every known key and clearing empty keys', async () => {
    for (const storageKey of storageKeys) localStorage.setItem(storageKey, JSON.stringify([{ id: `old-${storageKey}` }]))

    const backup = JSON.stringify({
      version: 1,
      storage: {
        [storageKeys[0]]: [validProject('restored-project')],
        [storageKeys[1]]: [],
        [storageKeys[2]]: [validMember('restored-member', 'restored-project')],
        [storageKeys[3]]: [],
        [storageKeys[4]]: [],
        [storageKeys[5]]: [],
      },
    })

    await expect(importLocalStorageBackup(backup)).resolves.toEqual({ ok: true })
    expect(localStorage.getItem(storageKeys[0])).toBe(JSON.stringify([validProject('restored-project')]))
    expect(localStorage.getItem(storageKeys[1])).toBeNull()
    expect(localStorage.getItem(storageKeys[2])).toBe(JSON.stringify([validMember('restored-member', 'restored-project')]))
    expect(localStorage.getItem(storageKeys[3])).toBeNull()
    expect(localStorage.getItem(storageKeys[4])).toBeNull()
    expect(localStorage.getItem(storageKeys[5])).toBeNull()
  })

  it('waits for queued writes before importing so the import becomes the final snapshot', async () => {
    let releaseWrite!: () => void
    const writeCanFinish = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const pendingWrite = enqueueStorageWrite(storageKeys[0], async () => {
      await writeCanFinish
      localStorage.setItem(storageKeys[0], JSON.stringify([validProject('queued-project')]))
    })
    const importPromise = importLocalStorageBackup(JSON.stringify({
      version: 1,
      storage: {
        ...validStorage(),
        [storageKeys[0]]: [validProject('imported-project')],
      },
    }))

    releaseWrite()
    await pendingWrite
    await expect(importPromise).resolves.toEqual({ ok: true })
    expect(localStorage.getItem(storageKeys[0])).toBe(JSON.stringify([validProject('imported-project')]))
  })

  it.each([
    ['malformed JSON', '{not-json'],
    ['a future version', JSON.stringify({ version: 2, storage: validStorage() })],
    ['a missing known key', JSON.stringify({ version: 1, storage: Object.fromEntries(storageKeys.slice(1).map((key) => [key, []])) })],
    ['a non-array known key value', JSON.stringify({ version: 1, storage: { ...validStorage(), [storageKeys[0]]: {} } })],
    ['an extra storage key', JSON.stringify({ version: 1, storage: { ...validStorage(), unexpected: [] } })],
  ])('rejects %s without changing any stored value', async (_case, backup) => {
    const before = Object.fromEntries(storageKeys.map((storageKey) => [storageKey, JSON.stringify([{ id: storageKey }])]))
    for (const [storageKey, value] of Object.entries(before)) localStorage.setItem(storageKey, value)

    await expect(importLocalStorageBackup(backup)).resolves.toEqual({ ok: false, message: 'Yedek dosyası veya sürümü desteklenmiyor' })
    expect(Object.fromEntries(storageKeys.map((storageKey) => [storageKey, localStorage.getItem(storageKey)]))).toEqual(before)
  })

  it('rejects invalid domain records for every known key without replacing current data', async () => {
    for (const invalidKey of storageKeys) {
      localStorage.clear()
      const before = Object.fromEntries(storageKeys.map((storageKey) => [storageKey, JSON.stringify([])]))
      for (const [storageKey, value] of Object.entries(before)) localStorage.setItem(storageKey, value)

      const backup = JSON.stringify({
        version: 1,
        storage: { ...validStorage(), [invalidKey]: [{}] },
      })

      await expect(importLocalStorageBackup(backup)).resolves.toEqual({ ok: false, message: 'Yedek dosyası veya sürümü desteklenmiyor' })
      expect(Object.fromEntries(storageKeys.map((storageKey) => [storageKey, localStorage.getItem(storageKey)]))).toEqual(before)
    }
  })

  it('rejects duplicate record ids without replacing current data', async () => {
    const before = Object.fromEntries(storageKeys.map((storageKey) => [storageKey, JSON.stringify([])]))
    for (const [storageKey, value] of Object.entries(before)) localStorage.setItem(storageKey, value)
    const duplicate = validProject('duplicate-project')

    const backup = JSON.stringify({
      version: 1,
      storage: { ...validStorage(), [storageKeys[0]]: [duplicate, duplicate] },
    })

    await expect(importLocalStorageBackup(backup)).resolves.toEqual({ ok: false, message: 'Yedek dosyası veya sürümü desteklenmiyor' })
    expect(Object.fromEntries(storageKeys.map((storageKey) => [storageKey, localStorage.getItem(storageKey)]))).toEqual(before)
  })

  it('rejects orphan child records whose project does not exist', async () => {
    const before = Object.fromEntries(storageKeys.map((storageKey) => [storageKey, JSON.stringify([])]))
    for (const [storageKey, value] of Object.entries(before)) localStorage.setItem(storageKey, value)
    const orphanTask = { ...validTask('orphan-task'), projectId: 'missing-project' }

    const backup = JSON.stringify({
      version: 1,
      storage: { ...validStorage(), [storageKeys[1]]: [orphanTask] },
    })

    await expect(importLocalStorageBackup(backup)).resolves.toEqual({ ok: false, message: 'Yedek dosyası veya sürümü desteklenmiyor' })
    expect(Object.fromEntries(storageKeys.map((storageKey) => [storageKey, localStorage.getItem(storageKey)]))).toEqual(before)
  })

  it('returns an explicit rollback failure result without throwing', async () => {
    const oldProject = [validProject('old-project')]
    const oldTask = [validTask('old-task', 'old-project')]
    const newProject = [validProject('new-project')]
    const newTask = [validTask('new-task', 'new-project')]
    localStorage.setItem(storageKeys[0], JSON.stringify(oldProject))
    localStorage.setItem(storageKeys[1], JSON.stringify(oldTask))
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      if (key === storageKeys[1] && value === JSON.stringify(newTask)) throw new Error('apply failed')
      if (key === storageKeys[0] && value === JSON.stringify(oldProject)) throw new Error('rollback failed')
    })

    await expect(importLocalStorageBackup(JSON.stringify({
      version: 1,
      storage: {
        ...validStorage(),
        [storageKeys[0]]: newProject,
        [storageKeys[1]]: newTask,
      },
    }))).resolves.toEqual({
      ok: false,
      message: 'Yedek geri yüklenemedi; önceki veriler de geri alınamadı',
    })
    expect(setItem).toHaveBeenCalled()
  })
})
