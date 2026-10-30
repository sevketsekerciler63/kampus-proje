const storageWriteQueues = new Map<string, Promise<void>>()

function runWithBrowserLock<T>(storageKey: string, operation: () => Promise<T>): Promise<T> {
  const lockManager = globalThis.navigator?.locks
  if (!lockManager) return operation()

  return lockManager.request(
    `kampus-proje-storage:${storageKey}`,
    { mode: 'exclusive' },
    operation,
  )
}

export function enqueueStorageWrite<T>(storageKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = storageWriteQueues.get(storageKey) ?? Promise.resolve()
  const result = previous.then(
    () => runWithBrowserLock(storageKey, operation),
    () => runWithBrowserLock(storageKey, operation),
  )
  const settled = result.then(() => undefined, () => undefined)
  storageWriteQueues.set(storageKey, settled)
  void settled.then(() => {
    if (storageWriteQueues.get(storageKey) === settled) storageWriteQueues.delete(storageKey)
  })
  return result
}

export function waitForStorageWrites(storageKey: string): Promise<void> {
  return storageWriteQueues.get(storageKey) ?? Promise.resolve()
}
