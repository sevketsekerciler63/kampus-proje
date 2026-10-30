import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageMemberRepository } from './memberRepository'

const ayse = {
  projectId: 'project-a',
  name: 'Ayşe Kaya',
  email: 'ayse@example.edu',
  responsibility: 'Arayüz geliştirme',
}

describe('LocalStorageMemberRepository', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
      { id: 'project-b', createdAt: '2026-10-01T09:00:00.000Z', name: 'B', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
    ]))
  })

  it('var olmayan projeye ekip üyesi kaydetmez', async () => {
    await expect(new LocalStorageMemberRepository().save({ ...ayse, projectId: 'missing-project' })).rejects.toThrow('Ekip üyesi yalnız aktif bir projeye bağlanabilir')
    expect(localStorage.getItem('kampus-proje-demo-members-v1')).toBeNull()
  })

  it('arşivlenmiş projeye ekip üyesi kaydetmez', async () => {
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))

    await expect(new LocalStorageMemberRepository().save(ayse)).rejects.toThrow('Ekip üyesi yalnız aktif bir projeye bağlanabilir')
    expect(localStorage.getItem('kampus-proje-demo-members-v1')).toBeNull()
  })

  it('üyeleri proje kimliğine göre izole eder', async () => {
    const repository = new LocalStorageMemberRepository()

    await repository.save(ayse)
    await repository.save({ ...ayse, projectId: 'project-b', name: 'Mehmet Aras', email: 'mehmet@example.edu' })

    expect(await repository.listByProject('project-a')).toMatchObject([{ name: 'Ayşe Kaya', projectId: 'project-a' }])
    expect(await repository.listByProject('project-b')).toMatchObject([{ name: 'Mehmet Aras', projectId: 'project-b' }])
  })

  it('aynı projede aynı e-posta adresini ikinci kez kaydetmez', async () => {
    const repository = new LocalStorageMemberRepository()

    await repository.save(ayse)

    await expect(repository.save({ ...ayse, name: 'Ayşe Tekrar' })).rejects.toThrow('Bu e-posta adresi projede zaten kayıtlı.')
    expect(await repository.listByProject('project-a')).toHaveLength(1)
  })

  it('eşzamanlı üye kayıtlarını veri kaybetmeden korur', async () => {
    const repository = new LocalStorageMemberRepository()

    await Promise.all([
      repository.save(ayse),
      repository.save({ ...ayse, name: 'Mehmet Aras', email: 'mehmet@example.edu' }),
    ])

    expect(await repository.listByProject('project-a')).toHaveLength(2)
  })
  it('iki bağımsız repository örneğinin eşzamanlı üye kayıtlarını korur', async () => {
    const first = new LocalStorageMemberRepository()
    const second = new LocalStorageMemberRepository()

    await Promise.all([
      first.save(ayse),
      second.save({ ...ayse, name: 'Mehmet Aras', email: 'mehmet@example.edu' }),
    ])

    const stored = JSON.parse(localStorage.getItem('kampus-proje-demo-members-v1') ?? '[]')
    expect(stored).toHaveLength(2)
  })

  it('geçersiz yerel kayıt varken yeni yazmayla ham veriyi ezmez', async () => {
    const key = 'kampus-proje-demo-members-v1'
    const raw = JSON.stringify([{ id: 'bozuk-uye' }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageMemberRepository().save(ayse)).rejects.toThrow('Ekip verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })


})
