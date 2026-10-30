export const deliverableStatuses = ['planned', 'preparing', 'ready', 'submitted'] as const

export type DeliverableStatus = (typeof deliverableStatuses)[number]

export interface DeliverableInput {
  projectId: string
  title: string
  description: string
  dueDate?: string
  status: DeliverableStatus
  evidenceUrl?: string
  assigneeName?: string
}

export interface Deliverable extends DeliverableInput {
  id: string
  createdAt: string
  submittedAt?: string
}
