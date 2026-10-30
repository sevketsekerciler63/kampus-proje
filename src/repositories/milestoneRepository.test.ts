import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageMilestoneRepository } from './milestoneRepository'

const analysisMilestone = {
  projectId: 'project-a',
  title: 'Gereksinim analizini tamamla',
  description: 'Kullanıcı ihtiyaçlarını ve sistem sınırlarını belgeleyin.',
  dueDate: '2026-10-15',
  status: 'planned' as const,
}

describe('LocalStorageMilestoneRepository', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
      { id: 'project-b', createdAt: '2026-10-01T09:00:00.000Z', name: 'B', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
    ]))
  })

  it('var olmayan projeye aşama kaydetmez', async () => {
    await expect(new LocalStorageMilestoneRepository().save({ ...analysisMilestone, projectId: 'missing-project' })).rejects.toThrow('Proje aşaması yalnız aktif bir projeye bağlanabilir')
  })

  it('arşivlenmiş projeye aşama kaydetmez', async () => {
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))
    await expect(new LocalStorageMilestoneRepository().save(analysisMilestone)).rejects.toThrow('Proje aşaması yalnız aktif bir projeye bağlanabilir')
  })

  it('kilometre taşlarını proje kimliğine göre izole eder', async () => {
    const repository = new LocalStorageMilestoneRepository()
    await repository.save(analysisMilestone)
    await repository.save({ ...analysisMilestone, projectId: 'project-b', title: 'B projesi testi' })

    expect(await repository.listByProject('project-a')).toMatchObject([{ title: 'Gereksinim analizini tamamla' }])
    expect(await repository.listByProject('project-b')).toMatchObject([{ title: 'B projesi testi' }])
  })

  it('durumu yalnız doğru proje içindeki kilometre taşı için günceller', async () => {
    const repository = new LocalStorageMilestoneRepository()
    const saved = await repository.save(analysisMilestone)

    const updated = await repository.updateStatus('project-a', saved.id, 'completed')
    const wrongProject = await repository.updateStatus('project-b', saved.id, 'in_progress')

    expect(updated?.status).toBe('completed')
    expect(updated?.completedAt).toBeTruthy()
    expect(wrongProject).toBeNull()
  })

  it('arşivlenmiş projenin kilometre taşı durumunu güncellemez', async () => {
    const repository = new LocalStorageMilestoneRepository()
    const saved = await repository.save(analysisMilestone)
    const milestoneKey = 'kampus-proje-demo-milestones-v1'
    const raw = localStorage.getItem(milestoneKey)
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))

    await expect(repository.updateStatus('project-a', saved.id, 'completed')).rejects.toThrow('Proje aşaması yalnız aktif bir projeye bağlanabilir')
    expect(localStorage.getItem(milestoneKey)).toBe(raw)
  })

  it('tamamlanmış olarak kaydedilen proje aşamasına geçerli tamamlanma zamanı ekler', async () => {
    const repository = new LocalStorageMilestoneRepository()

    const saved = await repository.save({ ...analysisMilestone, status: 'completed' })

    expect(saved).toMatchObject({ status: 'completed' })
    expect(saved.completedAt).toSatisfy((value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    await expect(repository.listByProject('project-a')).resolves.toEqual([saved])
    await expect(repository.updateStatus('project-a', saved.id, 'in_progress')).resolves.toMatchObject({ status: 'in_progress', completedAt: undefined })
  })

  it('eşzamanlı kayıtları veri kaybetmeden korur', async () => {
    const repository = new LocalStorageMilestoneRepository()
    await Promise.all([
      repository.save(analysisMilestone),
      repository.save({ ...analysisMilestone, title: 'Arayüz prototipini tamamla' }),
    ])

    expect(await repository.listByProject('project-a')).toHaveLength(2)
  })
  it('iki bağımsız repository örneğinin eşzamanlı aşama kayıtlarını korur', async () => {
    const first = new LocalStorageMilestoneRepository()
    const second = new LocalStorageMilestoneRepository()

    await Promise.all([
      first.save(analysisMilestone),
      second.save({ ...analysisMilestone, title: 'Arayüz prototipini tamamla' }),
    ])

    const stored = JSON.parse(localStorage.getItem('kampus-proje-demo-milestones-v1') ?? '[]')
    expect(stored).toHaveLength(2)
  })

  it('geçersiz yerel kayıt varken yeni yazmayla ham veriyi ezmez', async () => {
    const key = 'kampus-proje-demo-milestones-v1'
    const raw = JSON.stringify([{ id: 'bozuk-asama', status: 'invalid' }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageMilestoneRepository().save(analysisMilestone)).rejects.toThrow('Proje aşaması verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })


  it('geçersiz çalışma zamanı durumunu yazmaz', async () => {
    const repository = new LocalStorageMilestoneRepository()
    const saved = await repository.save(analysisMilestone)
    const raw = localStorage.getItem('kampus-proje-demo-milestones-v1')

    await expect(repository.updateStatus('project-a', saved.id, 'invalid' as never)).resolves.toBeNull()
    expect(localStorage.getItem('kampus-proje-demo-milestones-v1')).toBe(raw)
  })

  it('tamamlanma zamanı durumla çelişen kayıt varken ham veriyi korur', async () => {
    const key = 'kampus-proje-demo-milestones-v1'
    const valid = { ...analysisMilestone, id: 'valid', createdAt: '2026-10-01T12:00:00.000Z' }
    const raw = JSON.stringify([valid, { ...valid, id: 'broken', status: 'completed' }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageMilestoneRepository().updateStatus('project-a', 'valid', 'in_progress')).rejects.toThrow('Proje aşaması verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })


})
