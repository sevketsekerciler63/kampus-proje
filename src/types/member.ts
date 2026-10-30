export interface MemberInput {
  projectId: string
  name: string
  email: string
  responsibility: string
}

export interface Member extends MemberInput {
  id: string
  createdAt: string
}

export type MemberValidationErrors = Partial<Record<'name' | 'email' | 'responsibility', string>>
