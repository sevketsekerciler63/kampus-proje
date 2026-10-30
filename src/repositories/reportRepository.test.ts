import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageReportRepository } from './reportRepository'

const draft = {
  projectId: 'project-a',
  weekStart: '2026-09-28',
  completedThisWeek: 'Ölçüm ekranı için ilk akış tamamlandı.',
  blockers: 'Engel yok.',
  nextWeekPlan: 'Danışman sunumu için ekranları düzenleyeceğim.',
  evidenceUrl: 'https://example.edu/kanit',
}

describe('LocalStorageReportRepository', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
      { id: 'project-b', createdAt: '2026-10-01T09:00:00.000Z', name: 'B', problem: 'P', goal: 'G', scope: 'S', advisor: 'D' },
    ]))
  })

  it('var olmayan projeye rapor taslağı kaydetmez', async () => {
    await expect(new LocalStorageReportRepository().createDraft({ ...draft, projectId: 'missing-project' })).rejects.toThrow('Rapor yalnız aktif bir projeye bağlanabilir')
  })

  it('arşivlenmiş projeye rapor taslağı kaydetmez', async () => {
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))
    await expect(new LocalStorageReportRepository().createDraft(draft)).rejects.toThrow('Rapor yalnız aktif bir projeye bağlanabilir')
  })

  it('raporları yalnız ait oldukları proje için listeler', async () => {
    const repository = new LocalStorageReportRepository()
    const first = await repository.createDraft(draft)
    const second = await repository.createDraft({ ...draft, projectId: 'project-b', weekStart: '2026-10-05' })

    await expect(repository.listByProject('project-a')).resolves.toEqual([first])
    await expect(repository.listByProject('project-b')).resolves.toEqual([second])
  })

  it('teslim edilen raporu sürümünü koruyarak yeni sürüm olarak kaydeder', async () => {
    const repository = new LocalStorageReportRepository()
    const first = await repository.createDraft(draft)
    const submitted = await repository.submit('project-a', first.id)
    const revision = await repository.createDraft({ ...draft, completedThisWeek: 'Geri bildirime göre akış güncellendi.' }, submitted?.id)

    expect(submitted).toMatchObject({ id: first.id, status: 'submitted', version: 1 })
    expect(revision).toMatchObject({ status: 'draft', version: 2, previousVersionId: first.id })
    await expect(repository.listByProject('project-a')).resolves.toEqual([revision, submitted])
  })

  it('arşivlenmiş projenin taslak raporunu teslim etmez', async () => {
    const repository = new LocalStorageReportRepository()
    const report = await repository.createDraft(draft)
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))
    const raw = localStorage.getItem('kampus-proje-demo-reports-v1')

    await expect(repository.submit('project-a', report.id)).rejects.toThrow('Rapor yalnız aktif bir projede teslim edilebilir')
    expect(localStorage.getItem('kampus-proje-demo-reports-v1')).toBe(raw)
  })

  it('geçersiz durum geçişlerinde raporu değiştirmez ve başarı sonucu döndürmez', async () => {
    const repository = new LocalStorageReportRepository()
    const report = await repository.createDraft(draft)

    await expect(repository.review('project-a', report.id, 'reviewed', 'Erken karar.')).resolves.toBeNull()
    const submitted = await repository.submit('project-a', report.id)
    await expect(repository.submit('project-a', report.id)).resolves.toBeNull()
    await repository.review('project-a', report.id, 'reviewed', 'Uygun karar.')
    await expect(repository.review('project-a', report.id, 'changes_requested', 'İkinci karar.')).resolves.toBeNull()

    const [stored] = await repository.listByProject('project-a')
    expect(submitted).toMatchObject({ status: 'submitted' })
    expect(stored).toMatchObject({ status: 'reviewed', feedback: { decision: 'reviewed', message: 'Uygun karar.' } })
  })

  it('danışman demo kararını geri bildirim metniyle rapora ekler', async () => {
    const repository = new LocalStorageReportRepository()
    const report = await repository.createDraft(draft)
    await repository.submit('project-a', report.id)

    const reviewed = await repository.review('project-a', report.id, 'changes_requested', 'Kanıt bağlantısına kısa açıklama ekleyin.')

    expect(reviewed).toMatchObject({ status: 'changes_requested' })
    expect(reviewed?.feedback).toMatchObject({ decision: 'changes_requested', message: 'Kanıt bağlantısına kısa açıklama ekleyin.' })
  })

  it('arşivlenmiş projenin teslim edilmiş raporunu incelemez', async () => {
    const repository = new LocalStorageReportRepository()
    const report = await repository.createDraft(draft)
    await repository.submit('project-a', report.id)
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([
      { id: 'project-a', createdAt: '2026-10-01T09:00:00.000Z', name: 'A', problem: 'P', goal: 'G', scope: 'S', advisor: 'D', archivedAt: '2026-10-02T09:00:00.000Z' },
    ]))
    const raw = localStorage.getItem('kampus-proje-demo-reports-v1')

    await expect(repository.review('project-a', report.id, 'reviewed', 'Arşiv sonrası karar.')).rejects.toThrow('Rapor yalnız aktif bir projede incelenebilir')
    expect(localStorage.getItem('kampus-proje-demo-reports-v1')).toBe(raw)
  })

  it('geçersiz tarihli veya rapor durumuyla çelişen geri bildirimi yüklemez', async () => {
    const base = {
      ...draft,
      id: 'report-invalid',
      status: 'reviewed',
      version: 1,
      createdAt: '2026-10-01T12:00:00.000Z',
    }
    localStorage.setItem('kampus-proje-demo-reports-v1', JSON.stringify([
      { ...base, feedback: { decision: 'reviewed', message: 'Tamam.', createdAt: 'geçersiz-tarih' } },
      { ...base, id: 'report-conflict', feedback: { decision: 'changes_requested', message: 'Çelişkili.', createdAt: '2026-10-01T12:30:00.000Z' } },
    ]))

    await expect(new LocalStorageReportRepository().listByProject('project-a')).resolves.toEqual([])
  })

  it('eşzamanlı taslak kayıtlarını seri hale getirip ikisini de korur', async () => {
    const repository = new LocalStorageReportRepository()

    await Promise.all([
      repository.createDraft({ ...draft, completedThisWeek: 'Birinci taslak.' }),
      repository.createDraft({ ...draft, completedThisWeek: 'İkinci taslak.' }),
    ])

    const reports = await repository.listByProject('project-a')
    expect(reports).toHaveLength(2)
    expect(reports.map((report) => report.completedThisWeek)).toEqual(expect.arrayContaining(['Birinci taslak.', 'İkinci taslak.']))
    expect(new Set(reports.map((report) => report.chainId)).size).toBe(2)
  })

  it('iki bağımsız repository örneğinin eşzamanlı rapor taslaklarını korur', async () => {
    const first = new LocalStorageReportRepository()
    const second = new LocalStorageReportRepository()

    await Promise.all([
      first.createDraft({ ...draft, completedThisWeek: 'Birinci taslak.' }),
      second.createDraft({ ...draft, completedThisWeek: 'İkinci taslak.' }),
    ])

    const stored = JSON.parse(localStorage.getItem('kampus-proje-demo-reports-v1') ?? '[]')
    expect(stored).toHaveLength(2)
  })

  it('eski bir sürümden ikinci dal oluşturulmasını ve hafta değişimini reddeder', async () => {
    const repository = new LocalStorageReportRepository()
    const first = await repository.createDraft(draft)
    await repository.createDraft({ ...draft, completedThisWeek: 'İkinci sürüm.' }, first.id)

    await expect(repository.createDraft({ ...draft, completedThisWeek: 'Çakışan ikinci sürüm.' }, first.id))
      .rejects.toThrow('En güncel rapor sürümünden devam edin.')
    await expect(repository.createDraft({ ...draft, weekStart: '2026-10-05' }, first.id))
      .rejects.toThrow('Yeni sürüm aynı rapor haftasını korumalı.')
  })

  it('sürümleme öncesi raporu güvenli varsayılanlarla taşır ve sonraki yazmada korur', async () => {
    const key = 'kampus-proje-demo-reports-v1'
    const legacy = {
      ...draft,
      id: 'legacy-report',
      createdAt: '2026-09-30T12:00:00.000Z',
    }
    localStorage.setItem(key, JSON.stringify([legacy]))
    const repository = new LocalStorageReportRepository()

    await expect(repository.listByProject('project-a')).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-report', status: 'draft', version: 1, chainId: 'legacy-report' }),
    ])

    await repository.createDraft({ ...draft, weekStart: '2026-10-05' })
    const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<Record<string, unknown>>
    expect(stored.find((report) => report.id === 'legacy-report')).toMatchObject({ status: 'draft', version: 1, chainId: 'legacy-report' })
  })

  it('bilinmeyen alan taşıyan eski görünümlü kaydı taşımayıp ham veriyi korur', async () => {
    const key = 'kampus-proje-demo-reports-v1'
    const raw = JSON.stringify([{
      ...draft,
      id: 'ambiguous-legacy',
      createdAt: '2026-09-30T12:00:00.000Z',
      futureMetadata: 'kaybolmamalı',
    }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageReportRepository().createDraft({ ...draft, weekStart: '2026-10-05' }))
      .rejects.toThrow('Rapor verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it.each([0, -1, 1.5])('geçersiz modern sürüm değeri %s olan kayıtta yazmayı durdurur', async (version) => {
    const key = 'kampus-proje-demo-reports-v1'
    const raw = JSON.stringify([{
      ...draft,
      id: `invalid-version-${version}`,
      chainId: `invalid-version-${version}`,
      status: 'draft',
      version,
      createdAt: '2026-09-30T12:00:00.000Z',
    }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageReportRepository().createDraft({ ...draft, weekStart: '2026-10-05' }))
      .rejects.toThrow('Rapor verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it('geçersiz yerel kayıt varken yeni yazmayla ham veriyi ezmez', async () => {
    const key = 'kampus-proje-demo-reports-v1'
    const raw = JSON.stringify([{ id: 'bozuk-rapor', status: 'invalid' }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageReportRepository().createDraft(draft)).rejects.toThrow('Rapor verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })


  it('geçersiz çalışma zamanı kararını yazmaz', async () => {
    const repository = new LocalStorageReportRepository()
    const report = await repository.createDraft(draft)
    await repository.submit('project-a', report.id)
    const raw = localStorage.getItem('kampus-proje-demo-reports-v1')

    await expect(repository.review('project-a', report.id, 'invalid' as never, 'Geçersiz karar.')).resolves.toBeNull()
    expect(localStorage.getItem('kampus-proje-demo-reports-v1')).toBe(raw)
  })

  it('yaşam döngüsü bozuk başka rapor varken durum güncellemesinde ham veriyi korur', async () => {
    const key = 'kampus-proje-demo-reports-v1'
    const valid = { ...draft, id: 'valid', chainId: 'valid', status: 'draft', version: 1, createdAt: '2026-10-01T12:00:00.000Z' }
    const raw = JSON.stringify([valid, { ...valid, id: 'broken', status: 'submitted' }])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageReportRepository().submit('project-a', 'valid')).rejects.toThrow('Rapor verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it('çatallanmış iki ikinci sürüm kaydı varken yazmayı durdurur ve ham veriyi korur', async () => {
    const key = 'kampus-proje-demo-reports-v1'
    const root = {
      ...draft,
      id: 'root-report',
      chainId: 'root-report',
      status: 'draft',
      version: 1,
      createdAt: '2026-10-01T12:00:00.000Z',
    }
    const raw = JSON.stringify([
      root,
      { ...root, id: 'revision-a', version: 2, previousVersionId: root.id, createdAt: '2026-10-01T13:00:00.000Z' },
      { ...root, id: 'revision-b', version: 2, previousVersionId: root.id, createdAt: '2026-10-01T14:00:00.000Z' },
    ])
    localStorage.setItem(key, raw)

    await expect(new LocalStorageReportRepository().createDraft({ ...draft, weekStart: '2026-10-05' }))
      .rejects.toThrow('Rapor verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it.each([
    ['yinelenen kimlik', (root: Record<string, unknown>) => [root, { ...root }]],
    ['kök sürüm numarası', (root: Record<string, unknown>) => [{ ...root, version: 2 }]],
    ['kök zincir kimliği', (root: Record<string, unknown>) => [{ ...root, chainId: 'wrong-chain' }]],
    ['kökün önceki sürüm işareti', (root: Record<string, unknown>) => [{ ...root, previousVersionId: '' }]],
    ['bulunmayan önceki sürüm', (root: Record<string, unknown>) => [root, { ...root, id: 'revision', version: 2, previousVersionId: 'missing' }]],
    ['farklı proje', (root: Record<string, unknown>) => [root, { ...root, id: 'revision', projectId: 'project-b', version: 2, previousVersionId: root.id }]],
    ['farklı rapor haftası', (root: Record<string, unknown>) => [root, { ...root, id: 'revision', weekStart: '2026-10-05', version: 2, previousVersionId: root.id }]],
    ['farklı zincir', (root: Record<string, unknown>) => [root, { ...root, id: 'revision', chainId: 'wrong-chain', version: 2, previousVersionId: root.id }]],
    ['ardışık olmayan sürüm numarası', (root: Record<string, unknown>) => [root, { ...root, id: 'revision', version: 3, previousVersionId: root.id }]],
  ])('geçersiz sürüm zincirinde %s yazmayı durdurur ve ham veriyi korur', async (_rule, createReports) => {
    const key = 'kampus-proje-demo-reports-v1'
    const root = {
      ...draft,
      id: 'root-report',
      chainId: 'root-report',
      status: 'draft',
      version: 1,
      createdAt: '2026-10-01T12:00:00.000Z',
    }
    const raw = JSON.stringify(createReports(root))
    localStorage.setItem(key, raw)

    await expect(new LocalStorageReportRepository().createDraft({ ...draft, weekStart: '2026-10-05' }))
      .rejects.toThrow('Rapor verileri güvenli biçimde okunamadı')
    expect(localStorage.getItem(key)).toBe(raw)
  })

})
