export interface ProjectInput {
  name: string
  problem: string
  goal: string
  scope: string
  advisor: string
}

export interface Project extends ProjectInput {
  id: string
  createdAt: string
  archivedAt?: string
}

export type ProjectValidationErrors = Partial<Record<keyof ProjectInput, string>>
