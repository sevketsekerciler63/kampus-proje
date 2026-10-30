import type { Project, ProjectInput } from '../types/project'
import { enqueueStorageWrite, waitForStorageWrites } from './storageWriteCoordinator'
import { hasUniqueStringIds } from './storageCollectionValidation'

export interface ProjectRepository {
  list(): Promise<Project[]>
  save(input: ProjectInput): Promise<Project>
  update(projectId: string, input: ProjectInput): Promise<Project | null>
  setArchived(projectId: string, archived: boolean): Promise<Project | null>
}

const storageKey = 'kampus-proje-demo-projects-v1'

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return ['id', 'createdAt', 'name', 'problem', 'goal', 'scope', 'advisor'].every(
    (key) => typeof candidate[key] === 'string',
  ) && (candidate.archivedAt === undefined || typeof candidate.archivedAt === 'string')
}

export function isValidProjectStorage(value: unknown): value is Project[] {
  return Array.isArray(value) && value.every(isProject) && hasUniqueStringIds(value)
}

export class LocalStorageProjectRepository implements ProjectRepository {
  async list(): Promise<Project[]> {
    await waitForStorageWrites(storageKey)
    return this.readAll()
  }

  async save(input: ProjectInput): Promise<Project> {
    return enqueueStorageWrite(storageKey, async () => {
      const project: Project = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }
      const projects = await this.readAll(true)
      window.localStorage.setItem(storageKey, JSON.stringify([project, ...projects]))
      return project
    })
  }

  async update(projectId: string, input: ProjectInput): Promise<Project | null> {
    return enqueueStorageWrite(storageKey, async () => {
      const projects = await this.readAll(true)
      const index = projects.findIndex((project) => project.id === projectId)
      if (index === -1 || projects[index].archivedAt) return null
      const updated: Project = { ...projects[index], ...input, id: projectId, createdAt: projects[index].createdAt }
      projects[index] = updated
      window.localStorage.setItem(storageKey, JSON.stringify(projects))
      return updated
    })
  }

  async setArchived(projectId: string, archived: boolean): Promise<Project | null> {
    return enqueueStorageWrite(storageKey, async () => {
      const projects = await this.readAll(true)
      const index = projects.findIndex((project) => project.id === projectId)
      if (index === -1) return null
      const updated: Project = { ...projects[index], archivedAt: archived ? new Date().toISOString() : undefined }
      projects[index] = updated
      window.localStorage.setItem(storageKey, JSON.stringify(projects))
      return updated
    })
  }


  private async readAll(strict = false): Promise<Project[]> {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        if (strict) throw new Error('Proje verileri güvenli biçimde okunamadı')
        return []
      }
      if (strict && !isValidProjectStorage(parsed)) throw new Error('Proje verileri güvenli biçimde okunamadı')
      return parsed.filter(isProject)
    } catch (error) {
      if (strict) {
        if (error instanceof Error && error.message === 'Proje verileri güvenli biçimde okunamadı') throw error
        throw new Error('Proje verileri güvenli biçimde okunamadı')
      }
      return []
    }
  }
}
