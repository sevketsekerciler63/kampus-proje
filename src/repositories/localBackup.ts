import { enqueueStorageWrite } from './storageWriteCoordinator'
import { isValidProjectStorage } from './projectRepository'
import { isValidTaskStorage } from './taskRepository'
import { isValidMemberStorage } from './memberRepository'
import { isValidMilestoneStorage } from './milestoneRepository'
import { isValidReportStorage } from './reportRepository'
import { isValidDeliverableStorage } from './deliverableRepository'

const backupVersion = 1

const storageKeys = [
  'kampus-proje-demo-projects-v1',
  'kampus-proje-demo-tasks-v1',
  'kampus-proje-demo-members-v1',
  'kampus-proje-demo-milestones-v1',
  'kampus-proje-demo-reports-v1',
  'kampus-proje-demo-deliverables-v1',
] as const

type StorageKey = (typeof storageKeys)[number]
type BackupStorage = Record<StorageKey, unknown[]>

const storageValidators: Record<StorageKey, (value: unknown) => boolean> = {
  'kampus-proje-demo-projects-v1': isValidProjectStorage,
  'kampus-proje-demo-tasks-v1': isValidTaskStorage,
  'kampus-proje-demo-members-v1': isValidMemberStorage,
  'kampus-proje-demo-milestones-v1': isValidMilestoneStorage,
  'kampus-proje-demo-reports-v1': isValidReportStorage,
  'kampus-proje-demo-deliverables-v1': isValidDeliverableStorage,
}

const knownDemoProjectIds = new Set(['demo-yesil-kampus'])
const childStorageKeys = storageKeys.slice(1) as readonly Exclude<StorageKey, 'kampus-proje-demo-projects-v1'>[]

function hasValidProjectRelationships(storage: BackupStorage): boolean {
  const projectIds = new Set(knownDemoProjectIds)
  for (const project of storage['kampus-proje-demo-projects-v1']) {
    projectIds.add((project as Record<string, unknown>).id as string)
  }

  return childStorageKeys.every((storageKey) => storage[storageKey].every((item) => (
    projectIds.has((item as Record<string, unknown>).projectId as string)
  )))
}

interface LocalStorageBackupEnvelope {
  version: typeof backupVersion
  storage: BackupStorage
}

export type LocalStorageBackupExportResult =
  | { ok: true; data: string }
  | { ok: false; message: string }

export type LocalStorageBackupImportResult =
  | { ok: true }
  | { ok: false; message: string }

function readStoredArray(storageKey: StorageKey): unknown[] {
  const raw = window.localStorage.getItem(storageKey)
  if (raw === null) return []

  const value: unknown = JSON.parse(raw)
  if (!storageValidators[storageKey](value)) throw new Error(`Yedeklenemeyen geçersiz localStorage verisi: ${storageKey}`)
  return value as unknown[]
}

function isBackupStorage(value: unknown): value is BackupStorage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const candidateKeys = Object.keys(candidate)
  const hasValidCollections = candidateKeys.length === storageKeys.length
    && candidateKeys.every((key) => storageKeys.includes(key as StorageKey))
    && storageKeys.every((storageKey) => storageValidators[storageKey](candidate[storageKey]))
  return hasValidCollections && hasValidProjectRelationships(candidate as BackupStorage)
}

function parseBackup(rawBackup: string): LocalStorageBackupEnvelope | null {
  try {
    const value: unknown = JSON.parse(rawBackup)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    const candidate = value as Record<string, unknown>
    if (candidate.version !== backupVersion || !isBackupStorage(candidate.storage)) return null
    return { version: backupVersion, storage: candidate.storage }
  } catch {
    return null
  }
}

function withAllStorageLocks<T>(operation: () => Promise<T>): Promise<T> {
  return storageKeys.reduceRight(
    (lockedOperation, storageKey) => () => enqueueStorageWrite(storageKey, lockedOperation),
    operation,
  )()
}

export async function exportLocalStorageBackup(): Promise<LocalStorageBackupExportResult> {
  try {
    return await withAllStorageLocks(async () => {
      try {
        const storage = Object.fromEntries(storageKeys.map((storageKey) => [storageKey, readStoredArray(storageKey)])) as BackupStorage
        if (!hasValidProjectRelationships(storage)) throw new Error('Yedeklenemeyen yetim proje kaydı')
        const backup: LocalStorageBackupEnvelope = { version: backupVersion, storage }
        return { ok: true, data: JSON.stringify(backup) }
      } catch {
        return { ok: false, message: 'Yedek dışa aktarılamadı' }
      }
    })
  } catch {
    return { ok: false, message: 'Yedek dışa aktarılamadı' }
  }
}

/**
 * Restores a complete six-key snapshot. Empty arrays clear their localStorage
 * key, so an import never preserves data that is absent from the backup.
 */
export async function importLocalStorageBackup(rawBackup: string): Promise<LocalStorageBackupImportResult> {
  const backup = parseBackup(rawBackup)
  if (!backup) return { ok: false, message: 'Yedek dosyası veya sürümü desteklenmiyor' }

  try {
    return await withAllStorageLocks(async () => {
      const serialized = storageKeys.map((storageKey) => [storageKey, JSON.stringify(backup.storage[storageKey])] as const)
      const previous = new Map<StorageKey, string | null>()

      try {
        for (const storageKey of storageKeys) previous.set(storageKey, window.localStorage.getItem(storageKey))
      } catch {
        return { ok: false, message: 'Yedek geri yüklenemedi' }
      }

      try {
        for (const [storageKey, value] of serialized) {
          if (backup.storage[storageKey].length === 0) window.localStorage.removeItem(storageKey)
          else window.localStorage.setItem(storageKey, value)
        }
        return { ok: true }
      } catch {
        try {
          for (const storageKey of storageKeys) {
            const value = previous.get(storageKey)
            if (value == null) window.localStorage.removeItem(storageKey)
            else window.localStorage.setItem(storageKey, value)
          }
        } catch {
          return { ok: false, message: 'Yedek geri yüklenemedi; önceki veriler de geri alınamadı' }
        }
        return { ok: false, message: 'Yedek geri yüklenemedi' }
      }
    })
  } catch {
    return { ok: false, message: 'Yedek geri yüklenemedi' }
  }
}
