import { deliverableStatuses, type Deliverable, type DeliverableInput, type DeliverableStatus } from '../types/deliverable'
import { enqueueStorageWrite, waitForStorageWrites } from './storageWriteCoordinator'
import { activeProjectStorageKey, assertActiveProject } from './activeProjectGuard'
import { hasUniqueStringIds } from './storageCollectionValidation'

export interface DeliverableRepository {
  listByProject(projectId: string): Promise<Deliverable[]>
  save(input: DeliverableInput): Promise<Deliverable>
  update(projectId: string, deliverableId: string, input: DeliverableInput): Promise<Deliverable | null>
  updateStatus(projectId: string, deliverableId: string, status: DeliverableStatus, evidenceUrl?: string): Promise<Deliverable | null>
}

const storageKey = 'kampus-proje-demo-deliverables-v1'

function isDeliverableStatus(value: unknown): value is DeliverableStatus {
  return typeof value === 'string' && deliverableStatuses.includes(value as DeliverableStatus)
}

function isEvidenceRequired(status: DeliverableStatus): boolean {
  return status === 'ready' || status === 'submitted'
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function hasValidEvidence(status: DeliverableStatus, evidenceUrl: unknown): boolean {
  return isEvidenceRequired(status) ? isHttpUrl(evidenceUrl) : evidenceUrl === undefined
}

function isDeliverable(value: unknown): value is Deliverable {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (!['id', 'createdAt', 'projectId', 'title', 'description'].every((key) => typeof candidate[key] === 'string')) return false
  if (
    !isDeliverableStatus(candidate.status)
    || (candidate.dueDate !== undefined && typeof candidate.dueDate !== 'string')
    || (candidate.assigneeName !== undefined && typeof candidate.assigneeName !== 'string')
  ) return false
  if (!hasValidEvidence(candidate.status, candidate.evidenceUrl)) return false
  return candidate.status === 'submitted'
    ? typeof candidate.submittedAt === 'string' && !Number.isNaN(Date.parse(candidate.submittedAt))
    : candidate.submittedAt === undefined
}

export function isValidDeliverableStorage(value: unknown): boolean {
  return Array.isArray(value) && value.every(isDeliverable) && hasUniqueStringIds(value)
}

function assertValidInput(input: DeliverableInput): void {
  if (
    typeof input.projectId !== 'string'
    || typeof input.title !== 'string'
    || typeof input.description !== 'string'
    || (input.dueDate !== undefined && typeof input.dueDate !== 'string')
    || (input.assigneeName !== undefined && typeof input.assigneeName !== 'string')
  ) throw new Error('Geçersiz teslim alanları')
  if (!isDeliverableStatus(input.status)) throw new Error('Geçersiz teslim durumu')
  if (!hasValidEvidence(input.status, input.evidenceUrl)) throw new Error('Kanıt URLsi ready ve submitted teslimler için geçerli bir http(s) adresi olmalıdır')
}

function applyStatus(existing: Deliverable, status: DeliverableStatus, evidenceUrl?: string): Deliverable {
  if (!hasValidEvidence(status, evidenceUrl)) throw new Error('Kanıt URLsi ready ve submitted teslimler için geçerli bir http(s) adresi olmalıdır')
  return {
    ...existing,
    status,
    evidenceUrl: isEvidenceRequired(status) ? evidenceUrl : undefined,
    submittedAt: status === 'submitted' ? new Date().toISOString() : undefined,
  }
}

export class LocalStorageDeliverableRepository implements DeliverableRepository {
  private readonly isKnownActiveProject?: (projectId: string) => boolean

  constructor(isKnownActiveProject?: (projectId: string) => boolean) {
    this.isKnownActiveProject = isKnownActiveProject
  }

  async listByProject(projectId: string): Promise<Deliverable[]> {
    await waitForStorageWrites(storageKey)
    return (await this.readAll()).filter((deliverable) => deliverable.projectId === projectId)
  }

  async save(input: DeliverableInput): Promise<Deliverable> {
    assertValidInput(input)
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(input.projectId, 'Teslim yalnız aktif bir projeye bağlanabilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const deliverable = applyStatus({
          ...input,
          evidenceUrl: undefined,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }, input.status, input.evidenceUrl)
        const deliverables = await this.readAll(true)
        window.localStorage.setItem(storageKey, JSON.stringify([deliverable, ...deliverables]))
        return deliverable
      })
    })
  }

  async update(projectId: string, deliverableId: string, input: DeliverableInput): Promise<Deliverable | null> {
    try {
      assertValidInput(input)
    } catch {
      return null
    }
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(projectId, 'Teslim yalnız aktif bir projede güncellenebilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const deliverables = await this.readAll(true)
        const index = deliverables.findIndex((item) => item.id === deliverableId && item.projectId === projectId)
        if (index === -1 || input.projectId !== projectId) return null
        const existing = deliverables[index]
        const updated = applyStatus({ ...existing, ...input, id: existing.id, projectId, createdAt: existing.createdAt, evidenceUrl: undefined }, input.status, input.evidenceUrl)
        deliverables[index] = updated
        window.localStorage.setItem(storageKey, JSON.stringify(deliverables))
        return updated
      })
    })
  }

  async updateStatus(projectId: string, deliverableId: string, status: DeliverableStatus, evidenceUrl?: string): Promise<Deliverable | null> {
    if (!isDeliverableStatus(status)) return null
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(projectId, 'Teslim yalnız aktif bir projede güncellenebilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const deliverables = await this.readAll(true)
        const index = deliverables.findIndex((item) => item.id === deliverableId && item.projectId === projectId)
        if (index === -1) return null
        const updated = applyStatus(deliverables[index], status, evidenceUrl)
        deliverables[index] = updated
        window.localStorage.setItem(storageKey, JSON.stringify(deliverables))
        return updated
      })
    })
  }

  private async readAll(strict = false): Promise<Deliverable[]> {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || (strict && !isValidDeliverableStorage(parsed))) {
        if (strict) throw new Error('Teslim verileri güvenli biçimde okunamadı')
        return []
      }
      return parsed.filter(isDeliverable)
    } catch (error) {
      if (strict) {
        if (error instanceof Error && error.message === 'Teslim verileri güvenli biçimde okunamadı') throw error
        throw new Error('Teslim verileri güvenli biçimde okunamadı')
      }
      return []
    }
  }
}
