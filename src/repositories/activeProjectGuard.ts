import { isValidProjectStorage } from './projectRepository'

const projectStorageKey = 'kampus-proje-demo-projects-v1'

export function assertActiveProject(
  projectId: string,
  errorMessage: string,
  isKnownActiveProject?: (projectId: string) => boolean,
): void {
  try {
    const raw = window.localStorage.getItem(projectStorageKey)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!isValidProjectStorage(parsed)) throw new Error()
    const project = parsed.find((item) => item.id === projectId)
    if (project) {
      if (project.archivedAt !== undefined) throw new Error()
      return
    }
    if (isKnownActiveProject?.(projectId)) return
    throw new Error()
  } catch {
    throw new Error(errorMessage)
  }
}

export const activeProjectStorageKey = projectStorageKey
