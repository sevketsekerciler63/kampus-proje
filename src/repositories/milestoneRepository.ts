import { milestoneStatuses, type Milestone, type MilestoneInput, type MilestoneStatus } from '../types/milestone'
import { enqueueStorageWrite, waitForStorageWrites } from './storageWriteCoordinator'
import { activeProjectStorageKey, assertActiveProject } from './activeProjectGuard'
import { hasUniqueStringIds } from './storageCollectionValidation'

export interface MilestoneRepository {
  listByProject(projectId: string): Promise<Milestone[]>
  save(input: MilestoneInput): Promise<Milestone>
  updateStatus(projectId: string, milestoneId: string, status: MilestoneStatus): Promise<Milestone | null>
}

const storageKey = 'kampus-proje-demo-milestones-v1'

function isMilestone(value: unknown): value is Milestone {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return ['id', 'createdAt', 'projectId', 'title', 'description', 'dueDate'].every((key) => typeof candidate[key] === 'string')
    && milestoneStatuses.includes(candidate.status as MilestoneStatus)
    && (candidate.status === 'completed'
      ? typeof candidate.completedAt === 'string' && !Number.isNaN(Date.parse(candidate.completedAt))
      : candidate.completedAt === undefined)
}

export function isValidMilestoneStorage(value: unknown): boolean {
  return Array.isArray(value) && value.every(isMilestone) && hasUniqueStringIds(value)
}

export class LocalStorageMilestoneRepository implements MilestoneRepository {
  private readonly isKnownActiveProject?: (projectId: string) => boolean

  constructor(isKnownActiveProject?: (projectId: string) => boolean) {
    this.isKnownActiveProject = isKnownActiveProject
  }

  async listByProject(projectId: string): Promise<Milestone[]> {
    await waitForStorageWrites(storageKey)
    return (await this.readAll()).filter((milestone) => milestone.projectId === projectId)
  }

  async save(input: MilestoneInput): Promise<Milestone> {
    if (!milestoneStatuses.includes(input.status)) throw new Error('Geçersiz proje aşaması durumu')
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(input.projectId, 'Proje aşaması yalnız aktif bir projeye bağlanabilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const milestone: Milestone = {
          ...input,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...(input.status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
        }
        const milestones = await this.readAll(true)
        window.localStorage.setItem(storageKey, JSON.stringify([milestone, ...milestones]))
        return milestone
      })
    })
  }

  async updateStatus(projectId: string, milestoneId: string, status: MilestoneStatus): Promise<Milestone | null> {
    if (!milestoneStatuses.includes(status)) return null
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(projectId, 'Proje aşaması yalnız aktif bir projeye bağlanabilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const milestones = await this.readAll(true)
        const index = milestones.findIndex((item) => item.projectId === projectId && item.id === milestoneId)
        if (index === -1) return null
        const updated: Milestone = {
          ...milestones[index],
          status,
          completedAt: status === 'completed' ? new Date().toISOString() : undefined,
        }
        milestones[index] = updated
        window.localStorage.setItem(storageKey, JSON.stringify(milestones))
        return updated
      })
    })
  }


  private async readAll(strict = false): Promise<Milestone[]> {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || (strict && !isValidMilestoneStorage(parsed))) {
        if (strict) throw new Error('Proje aşaması verileri güvenli biçimde okunamadı')
        return []
      }
      return parsed.filter(isMilestone)
    } catch (error) {
      if (strict) {
        if (error instanceof Error && error.message === 'Proje aşaması verileri güvenli biçimde okunamadı') throw error
        throw new Error('Proje aşaması verileri güvenli biçimde okunamadı')
      }
      return []
    }
  }
}
