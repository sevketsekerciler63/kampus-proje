import type { Member, MemberInput } from '../types/member'
import { enqueueStorageWrite, waitForStorageWrites } from './storageWriteCoordinator'
import { activeProjectStorageKey, assertActiveProject } from './activeProjectGuard'
import { hasUniqueStringIds } from './storageCollectionValidation'

export interface MemberRepository {
  listByProject(projectId: string): Promise<Member[]>
  save(input: MemberInput): Promise<Member>
}

const storageKey = 'kampus-proje-demo-members-v1'

function isMember(value: unknown): value is Member {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return ['id', 'createdAt', 'projectId', 'name', 'email', 'responsibility'].every(
    (key) => typeof candidate[key] === 'string',
  )
}

export function isValidMemberStorage(value: unknown): boolean {
  return Array.isArray(value) && value.every(isMember) && hasUniqueStringIds(value)
}

export class LocalStorageMemberRepository implements MemberRepository {
  private readonly isKnownActiveProject?: (projectId: string) => boolean

  constructor(isKnownActiveProject?: (projectId: string) => boolean) {
    this.isKnownActiveProject = isKnownActiveProject
  }

  async listByProject(projectId: string): Promise<Member[]> {
    await waitForStorageWrites(storageKey)
    return (await this.readAll()).filter((member) => member.projectId === projectId)
  }

  async save(input: MemberInput): Promise<Member> {
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(input.projectId, 'Ekip üyesi yalnız aktif bir projeye bağlanabilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
        const members = await this.readAll(true)
        const normalizedEmail = input.email.trim().toLocaleLowerCase('tr-TR')
        const duplicate = members.some(
          (member) => member.projectId === input.projectId && member.email.toLocaleLowerCase('tr-TR') === normalizedEmail,
        )
        if (duplicate) throw new Error('Bu e-posta adresi projede zaten kayıtlı.')

        const member: Member = {
          ...input,
          email: normalizedEmail,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }
        window.localStorage.setItem(storageKey, JSON.stringify([member, ...members]))
        return member
      })
    })
  }


  private async readAll(strict = false): Promise<Member[]> {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || (strict && !isValidMemberStorage(parsed))) {
        if (strict) throw new Error('Ekip verileri güvenli biçimde okunamadı')
        return []
      }
      return parsed.filter(isMember)
    } catch (error) {
      if (strict) {
        if (error instanceof Error && error.message === 'Ekip verileri güvenli biçimde okunamadı') throw error
        throw new Error('Ekip verileri güvenli biçimde okunamadı')
      }
      return []
    }
  }
}
