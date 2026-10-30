import { taskPriorities, taskStatuses, type Task, type TaskInput, type TaskPriority, type TaskStatus } from '../types/task'
import { enqueueStorageWrite, waitForStorageWrites } from './storageWriteCoordinator'
import { activeProjectStorageKey, assertActiveProject } from './activeProjectGuard'
import { hasUniqueStringIds } from './storageCollectionValidation'

export interface TaskRepository {
  listByProject(projectId: string): Promise<Task[]>
  save(input: TaskInput): Promise<Task>
  update(projectId: string, taskId: string, input: TaskInput): Promise<Task | null>
  updateStatus(projectId: string, taskId: string, status: TaskStatus): Promise<Task | null>
}

const storageKey = 'kampus-proje-demo-tasks-v1'


function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && taskStatuses.includes(value as TaskStatus)
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && taskPriorities.includes(value as TaskPriority)
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return ['id', 'createdAt', 'projectId', 'title', 'description', 'assigneeName'].every(
    (key) => typeof candidate[key] === 'string',
  ) && isTaskStatus(candidate.status)
    && (candidate.dueDate === undefined || typeof candidate.dueDate === 'string')
    && (candidate.priority === undefined || isTaskPriority(candidate.priority))
}

export function isValidTaskStorage(value: unknown): boolean {
  return Array.isArray(value) && value.every(isTask) && hasUniqueStringIds(value)
}

export class LocalStorageTaskRepository implements TaskRepository {
  private readonly isKnownActiveProject?: (projectId: string) => boolean

  constructor(isKnownActiveProject?: (projectId: string) => boolean) {
    this.isKnownActiveProject = isKnownActiveProject
  }

  async listByProject(projectId: string): Promise<Task[]> {
    await waitForStorageWrites(storageKey)
    return (await this.readAll()).filter((task) => task.projectId === projectId)
  }

  async save(input: TaskInput): Promise<Task> {
    if (!isTaskStatus(input.status) || (input.priority !== undefined && !isTaskPriority(input.priority))) throw new Error('Geçersiz görev durumu veya önceliği')
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(input.projectId, 'Görev yalnız aktif bir projeye bağlanabilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const task: Task = {
          ...input,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }
        const tasks = await this.readAll(true)
        window.localStorage.setItem(storageKey, JSON.stringify([task, ...tasks]))
        return task
      })
    })
  }

  async updateStatus(projectId: string, taskId: string, status: TaskStatus): Promise<Task | null> {
    if (!isTaskStatus(status)) return null
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(projectId, 'Görev yalnız aktif bir projede güncellenebilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const tasks = await this.readAll(true)
        const taskIndex = tasks.findIndex((task) => task.id === taskId && task.projectId === projectId)
        if (taskIndex === -1) return null

        const updated = { ...tasks[taskIndex], status }
        tasks[taskIndex] = updated
        window.localStorage.setItem(storageKey, JSON.stringify(tasks))
        return updated
      })
    })
  }

  async update(projectId: string, taskId: string, input: TaskInput): Promise<Task | null> {
    if (!isTaskStatus(input.status) || (input.priority !== undefined && !isTaskPriority(input.priority))) return null
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(projectId, 'Görev yalnız aktif bir projede güncellenebilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const tasks = await this.readAll(true)
        const taskIndex = tasks.findIndex((task) => task.id === taskId && task.projectId === projectId)
        if (taskIndex === -1 || input.projectId !== projectId) return null

        const updated: Task = {
          ...tasks[taskIndex],
          ...input,
          id: tasks[taskIndex].id,
          projectId,
          createdAt: tasks[taskIndex].createdAt,
        }
        tasks[taskIndex] = updated
        window.localStorage.setItem(storageKey, JSON.stringify(tasks))
        return updated
      })
    })
  }


  private async readAll(strict = false): Promise<Task[]> {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || (strict && !isValidTaskStorage(parsed))) {
        if (strict) throw new Error('Görev verileri güvenli biçimde okunamadı')
        return []
      }
      return parsed.filter(isTask)
    } catch (error) {
      if (strict) {
        if (error instanceof Error && error.message === 'Görev verileri güvenli biçimde okunamadı') throw error
        throw new Error('Görev verileri güvenli biçimde okunamadı')
      }
      return []
    }
  }
}
