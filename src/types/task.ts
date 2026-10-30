export const taskStatuses = ['todo', 'in_progress', 'completed'] as const

export type TaskStatus = (typeof taskStatuses)[number]
export const taskPriorities = ['low', 'medium', 'high'] as const
export type TaskPriority = (typeof taskPriorities)[number]

export interface TaskInput {
  projectId: string
  title: string
  description: string
  assigneeName: string
  dueDate?: string
  status: TaskStatus
  priority?: TaskPriority
}

export interface Task extends TaskInput {
  id: string
  createdAt: string
}

export type TaskValidationErrors = Partial<Record<'title' | 'description' | 'assigneeName', string>>
