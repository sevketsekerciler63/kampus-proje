export const reportStatuses = ['draft', 'submitted', 'reviewed', 'changes_requested'] as const

export type ReportStatus = (typeof reportStatuses)[number]
export type FeedbackDecision = Extract<ReportStatus, 'reviewed' | 'changes_requested'>

export interface ReportInput {
  projectId: string
  weekStart: string
  completedThisWeek: string
  blockers: string
  nextWeekPlan: string
  evidenceUrl?: string
}

export interface Feedback {
  decision: FeedbackDecision
  message: string
  createdAt: string
}

export interface Report extends ReportInput {
  id: string
  status: ReportStatus
  version: number
  chainId?: string
  previousVersionId?: string
  createdAt: string
  submittedAt?: string
  feedback?: Feedback
}

export type ReportValidationErrors = Partial<Record<'weekStart' | 'completedThisWeek' | 'blockers' | 'nextWeekPlan' | 'evidenceUrl', string>>
