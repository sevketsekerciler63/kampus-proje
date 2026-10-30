import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageDeliverableRepository } from './deliverableRepository'

const deliverable = {
  projectId: 'project-a',
  title: 'Yeni dönem teslim planı',
  description: 'Teslim için gereken belgeleri ve kanıtları hazırla.',
  dueDate: undefined,
  status: 'planned' as const,
}

describe('LocalStorageDeliverableRepository', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
      { id: 'project-b', createdAt: '2026-10-01T09:00:00.000Z', name: 'B', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
    ]))
  })

  it('teslimleri proje kimliğine göre izole ederek kaydeder ve listeler', async () => {
    const repository = new LocalStorageDeliverableRepository()

    const first = await repository.save(deliverable)
    await repository.save({ ...deliverable, projectId: 'project-b', title: 'B projesi teslimi' })

    await expect(repository.listByProject('project-a')).resolves.toEqual([first])
    await expect(repository.listByProject('project-b')).resolves.toMatchObject([{ title: 'B projesi teslimi' }])
  })

  it('ready ve submitted durumları için http(s) kanıt URLsi ister ve submittedAt yaşam döngüsünü korur', async () => {
    const repository = new LocalStorageDeliverableRepository()

    await expect(repository.save({ ...deliverable, status: 'ready' })).rejects.toThrow('Kanıt URLsi')
    await expect(repository.save({ ...deliverable, status: 'ready', evidenceUrl: 'file:///proof' })).rejects.toThrow('Kanıt URLsi')
    const saved = await repository.save({ ...deliverable, status: 'ready', evidenceUrl: 'https://example.test/proof' })
    expect(saved.submittedAt).toBeUndefined()

    await expect(repository.updateStatus('project-a', saved.id, 'submitted')).rejects.toThrow('Kanıt URLsi')
    const submitted = await repository.updateStatus('project-a', saved.id, 'submitted', 'https://example.test/final')
    expect(submitted).toMatchObject({ status: 'submitted', evidenceUrl: 'https://example.test/final' })
    expect(submitted?.submittedAt).toSatisfy((value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)))

    await expect(repository.updateStatus('project-a', saved.id, 'preparing')).resolves.toMatchObject({ status: 'preparing', evidenceUrl: undefined, submittedAt: undefined })
  })

  it('ayrıntıları sadece doğru aktif projede günceller, dueDate alanını isteğe bağlı tutar', async () => {
    const repository = new LocalStorageDeliverableRepository()
    const saved = await repository.save(deliverable)

    const updated = await repository.update('project-a', saved.id, {
      ...deliverable,
      title: 'Güncellenmiş teslim planı',
      dueDate: '2026-10-20',
      status: 'preparing',
    })
    const wrongProject = await repository.update('project-b', saved.id, { ...deliverable, projectId: 'project-b', title: 'Yanlış proje' })

    expect(updated).toMatchObject({ title: 'Güncellenmiş teslim planı', dueDate: '2026-10-20', status: 'preparing' })
    expect(wrongProject).toBeNull()
    await expect(repository.update('project-a', saved.id, { ...deliverable, dueDate: undefined, status: 'planned' })).resolves.toMatchObject({ dueDate: undefined, status: 'planned' })
  })

  it('aktif olmayan parent projede yazmayı engeller ve ham teslim verisini değiştirmez', async () => {
    const repository = new LocalStorageDeliverableRepository()
    const saved = await repository.save(deliverable)
    const key = 'kampus-proje-demo-deliverables-v1'
    const raw = localStorage.getItem(key)
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))

    await expect(repository.updateStatus('project-a', saved.id, 'ready', 'https://example.test/proof')).rejects.toThrow('Teslim yalnız aktif bir projede güncellenebilir')
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it('bozuk yerel veriyi strict-write ile korur ve eşzamanlı kayıt kaybını önler', async () => {
    const key = 'kampus-proje-demo-deliverables-v1'
    const raw = JSON.stringify([{ id: 'bozuk-teslim', status: 'submitted' }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageDeliverableRepository().save(deliverable)).rejects.toThrow('Teslim verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)

    localStorage.removeItem(key)
    const first = new LocalStorageDeliverableRepository()
    const second = new LocalStorageDeliverableRepository()
    await Promise.all([
      first.save({ ...deliverable, title: 'Birinci teslim' }),
      second.save({ ...deliverable, title: 'İkinci teslim' }),
    ])
    expect(JSON.parse(localStorage.getItem(key) ?? '[]')).toHaveLength(2)
  })

  it('çalışma zamanında geçersiz teslim alanlarını storagea yazmaz', async () => {
    const repository = new LocalStorageDeliverableRepository()

    await expect(repository.save({ ...deliverable, title: 42 as never })).rejects.toThrow('Geçersiz teslim alanları')
    await expect(repository.save({ ...deliverable, dueDate: 42 as never })).rejects.toThrow('Geçersiz teslim alanları')
    expect(localStorage.getItem('kampus-proje-demo-deliverables-v1')).toBeNull()
  })

  it('opsiyonel sorumluyu kaydeder ve günceller, eski kaydı okur, bozuk sorumluyu reddeder', async () => {
    const key = 'kampus-proje-demo-deliverables-v1'
    const repository = new LocalStorageDeliverableRepository()
    const saved = await repository.save({ ...deliverable, assigneeName: 'Ayşe Yılmaz' })

    expect(JSON.parse(localStorage.getItem(key) ?? '[]')[0]).toMatchObject({ id: saved.id, assigneeName: 'Ayşe Yılmaz' })

    const updated = await repository.update('project-a', saved.id, {
      ...deliverable,
      assigneeName: 'Mehmet Demir',
    })
    expect(updated).toMatchObject({ assigneeName: 'Mehmet Demir' })
    expect(JSON.parse(localStorage.getItem(key) ?? '[]')[0]).toMatchObject({ id: saved.id, assigneeName: 'Mehmet Demir' })

    localStorage.setItem(key, JSON.stringify([{ ...saved, assigneeName: undefined }]))
    await expect(repository.listByProject('project-a')).resolves.toMatchObject([{ id: saved.id }])

    await expect(repository.save({ ...deliverable, assigneeName: 42 as never })).rejects.toThrow('Geçersiz teslim alanları')
    await expect(repository.update('project-a', saved.id, { ...deliverable, assigneeName: 42 as never })).resolves.toBeNull()

    localStorage.setItem(key, JSON.stringify([{ ...saved, assigneeName: 42 }]))
    await expect(repository.listByProject('project-a')).resolves.toEqual([])
  })
})
