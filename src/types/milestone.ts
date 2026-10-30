export const milestoneStatuses = ['planned', 'in_progress', 'completed'] as const
export type MilestoneStatus = (typeof milestoneStatuses)[number]

export interface MilestoneInput {
  projectId: string
  title: string
  description: string
  dueDate: string
  status: MilestoneStatus
}

export interface Milestone extends MilestoneInput {
  id: string
  createdAt: string
  completedAt?: string
}

export type MilestoneValidationErrors = Partial<Record<'title' | 'description' | 'dueDate', string>>
