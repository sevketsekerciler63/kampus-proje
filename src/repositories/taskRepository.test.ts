import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageTaskRepository } from './taskRepository'

const task = {
  projectId: 'project-a',
  title: 'Veri giriş ekranını tasarla',
  description: 'İlk veri giriş akışının alanlarını ve hata durumlarını tanımla.',
  assigneeName: 'Demo üye: Ayşe Kaya',
  dueDate: undefined,
  status: 'todo' as const,
}

describe('LocalStorageTaskRepository', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
      { id: 'project-b', createdAt: '2026-10-01T09:00:00.000Z', name: 'B', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
    ]))
  })

  it('var olmayan projeye görev kaydetmez', async () => {
    const repository = new LocalStorageTaskRepository()

    await expect(repository.save({ ...task, projectId: 'missing-project' })).rejects.toThrow('Görev yalnız aktif bir projeye bağlanabilir')
    expect(localStorage.getItem('kampus-proje-demo-tasks-v1')).toBeNull()
  })

  it('arşivlenmiş projeye görev kaydetmez', async () => {
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))

    await expect(new LocalStorageTaskRepository().save(task)).rejects.toThrow('Görev yalnız aktif bir projeye bağlanabilir')
    expect(localStorage.getItem('kampus-proje-demo-tasks-v1')).toBeNull()
  })

  it('mükerrer proje kimlikleri varken alt kayıt yazımını reddeder', async () => {
    const duplicateProject = { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' }
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([duplicateProject, duplicateProject]))

    await expect(new LocalStorageTaskRepository().save(task)).rejects.toThrow('Görev yalnız aktif bir projeye bağlanabilir')
    expect(localStorage.getItem('kampus-proje-demo-tasks-v1')).toBeNull()
  })

  it('demo fallback storage içindeki arşivlenmiş proje kaydını geçersiz kılamaz', async () => {
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'demo-yesil-kampus', createdAt: '2026-10-01T09:00:00.000Z', name: 'Demo', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))
    const repository = new LocalStorageTaskRepository((projectId) => projectId === 'demo-yesil-kampus')

    await expect(repository.save({ ...task, projectId: 'demo-yesil-kampus' })).rejects.toThrow('Görev yalnız aktif bir projeye bağlanabilir')
    expect(localStorage.getItem('kampus-proje-demo-tasks-v1')).toBeNull()
  })

  it('bozuk JSON verisini boş liste olarak döndürür', async () => {
    localStorage.setItem('kampus-proje-demo-tasks-v1', '{bozuk-json')

    await expect(new LocalStorageTaskRepository().listByProject('project-a')).resolves.toEqual([])
  })

  it('kısmen geçersiz kayıtları filtreleyip geçerli görevleri döndürür', async () => {
    localStorage.setItem('kampus-proje-demo-tasks-v1', JSON.stringify([
      { id: 'valid-1', createdAt: '2026-10-01T09:00:00.000Z', ...task },
      { id: 'invalid-1', createdAt: '2026-10-01T09:00:00.000Z', ...task, status: 'archived' },
      { id: 'invalid-2', createdAt: '2026-10-01T09:00:00.000Z', ...task, dueDate: 42 },
    ]))

    await expect(new LocalStorageTaskRepository().listByProject('project-a')).resolves.toMatchObject([
      {
        id: 'valid-1',
        projectId: 'project-a',
        title: 'Veri giriş ekranını tasarla',
        description: 'İlk veri giriş akışının alanlarını ve hata durumlarını tanımla.',
        assigneeName: 'Demo üye: Ayşe Kaya',
        status: 'todo',
      },
    ])
  })

  it('önceliği olmayan eski görevi korur, geçersiz öncelikli kaydı yüklemez', async () => {
    localStorage.setItem('kampus-proje-demo-tasks-v1', JSON.stringify([
      { id: 'legacy', createdAt: '2026-10-01T09:00:00.000Z', ...task },
      { id: 'invalid-priority', createdAt: '2026-10-01T09:00:00.000Z', ...task, priority: 'urgent' },
    ]))

    const loaded = await new LocalStorageTaskRepository().listByProject('project-a')
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({ id: 'legacy' })
    expect(loaded[0].priority).toBeUndefined()
  })

  it('görevleri yalnız ait oldukları proje için listeler ve günceller', async () => {
    const repository = new LocalStorageTaskRepository()
    const first = await repository.save(task)
    const second = await repository.save({ ...task, projectId: 'project-b', title: 'Rapor taslağını yaz' })

    await repository.updateStatus('project-a', first.id, 'completed')
    await repository.updateStatus('project-a', second.id, 'in_progress')

    await expect(repository.listByProject('project-a')).resolves.toMatchObject([
      { id: first.id, status: 'completed' },
    ])
    await expect(repository.listByProject('project-b')).resolves.toMatchObject([
      { id: second.id, status: 'todo' },
    ])
  })

  it('eşzamanlı kayıt isteklerini sıraya alıp iki görevi de korur', async () => {
    const repository = new LocalStorageTaskRepository()

    await Promise.all([
      repository.save({ ...task, title: 'Birinci görev' }),
      repository.save({ ...task, title: 'İkinci görev' }),
    ])

    const tasks = await repository.listByProject('project-a')
    expect(tasks).toHaveLength(2)
    expect(tasks.map((item) => item.title)).toEqual(expect.arrayContaining(['Birinci görev', 'İkinci görev']))
  })

  it('iki bağımsız repository örneğinin eşzamanlı kayıtlarını korur', async () => {
    const first = new LocalStorageTaskRepository()
    const second = new LocalStorageTaskRepository()

    await Promise.all([
      first.save({ ...task, title: 'Birinci görev' }),
      second.save({ ...task, title: 'İkinci görev' }),
    ])

    const stored = JSON.parse(localStorage.getItem('kampus-proje-demo-tasks-v1') ?? '[]')
    expect(stored).toHaveLength(2)
  })

  it('görev ayrıntılarını yalnız doğru proje içinde günceller', async () => {
    const repository = new LocalStorageTaskRepository()
    const saved = await repository.save(task)

    const updated = await repository.update('project-a', saved.id, {
      ...task,
      title: 'Güncellenmiş görev başlığı',
      description: 'Görevin açıklaması düzenleme ekranından güncellendi.',
      assigneeName: 'Demo üye: Mehmet Aras',
      dueDate: '2026-10-12',
      status: 'in_progress',
    })
    const wrongProject = await repository.update('project-b', saved.id, { ...task, title: 'Yanlış proje' })

    expect(updated).toMatchObject({ title: 'Güncellenmiş görev başlığı', assigneeName: 'Demo üye: Mehmet Aras', dueDate: '2026-10-12', status: 'in_progress' })
    expect(wrongProject).toBeNull()
  })
  it('geçersiz yerel kayıt varken yeni yazmayla ham veriyi ezmez', async () => {
    const key = 'kampus-proje-demo-tasks-v1'
    const raw = JSON.stringify([{ id: 'bozuk-gorev', status: 'invalid' }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageTaskRepository().save(task)).rejects.toThrow('Görev verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })


  it('arşivlenmiş projenin görev ayrıntılarını güncellemez', async () => {
    const repository = new LocalStorageTaskRepository()
    const saved = await repository.save(task)
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))
    const raw = localStorage.getItem('kampus-proje-demo-tasks-v1')

    await expect(repository.update('project-a', saved.id, { ...task, title: 'Arşivden sonra değiştirilmemeli' })).rejects.toThrow('Görev yalnız aktif bir projede güncellenebilir')
    expect(localStorage.getItem('kampus-proje-demo-tasks-v1')).toBe(raw)
  })

  it('arşivlenmiş projenin görev durumunu güncellemez', async () => {
    const repository = new LocalStorageTaskRepository()
    const saved = await repository.save(task)
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))
    const raw = localStorage.getItem('kampus-proje-demo-tasks-v1')

    await expect(repository.updateStatus('project-a', saved.id, 'completed')).rejects.toThrow('Görev yalnız aktif bir projede güncellenebilir')
    expect(localStorage.getItem('kampus-proje-demo-tasks-v1')).toBe(raw)
  })

  it('geçersiz çalışma zamanı durumunu yazmaz', async () => {
    const repository = new LocalStorageTaskRepository()
    const saved = await repository.save(task)
    const raw = localStorage.getItem('kampus-proje-demo-tasks-v1')

    await expect(repository.updateStatus('project-a', saved.id, 'invalid' as never)).resolves.toBeNull()
    expect(localStorage.getItem('kampus-proje-demo-tasks-v1')).toBe(raw)
  })


})
