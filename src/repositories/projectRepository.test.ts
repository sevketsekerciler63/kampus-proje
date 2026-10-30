import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageProjectRepository } from './projectRepository'

const project = {
  name: 'Kampüs Enerji Takip Sistemi',
  problem: 'Kampüs binalarındaki enerji tüketimi düzenli ve anlaşılır biçimde izlenemiyor.',
  goal: 'Tüketimi görünür kılıp tasarruf kararlarını destekleyen bir panel oluşturmak.',
  scope: 'Veri girişi ve aylık özet ekranı.',
  advisor: 'Dr. Ece Demir',
}

describe('LocalStorageProjectRepository', () => {
  beforeEach(() => localStorage.clear())

  it('kaydedilen projeyi yeni repository örneğinde de geri getirir', async () => {
    const firstRepository = new LocalStorageProjectRepository()
    await firstRepository.save(project)

    const reloadedRepository = new LocalStorageProjectRepository()
    const projects = await reloadedRepository.list()

    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject(project)
    expect(projects[0].id).toBeTruthy()
  })

  it('iki bağımsız repository örneğinin eşzamanlı proje kayıtlarını korur', async () => {
    const first = new LocalStorageProjectRepository()
    const second = new LocalStorageProjectRepository()

    await Promise.all([
      first.save({ ...project, name: 'Birinci proje' }),
      second.save({ ...project, name: 'İkinci proje' }),
    ])

    const stored = JSON.parse(localStorage.getItem('kampus-proje-demo-projects-v1') ?? '[]')
    expect(stored).toHaveLength(2)
  })

  it('proje bilgilerini kimlik ve oluşturulma zamanını koruyarak günceller', async () => {
    const repository = new LocalStorageProjectRepository()
    const saved = await repository.save(project)

    const updated = await repository.update(saved.id, { ...project, name: 'Güncellenmiş Enerji Takip Sistemi' })

    expect(updated).toMatchObject({ id: saved.id, createdAt: saved.createdAt, name: 'Güncellenmiş Enerji Takip Sistemi' })
  })

  it('projeyi silmeden arşivler ve yeniden aktif hale getirir', async () => {
    const repository = new LocalStorageProjectRepository()
    const saved = await repository.save(project)

    const archived = await repository.setArchived(saved.id, true)
    expect(archived?.archivedAt).toBeTruthy()
    expect(await repository.list()).toHaveLength(1)

    const restored = await repository.setArchived(saved.id, false)
    expect(restored?.archivedAt).toBeUndefined()
  })

  it('geçersiz yerel kayıt varken yazmayı reddeder ve ham veriyi silmez', async () => {
    const raw = JSON.stringify([
      { id: 'legacy-project', name: 'Eksik eski kayıt' },
      { id: 'valid-project', createdAt: '2026-10-01T09:00:00.000Z', ...project },
    ])
    localStorage.setItem('kampus-proje-demo-projects-v1', raw)

    await expect(new LocalStorageProjectRepository().save(project)).rejects.toThrow('Proje verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem('kampus-proje-demo-projects-v1')).toBe(raw)
  })

  it('arşivlenmiş projenin bilgilerini güncellemez', async () => {
    const repository = new LocalStorageProjectRepository()
    const saved = await repository.save(project)
    await repository.setArchived(saved.id, true)

    await expect(repository.update(saved.id, { ...project, name: 'Değişmemeli' })).resolves.toBeNull()
  })
})
