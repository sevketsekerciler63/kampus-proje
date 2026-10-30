import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Project } from './types/project'
import type { Task } from './types/task'
import type { Report } from './types/report'

const backupApi = vi.hoisted(() => ({
  exportLocalStorageBackup: vi.fn(),
  importLocalStorageBackup: vi.fn(),
}))

vi.mock('./repositories/localBackup', () => backupApi)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

beforeEach(() => {
  // Teslim ve gecikme senaryoları sabit tarihler kullanır; yalnız Date sabitlenir, zamanlayıcılar gerçek kalır.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T12:00:00+03:00'))
  localStorage.clear()
  backupApi.exportLocalStorageBackup.mockResolvedValue({ ok: true, data: '{"version":1,"storage":{}}' })
  backupApi.importLocalStorageBackup.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('proje çalışma alanı gezinmesi', () => {
  it('form ipucu ve hata metnini alanla erişilebilir biçimde ilişkilendirir', async () => {
    const user = userEvent.setup()
    render(<App />)
    const problem = screen.getByLabelText('Problem')
    const hint = problem.closest('.field')?.querySelector('small')
    expect(hint).toBeTruthy()
    expect(problem).toHaveAttribute('aria-describedby', hint?.id)

    await user.click(screen.getByRole('button', { name: 'Proje taslağını kaydet' }))
    const error = screen.getByText('Problem en az 20 karakter olmalı.')
    expect(problem.getAttribute('aria-describedby')?.split(' ')).toEqual(expect.arrayContaining([hint?.id, error.id]))
  })

  it('teknik paket numarası yerine kalıcı demo kimliği gösterir', async () => {
    render(<App />)
    expect(await screen.findByText('Kampüs Proje / Çalışan yerel demo')).toBeInTheDocument()
    expect(screen.queryByText(/dikey dilim/i)).not.toBeInTheDocument()
  })

  it('proje seçildiğinde liste ekranını kapatır ve geri dönünce yeniden gösterir', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Proje oluştur' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))

    expect(screen.queryByRole('heading', { name: 'Proje oluştur' })).not.toBeInTheDocument()
    const workspaceHeading = screen.getByRole('heading', { name: 'Yağmur Suyu İzleme Sistemi çalışma alanı' })
    expect(workspaceHeading).toBeInTheDocument()
    await waitFor(() => expect(workspaceHeading).toHaveFocus())
    await user.click(screen.getByRole('button', { name: /projelere dön/i }))

    const projectFormHeading = screen.getByRole('heading', { name: 'Proje oluştur' })
    expect(projectFormHeading).toBeInTheDocument()
    await waitFor(() => expect(projectFormHeading).toHaveFocus())
    expect(screen.queryByRole('heading', { name: 'Yağmur Suyu İzleme Sistemi çalışma alanı' })).not.toBeInTheDocument()
  })

  it('projeyi genel bakışta açar ve bölümler arasında tek içerik göstererek geçiş yapar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))

    expect(screen.getByRole('heading', { name: 'Genel Bakış' })).toBeInTheDocument()
    expect(screen.getByText('0 / 1 görev tamamlandı')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Görev ekle' })).not.toBeInTheDocument()

    const overviewTab = screen.getByRole('tab', { name: 'Genel Bakış' })
    expect(overviewTab).toHaveAttribute('aria-controls', 'workspace-panel-overview')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'workspace-panel-overview')

    await user.click(screen.getByRole('button', { name: 'Proje aşamalarını aç' }))
    expect(screen.getByRole('tab', { name: 'Proje Aşamaları' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'workspace-panel-milestones')
    await user.click(screen.getByRole('tab', { name: 'Genel Bakış' }))
    await user.click(screen.getByRole('button', { name: 'Raporları aç' }))
    expect(screen.getByRole('tab', { name: 'Raporlar' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'workspace-panel-reports')

    await user.click(screen.getByRole('tab', { name: 'Genel Bakış' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Ekip' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Ekip' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'workspace-panel-team')

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Genel Bakış' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Raporlar' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Genel Bakış' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Raporlar' })).toHaveFocus()

    await user.click(screen.getByRole('tab', { name: 'Ekip' }))
    expect(screen.getByRole('heading', { name: 'Ekip üyesi ekle' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Genel Bakış' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    await waitFor(() => expect(screen.queryByText('Görevler yükleniyor…')).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Görev ekle' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yeni görev ekle' }))
    expect(screen.getByRole('heading', { name: 'Görev ekle' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Raporlar' }))
    expect(screen.queryByRole('heading', { name: 'Rapor taslağı oluştur' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yeni rapor oluştur' }))
    expect(screen.getByRole('heading', { name: 'Rapor taslağı oluştur' })).toBeInTheDocument()
  })

  it('görevler yüklenirken boş görev mesajını göstermeyip yükleme durumunu korur', async () => {
    const user = userEvent.setup()
    const pendingTasks = new Promise<Task[]>(() => undefined)
    const taskRepository = {
      listByProject: async () => pendingTasks,
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      updateStatus: async () => null,
    }

    render(<App taskRepository={taskRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))

    expect(screen.getByText('Görevler yükleniyor…')).toBeInTheDocument()
    expect(screen.queryByText('Bu proje için henüz görev yok.')).not.toBeInTheDocument()
  })

  it('görevler yüklenemediğinde boş görev mesajını göstermez', async () => {
    const user = userEvent.setup()
    const taskRepository = {
      listByProject: async () => { throw new Error('storage bozuk') },
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      updateStatus: async () => null,
    }

    render(<App taskRepository={taskRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))

    expect(await screen.findByText(/Görevler yüklenemedi\./)).toBeInTheDocument()
    expect(screen.queryByText('Bu proje için henüz görev yok.')).not.toBeInTheDocument()
  })

  it('görev yükleme hatasından yeniden deneyerek kurtulur', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const taskRepository = {
      listByProject: async () => {
        attempts += 1
        if (attempts <= 2) throw new Error('ilk okumalar başarısız')
        return []
      },
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      updateStatus: async () => null,
    }

    render(<App taskRepository={taskRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    expect(await screen.findByText(/Görevler yüklenemedi\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Görevleri yeniden dene' }))

    expect(await screen.findByRole('heading', { name: 'Sensör yerleşimini gözden geçir' })).toBeInTheDocument()
    expect(screen.queryByText(/Görevler yüklenemedi\./)).not.toBeInTheDocument()
    expect(attempts).toBe(3)
  })

  it('ekip üyeleri yüklenirken boş ekip mesajını göstermez', async () => {
    const user = userEvent.setup()
    const memberRepository = {
      listByProject: async () => new Promise<never[]>(() => undefined),
      save: async () => { throw new Error('bu testte kullanılmaz') },
    }

    render(<App memberRepository={memberRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Ekip' }))

    expect(screen.getByText('Ekip üyeleri yükleniyor…')).toBeInTheDocument()
    expect(screen.queryByText('Bu proje için henüz ekip üyesi yok.')).not.toBeInTheDocument()
  })

  it('ekip üyeleri yüklenemediğinde boş ekip mesajını göstermez', async () => {
    const user = userEvent.setup()
    const memberRepository = {
      listByProject: async () => { throw new Error('storage bozuk') },
      save: async () => { throw new Error('bu testte kullanılmaz') },
    }

    render(<App memberRepository={memberRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Ekip' }))

    expect(await screen.findByText('Ekip üyeleri yüklenemedi.')).toBeInTheDocument()
    expect(screen.queryByText('Bu proje için henüz ekip üyesi yok.')).not.toBeInTheDocument()
  })

  it('ekip yükleme hatasından yeniden deneyerek kurtulur', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const memberRepository = {
      listByProject: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('ilk okuma başarısız')
        return []
      },
      save: async () => { throw new Error('bu testte kullanılmaz') },
    }

    render(<App memberRepository={memberRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Ekip' }))
    expect(await screen.findByText('Ekip üyeleri yüklenemedi.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ekip üyelerini yeniden dene' }))

    expect(await screen.findByRole('heading', { name: 'Demo üye: Ayşe Kaya' })).toBeInTheDocument()
    expect(screen.queryByText('Ekip üyeleri yüklenemedi.')).not.toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('aynı projeyi yeniden açınca eski ekip retry yanıtının yeni sonucu ezmesine izin vermez', async () => {
    const user = userEvent.setup()
    const older = deferred<Array<{ id: string; createdAt: string; projectId: string; name: string; email: string; responsibility: string }>>()
    const newer = deferred<Array<{ id: string; createdAt: string; projectId: string; name: string; email: string; responsibility: string }>>()
    let attempts = 0
    const memberRepository = {
      listByProject: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('ilk okuma başarısız')
        return attempts === 2 ? older.promise : newer.promise
      },
      save: async () => { throw new Error('bu testte kullanılmaz') },
    }

    render(<App memberRepository={memberRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Ekip' }))
    await user.click(await screen.findByRole('button', { name: 'Ekip üyelerini yeniden dene' }))

    await user.click(screen.getByRole('button', { name: /projelere dön/i }))
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Ekip' }))

    await act(async () => newer.resolve([{ id: 'new', createdAt: '2026-10-02T12:00:00.000Z', projectId: 'demo-yesil-kampus', name: 'Yeni Üye', email: 'yeni@example.edu', responsibility: 'Yeni sonuç' }]))
    expect(await screen.findByRole('heading', { name: 'Yeni Üye' })).toBeInTheDocument()

    await act(async () => older.resolve([{ id: 'old', createdAt: '2026-10-02T11:00:00.000Z', projectId: 'demo-yesil-kampus', name: 'Eski Üye', email: 'eski@example.edu', responsibility: 'Eski sonuç' }]))
    expect(screen.queryByRole('heading', { name: 'Eski Üye' })).not.toBeInTheDocument()
  })

  it('proje aşamaları yüklenirken boş aşama mesajını göstermez', async () => {
    const user = userEvent.setup()
    const milestoneRepository = {
      listByProject: async () => new Promise<never[]>(() => undefined),
      save: async () => { throw new Error('bu testte kullanılmaz') },
      updateStatus: async () => null,
    }

    render(<App milestoneRepository={milestoneRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Proje Aşamaları' }))

    expect(screen.getByText('Proje aşamaları yükleniyor…')).toBeInTheDocument()
    expect(screen.queryByText('Bu proje için henüz proje aşaması yok.')).not.toBeInTheDocument()
  })

  it('proje aşamaları yüklenemediğinde boş aşama mesajını göstermez', async () => {
    const user = userEvent.setup()
    const milestoneRepository = {
      listByProject: async () => { throw new Error('storage bozuk') },
      save: async () => { throw new Error('bu testte kullanılmaz') },
      updateStatus: async () => null,
    }

    render(<App milestoneRepository={milestoneRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Proje Aşamaları' }))

    expect(await screen.findByText('Proje aşamaları yüklenemedi.')).toBeInTheDocument()
    expect(screen.queryByText('Bu proje için henüz proje aşaması yok.')).not.toBeInTheDocument()
  })

  it('proje aşaması yükleme hatasından yeniden deneyerek kurtulur', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const milestoneRepository = {
      listByProject: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('ilk okuma başarısız')
        return []
      },
      save: async () => { throw new Error('bu testte kullanılmaz') },
      updateStatus: async () => null,
    }

    render(<App milestoneRepository={milestoneRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Proje Aşamaları' }))
    expect(await screen.findByText('Proje aşamaları yüklenemedi.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Proje aşamalarını yeniden dene' }))

    expect(await screen.findByText('Bu proje için henüz proje aşaması yok.')).toBeInTheDocument()
    expect(screen.queryByText('Proje aşamaları yüklenemedi.')).not.toBeInTheDocument()
    expect(attempts).toBe(2)

    await user.click(screen.getByRole('tab', { name: 'Teslimler' }))
    expect(screen.queryByText('Teslimler yükleniyor…')).not.toBeInTheDocument()
  })

  it('rapor yükleme hatasından yeniden deneyerek kurtulur', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const reportRepository = {
      listByProject: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('ilk okuma başarısız')
        return []
      },
      createDraft: async () => { throw new Error('bu testte kullanılmaz') },
      submit: async () => null,
      review: async () => null,
    }

    render(<App reportRepository={reportRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Raporlar' }))
    expect(await screen.findByText(/Raporlar yüklenemedi\./)).toBeInTheDocument()
    expect(screen.queryByText('Bu filtreye uygun rapor yok.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Raporları yeniden dene' }))

    expect(await screen.findByText('Bu filtreye uygun rapor yok.')).toBeInTheDocument()
    expect(screen.queryByText(/Raporlar yüklenemedi\./)).not.toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('aynı projedeki eski rapor retry yanıtının yeni sonucu ezmesine izin vermez', async () => {
    const user = userEvent.setup()
    const older = deferred<Report[]>()
    const newer = deferred<Report[]>()
    let attempts = 0
    const reportRepository = {
      listByProject: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('ilk okuma başarısız')
        return attempts === 2 ? older.promise : newer.promise
      },
      createDraft: async () => { throw new Error('bu testte kullanılmaz') },
      submit: async () => null,
      review: async () => null,
    }

    render(<App reportRepository={reportRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Raporlar' }))
    const retryButton = await screen.findByRole('button', { name: 'Raporları yeniden dene' })
    act(() => {
      retryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      retryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    newer.resolve([{ id: 'newer', projectId: 'demo-yesil-kampus', weekStart: '2026-09-28', completedThisWeek: 'Yeni retry sonucu', blockers: 'Engel yok.', nextWeekPlan: 'Devam', status: 'draft', version: 1, createdAt: '2026-10-02T08:00:00.000Z' }])
    expect(await screen.findByText('Yeni retry sonucu')).toBeInTheDocument()

    older.resolve([{ id: 'older', projectId: 'demo-yesil-kampus', weekStart: '2026-09-21', completedThisWeek: 'Eski retry sonucu', blockers: 'Engel yok.', nextWeekPlan: 'Devam', status: 'draft', version: 1, createdAt: '2026-10-02T07:00:00.000Z' }])
    await waitFor(() => expect(screen.queryByText('Eski retry sonucu')).not.toBeInTheDocument())
    expect(screen.getByText('Yeni retry sonucu')).toBeInTheDocument()
  })

  it('başarılı rapor oluşturma önceki yükleme hatasını temizler', async () => {
    const user = userEvent.setup()
    const reportRepository = {
      listByProject: async () => { throw new Error('ilk okuma başarısız') },
      createDraft: async (input: { projectId: string; weekStart: string; completedThisWeek: string; blockers: string; nextWeekPlan: string; evidenceUrl?: string }) => ({ id: 'created-after-error', ...input, status: 'draft' as const, version: 1, createdAt: '2026-10-02T09:00:00.000Z' }),
      submit: async () => null,
      review: async () => null,
    }

    render(<App reportRepository={reportRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Raporlar' }))
    expect(await screen.findByText(/Raporlar yüklenemedi\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yeni rapor oluştur' }))
    await user.type(screen.getByLabelText('Hafta başlangıcı'), '2026-09-28')
    await user.type(screen.getByLabelText('Bu hafta tamamlananlar'), 'Yükleme hatasından sonra oluşturuldu.')
    await user.click(screen.getByLabelText('Engel yok'))
    await user.type(screen.getByLabelText('Gelecek hafta planı'), 'Doğrulama çalışmalarına devam edilecek.')
    await user.click(screen.getByRole('button', { name: /rapor taslağını kaydet/i }))

    expect(await screen.findByText('Yükleme hatasından sonra oluşturuldu.')).toBeInTheDocument()
    expect(screen.queryByText(/Raporlar yüklenemedi\./)).not.toBeInTheDocument()
  })

  it('bekleyen rapor yüklemesi sırasında başarılı oluşturma loading durumunu kapatır', async () => {
    const user = userEvent.setup()
    const pending = deferred<Report[]>()
    const reportRepository = {
      listByProject: async () => pending.promise,
      createDraft: async (input: { projectId: string; weekStart: string; completedThisWeek: string; blockers: string; nextWeekPlan: string; evidenceUrl?: string }) => ({ id: 'created-during-load', ...input, status: 'draft' as const, version: 1, createdAt: '2026-10-02T09:30:00.000Z' }),
      submit: async () => null,
      review: async () => null,
    }

    render(<App reportRepository={reportRepository} />)
    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Raporlar' }))
    expect(screen.getByText('Raporlar yükleniyor…')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yeni rapor oluştur' }))
    await user.type(screen.getByLabelText('Hafta başlangıcı'), '2026-09-28')
    await user.type(screen.getByLabelText('Bu hafta tamamlananlar'), 'Yükleme sürerken oluşturuldu.')
    await user.click(screen.getByLabelText('Engel yok'))
    await user.type(screen.getByLabelText('Gelecek hafta planı'), 'Test ve doğrulama sürdürülecek.')
    await user.click(screen.getByRole('button', { name: /rapor taslağını kaydet/i }))

    expect(await screen.findByText('Yükleme sürerken oluşturuldu.')).toBeInTheDocument()
    expect(screen.queryByText('Raporlar yükleniyor…')).not.toBeInTheDocument()
  })

  it('proje değişirken önceki projenin rapor özetini hemen temizler', async () => {
    const user = userEvent.setup()
    const projects: Project[] = [
      { id: 'project-a', name: 'Proje A', problem: 'A projesinin yeterli uzunluktaki problem açıklaması.', goal: 'A projesinin yeterli uzunluktaki amaç açıklaması.', scope: 'A projesinin kapsamı.', advisor: 'Dr. A', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'project-b', name: 'Proje B', problem: 'B projesinin yeterli uzunluktaki problem açıklaması.', goal: 'B projesinin yeterli uzunluktaki amaç açıklaması.', scope: 'B projesinin kapsamı.', advisor: 'Dr. B', createdAt: '2026-10-01T00:00:00.000Z' },
    ]
    const secondReports = deferred<Report[]>()
    const reportRepository = {
      listByProject: async (projectId: string) => projectId === 'project-a' ? [{ id: 'report-a', projectId, weekStart: '2026-09-21', completedThisWeek: 'A raporu', blockers: '', nextWeekPlan: 'Devam', status: 'submitted' as const, version: 1, createdAt: '2026-09-28T00:00:00.000Z' }] : secondReports.promise,
      createDraft: async () => { throw new Error('bu testte kullanılmaz') },
      submit: async () => null,
      review: async () => null,
    }
    render(<App repository={{ list: async () => projects, save: async () => { throw new Error('bu testte kullanılmaz') }, update: async () => null, setArchived: async () => null }} reportRepository={reportRepository} />)

    await user.click(await screen.findByRole('button', { name: 'Proje A çalışma alanını aç' }))
    expect(await screen.findByText('2026-09-21 haftası · Sürüm 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /projelere dön/i }))
    await user.click(screen.getByRole('button', { name: 'Proje B çalışma alanını aç' }))

    expect(screen.queryByText('2026-09-21 haftası · Sürüm 1')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Raporlar' }))
    expect(screen.getByText('Raporlar yükleniyor…')).toBeInTheDocument()
    expect(screen.queryByText('Bu filtreye uygun rapor yok.')).not.toBeInTheDocument()
    secondReports.resolve([])
    expect(await screen.findByText('Bu filtreye uygun rapor yok.')).toBeInTheDocument()
  })
})

describe('proje oluşturma akışı', () => {
  it('ilk proje listesi yüklenemediğinde boş liste yerine açıklayıcı hata gösterir', async () => {
    const repository = {
      list: async () => { throw new Error('depolama okunamadı') },
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      setArchived: async () => null,
    }

    render(<App repository={repository} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Projeler yüklenemedi. Tarayıcı depolama iznini kontrol edip sayfayı yenileyin.')
    expect(screen.queryByRole('list', { name: 'Proje listesi' })).not.toBeInTheDocument()
  })

  it('proje yükleme hatasından yeniden deneyerek kurtulur', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const repository = {
      list: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('storage kapalı')
        return []
      },
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      setArchived: async () => null,
    }

    render(<App repository={repository} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Projeler yüklenemedi')

    await user.click(screen.getByRole('button', { name: 'Projeleri yeniden dene' }))

    expect(await screen.findByRole('button', { name: /çalışma alanını aç/i })).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('proje kartında görev ilerlemesi ve dikkat sayısını gösterir', async () => {
    const repository = {
      list: async () => [{
        id: 'project-summary',
        name: 'Özet Projesi',
        problem: 'Proje kartında çalışma durumunun hızlıca görülmesi gerekiyor.',
        goal: 'Görev ilerlemesini ve riskleri kart üzerinde göstermek.',
        scope: 'Proje kartı görev özeti.',
        advisor: 'Dr. Ece Demir',
        createdAt: '2026-10-01T09:00:00.000Z',
      }],
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      setArchived: async () => null,
    }
    const taskRepository = {
      listByProject: async () => [
        { id: 'done', projectId: 'project-summary', title: 'Tamamlanan', description: 'Tamamlanan görev.', assigneeName: 'Ayşe', status: 'completed' as const, priority: 'medium' as const, createdAt: '2026-10-01T09:00:00.000Z' },
        { id: 'high', projectId: 'project-summary', title: 'Yüksek öncelik', description: 'Dikkat isteyen görev.', assigneeName: 'Ayşe', status: 'todo' as const, priority: 'high' as const, createdAt: '2026-10-01T09:00:00.000Z' },
        { id: 'late', projectId: 'project-summary', title: 'Geciken', description: 'Tarihi geçmiş görev.', assigneeName: 'Ayşe', dueDate: '2020-01-01', status: 'in_progress' as const, priority: 'medium' as const, createdAt: '2026-10-01T09:00:00.000Z' },
      ],
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      updateStatus: async () => null,
    }

    render(<App repository={repository} taskRepository={taskRepository} />)

    expect(await screen.findByText('3 görev · 1 tamamlandı · 2 dikkat')).toBeInTheDocument()
  })

  it('boş formu anlaşılır Türkçe hatalarla reddeder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /proje taslağını kaydet/i }))

    expect(screen.getByText('Proje adı gerekli.')).toBeInTheDocument()
    expect(screen.getByText('Problem en az 20 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByText('Amaç en az 20 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByText('Kapsam en az 10 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByText('Danışman adı gerekli.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Proje adı')).toHaveFocus())
  })

  it('geçerli projeyi kaydeder ve proje listesinde gösterir', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Proje adı'), 'Kampüs Enerji Takip Sistemi')
    await user.type(screen.getByLabelText('Problem'), 'Kampüs binalarındaki enerji tüketimi düzenli ve anlaşılır biçimde izlenemiyor.')
    await user.type(screen.getByLabelText('Amaç'), 'Tüketimi görünür kılıp tasarruf kararlarını destekleyen bir panel oluşturmak.')
    await user.type(screen.getByLabelText('Kapsam'), 'Veri girişi ve aylık özet ekranı.')
    await user.type(screen.getByLabelText('Danışman'), 'Dr. Ece Demir')
    await user.click(screen.getByRole('button', { name: /proje taslağını kaydet/i }))

    expect(await screen.findByText('Proje taslağı bu cihazın tarayıcısına kaydedildi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kampüs Enerji Takip Sistemi' })).toBeInTheDocument()
  })

  it('repository kaydı başarısız olduğunda kullanıcıya açıklayıcı mesaj verir', async () => {
    const user = userEvent.setup()
    const repository = {
      list: async () => [],
      save: async () => { throw new Error('depolama kapalı') },
      update: async () => null,
      setArchived: async () => null,
    }
    render(<App repository={repository} />)

    await user.type(screen.getByLabelText('Proje adı'), 'Kampüs Enerji Takip Sistemi')
    await user.type(screen.getByLabelText('Problem'), 'Kampüs binalarındaki enerji tüketimi düzenli ve anlaşılır biçimde izlenemiyor.')
    await user.type(screen.getByLabelText('Amaç'), 'Tüketimi görünür kılıp tasarruf kararlarını destekleyen bir panel oluşturmak.')
    await user.type(screen.getByLabelText('Kapsam'), 'Veri girişi ve aylık özet ekranı.')
    await user.type(screen.getByLabelText('Danışman'), 'Dr. Ece Demir')
    await user.click(screen.getByRole('button', { name: /proje taslağını kaydet/i }))

    expect(await screen.findByText(/proje taslağı kaydedilemedi/i)).toBeInTheDocument()
  })

  it('bekleyen arşivleme sırasında çalışma alanı açılsa bile başarılı arşivden sonra listeye döner', async () => {
    const user = userEvent.setup()
    const project: Project = {
      id: 'archive-race',
      name: 'Arşiv Yarışı Projesi',
      problem: 'Arşivleme sırasında çalışma alanının açık kalmaması gerekiyor.',
      goal: 'Başarılı arşiv sonucu seçili projeyi güvenle kapatmak.',
      scope: 'Arşivleme durum geçişi.',
      advisor: 'Dr. Ece Demir',
      createdAt: '2026-10-01T09:00:00.000Z',
    }
    const archive = deferred<Project | null>()
    let archiveStarted = false
    const repository = {
      list: async () => [project],
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      setArchived: async () => {
        archiveStarted = true
        return archive.promise
      },
    }

    render(<App repository={repository} />)
    await user.click(await screen.findByRole('button', { name: 'Arşiv Yarışı Projesi projesini arşivle' }))
    await waitFor(() => expect(archiveStarted).toBe(true))
    await user.click(screen.getByRole('button', { name: 'Arşiv Yarışı Projesi çalışma alanını aç' }))
    expect(screen.getByRole('heading', { name: 'Arşiv Yarışı Projesi çalışma alanı' })).toBeInTheDocument()

    act(() => archive.resolve({ ...project, archivedAt: '2026-10-02T10:00:00.000Z' }))

    expect(await screen.findByRole('heading', { name: 'Proje oluştur' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Arşiv Yarışı Projesi çalışma alanı' })).not.toBeInTheDocument()
  })

  it('yerel projeyi düzenler, silmeden arşivler ve geri getirir', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Proje adı'), 'Düzenlenecek Proje')
    await user.type(screen.getByLabelText('Problem'), 'Bu proje düzenleme ve arşivleme davranışını doğrulamak için oluşturuluyor.')
    await user.type(screen.getByLabelText('Amaç'), 'Proje yaşam döngüsünün güvenli ve geri alınabilir olmasını sağlamak.')
    await user.type(screen.getByLabelText('Kapsam'), 'Yerel proje yönetimi ekranı.')
    await user.type(screen.getByLabelText('Danışman'), 'Dr. Ece Demir')
    await user.click(screen.getByRole('button', { name: /proje taslağını kaydet/i }))

    await user.click(await screen.findByRole('button', { name: 'Düzenlenecek Proje projesini düzenle' }))
    await user.clear(screen.getByLabelText('Proje adı'))
    await user.type(screen.getByLabelText('Proje adı'), 'Düzenlenen Proje')
    await user.click(screen.getByRole('button', { name: 'Proje değişikliklerini kaydet' }))
    expect(await screen.findByRole('heading', { name: 'Düzenlenen Proje' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Düzenlenen Proje projesini arşivle' }))
    expect(screen.queryByRole('heading', { name: 'Düzenlenen Proje' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Arşivlenen projeleri göster' }))
    expect(screen.getByRole('heading', { name: 'Düzenlenen Proje' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Düzenlenen Proje projesini geri getir' }))
    expect(screen.getByRole('button', { name: 'Düzenlenen Proje çalışma alanını aç' })).toBeInTheDocument()
  })
})

describe('seçili proje görev yönetimi', () => {
  it('boş görev formunu açıklayıcı hatalarla reddeder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    await user.click(screen.getByRole('button', { name: 'Yeni görev ekle' }))
    await user.click(screen.getByRole('button', { name: /görevi kaydet/i }))

    expect(screen.getByText('Görev başlığı gerekli.')).toBeInTheDocument()
    expect(screen.getByText('Açıklama en az 10 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByText('Ekip sorumlusu seçimi gerekli.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Görev başlığı')).toHaveFocus())
  })

  it('seçili projeye geçerli görev kaydeder ve hedef tarihi boş bırakabilir', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    await user.click(screen.getByRole('button', { name: 'Yeni görev ekle' }))
    await user.type(screen.getByLabelText('Görev başlığı'), 'Sensör verisi akışını tanımla')
    await user.type(screen.getByLabelText('Görev açıklaması'), 'Veri girişinden gösterge paneline kadar ilk akışı belgele.')
    await user.selectOptions(screen.getByLabelText('Ekip sorumlusu'), 'Demo üye: Ayşe Kaya')
    await user.click(screen.getByRole('button', { name: /görevi kaydet/i }))

    expect(await screen.findByText('Görev bu cihazın tarayıcısına kaydedildi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sensör verisi akışını tanımla' })).toBeInTheDocument()
    expect(screen.getAllByText('Hedef tarih belirtilmedi')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /projelere dön/i }))
    expect(await screen.findByText('2 görev · 0 tamamlandı · 0 dikkat')).toBeInTheDocument()
  })

  it('görev durumunu seçili proje panosunda değiştirir', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    await user.selectOptions(screen.getByLabelText('Sensör yerleşimini gözden geçir durumu'), 'completed')

    expect(screen.getByLabelText('Sensör yerleşimini gözden geçir durumu')).toHaveValue('completed')
    expect(screen.getByLabelText('Sensör yerleşimini gözden geçir durumu')).toHaveDisplayValue('Tamamlandı')
  })

  it('hızlı proje değişiminde geç dönen eski görev listesini göstermez', async () => {
    const user = userEvent.setup()
    const projects: Project[] = [
      { id: 'project-a', name: 'Proje A', problem: 'A projesinin doğrulanabilir problem açıklaması.', goal: 'A projesi için açıklanabilir bir amaç tanımı.', scope: 'A projesi kapsamı.', advisor: 'Dr. A', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'project-b', name: 'Proje B', problem: 'B projesinin doğrulanabilir problem açıklaması.', goal: 'B projesi için açıklanabilir bir amaç tanımı.', scope: 'B projesi kapsamı.', advisor: 'Dr. B', createdAt: '2026-10-01T00:00:00.000Z' },
    ]
    const first = deferred<Task[]>()
    const second = deferred<Task[]>()
    const taskRepository = {
      listByProject: (projectId: string) => projectId === 'project-a' ? first.promise : second.promise,
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      updateStatus: async () => null,
    }
    render(<App repository={{ list: async () => projects, save: async () => { throw new Error('bu testte kullanılmaz') }, update: async () => null, setArchived: async () => null }} taskRepository={taskRepository} />)

    await user.click(await screen.findByRole('button', { name: 'Proje A çalışma alanını aç' }))
    await user.click(screen.getByRole('button', { name: /projelere dön/i }))
    await user.click(screen.getByRole('button', { name: 'Proje B çalışma alanını aç' }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    second.resolve([{ id: 'task-b', projectId: 'project-b', title: 'B görevi', description: 'Yalnız B projesinde görünmesi gereken görev.', assigneeName: 'Demo üye: Ayşe Kaya', status: 'todo', createdAt: '2026-10-01T00:00:00.000Z' }])
    expect(await screen.findByRole('heading', { name: 'B görevi' })).toBeInTheDocument()

    first.resolve([{ id: 'task-a', projectId: 'project-a', title: 'A görevi', description: 'Geç döndüğünde görünmemesi gereken eski görev.', assigneeName: 'Demo üye: Ayşe Kaya', status: 'todo', createdAt: '2026-10-01T00:00:00.000Z' }])
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'A görevi' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'B görevi' })).toBeInTheDocument()
  })

  it('görevleri metin, durum ve sorumluya göre filtreleyip gecikeni işaretler', async () => {
    const user = userEvent.setup()
    const taskRepository = {
      listByProject: async () => [
        { id: 'late-task', projectId: 'demo-yesil-kampus', title: 'Geciken sensör kurulumu', description: 'Sahadaki sensör bağlantılarını tamamla.', assigneeName: 'Demo üye: Ayşe Kaya', dueDate: '2026-09-30', status: 'in_progress' as const, createdAt: '2026-09-20T00:00:00.000Z' },
        { id: 'future-task', projectId: 'demo-yesil-kampus', title: 'Final sunumunu hazırla', description: 'Final sunumunun ilk taslağını hazırla.', assigneeName: 'Demo üye: Mehmet Aras', dueDate: '2026-10-20', status: 'todo' as const, createdAt: '2026-09-20T00:00:00.000Z' },
      ],
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      updateStatus: async () => null,
    }
    render(<App taskRepository={taskRepository} />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    expect(await screen.findByText('Gecikti')).toBeInTheDocument()
    expect(screen.queryByLabelText('Sorumluya göre filtrele')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Diğer filtreler' }))
    expect(screen.getByLabelText('Sorumluya göre filtrele')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Görevlerde ara'), 'final')
    expect(screen.getByRole('heading', { name: 'Final sunumunu hazırla' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Geciken sensör kurulumu' })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Görevlerde ara'))
    await user.selectOptions(screen.getByLabelText('Duruma göre filtrele'), 'in_progress')
    expect(screen.getByRole('heading', { name: 'Geciken sensör kurulumu' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Final sunumunu hazırla' })).not.toBeInTheDocument()
  })

  it('genel bakışta dikkat gerektiren görevleri gösterip risk filtresine geçirir', async () => {
    const user = userEvent.setup()
    const taskRepository = {
      listByProject: async () => [
        { id: 'late', projectId: 'demo-yesil-kampus', title: 'Geciken altyapı görevi', description: 'Tarihi geçmiş açık görev.', assigneeName: 'Demo üye: Ayşe Kaya', dueDate: '2026-09-30', status: 'in_progress' as const, priority: 'medium' as const, createdAt: '2026-09-20T00:00:00.000Z' },
        { id: 'high', projectId: 'demo-yesil-kampus', title: 'Yüksek öncelikli sunum', description: 'Hedef tarihi olmayan önemli görev.', assigneeName: 'Demo üye: Mehmet Aras', status: 'todo' as const, priority: 'high' as const, createdAt: '2026-09-20T00:00:00.000Z' },
        { id: 'done', projectId: 'demo-yesil-kampus', title: 'Tamamlanan eski görev', description: 'Risk listesine girmemeli.', assigneeName: 'Demo üye: Ayşe Kaya', dueDate: '2026-09-29', status: 'completed' as const, priority: 'high' as const, createdAt: '2026-09-20T00:00:00.000Z' },
      ],
      save: async () => { throw new Error('bu testte kullanılmaz') },
      update: async () => null,
      updateStatus: async () => null,
    }
    render(<App taskRepository={taskRepository} />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    expect(await screen.findByRole('heading', { name: 'Dikkat gerektiren görevler' })).toBeInTheDocument()
    expect(screen.getByText('Geciken altyapı görevi')).toBeInTheDocument()
    expect(screen.getByText('Yüksek öncelikli sunum')).toBeInTheDocument()
    expect(screen.queryByText('Tamamlanan eski görev')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '1 geciken görevi göster' }))
    expect(screen.getByRole('heading', { name: 'Görevler' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Geciken altyapı görevi' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Yüksek öncelikli sunum' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Teslim durumuna göre filtrele')).toHaveValue('overdue')
  })

  it('yerel görevi düzenleyip güncellenen içeriği listede gösterir', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    await user.click(screen.getByRole('button', { name: 'Yeni görev ekle' }))
    await user.type(screen.getByLabelText('Görev başlığı'), 'Düzenlenecek görev')
    await user.type(screen.getByLabelText('Görev açıklaması'), 'Bu görev daha sonra düzenleme akışında değiştirilecek.')
    await user.selectOptions(screen.getByLabelText('Ekip sorumlusu'), 'Demo üye: Ayşe Kaya')
    await user.click(screen.getByRole('button', { name: /görevi kaydet/i }))

    await user.click(await screen.findByRole('button', { name: 'Düzenlenecek görev görevini düzenle' }))
    expect(screen.getByRole('heading', { name: 'Görevi düzenle' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Görev başlığı'))
    await user.type(screen.getByLabelText('Görev başlığı'), 'Düzenlenen görev')
    await user.click(screen.getByRole('button', { name: /değişiklikleri kaydet/i }))

    expect(await screen.findByText('Görev değişiklikleri kaydedildi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Düzenlenen görev' })).toBeInTheDocument()
  })
})

describe('seçili proje ekip yönetimi', () => {
  it('üyeyi projeye ekler ve görev sorumlusu seçeneklerine taşır', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Ekip' }))
    await user.type(screen.getByLabelText('Üye adı'), 'Zeynep Yılmaz')
    await user.type(screen.getByLabelText('Üye e-postası'), 'zeynep@example.edu')
    await user.type(screen.getByLabelText('Sorumluluk'), 'Veri analizi')
    await user.click(screen.getByRole('button', { name: /üyeyi ekle/i }))

    expect(await screen.findByText('Üye bu projenin yerel ekip listesine eklendi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Zeynep Yılmaz' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Görevler' }))
    await user.click(screen.getByRole('button', { name: 'Yeni görev ekle' }))
    expect(screen.getByLabelText('Ekip sorumlusu')).toHaveDisplayValue('Ekip üyesini seçin')
    expect(screen.getAllByRole('option', { name: 'Zeynep Yılmaz' })).toHaveLength(1)
  })

  it('boş üye formunu reddedip ilk hatalı alana odaklanır', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Ekip' }))
    await user.click(screen.getByRole('button', { name: /üyeyi ekle/i }))

    expect(screen.getByText('Üye adı gerekli.')).toBeInTheDocument()
    expect(screen.getByText('Geçerli bir e-posta adresi gerekli.')).toBeInTheDocument()
    expect(screen.getByText('Sorumluluk gerekli.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Üye adı')).toHaveFocus())
  })
})

describe('seçili proje kilometre taşları', () => {
  it('proje aşaması oluşturur, durumunu günceller ve genel bakışta gösterir', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Proje Aşamaları' }))
    await waitFor(() => expect(screen.queryByText('Proje aşamaları yükleniyor…')).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Proje aşaması ekle' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yeni proje aşaması ekle' }))
    await user.click(screen.getByRole('button', { name: /proje aşamasını kaydet/i }))
    expect(screen.getByText('Proje aşaması başlığı gerekli.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Proje aşaması başlığı')).toHaveFocus())

    await user.type(screen.getByLabelText('Proje aşaması başlığı'), 'Gereksinim analizini tamamla')
    await user.type(screen.getByLabelText('Açıklama'), 'Kullanıcı ihtiyaçlarını ve sistem sınırlarını belgeleyin.')
    await user.type(screen.getByLabelText('Teslim tarihi'), '2026-10-15')
    await user.click(screen.getByRole('button', { name: /proje aşamasını kaydet/i }))

    expect(await screen.findByText('Proje aşaması bu projenin takvimine eklendi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gereksinim analizini tamamla' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Gereksinim analizini tamamla durumu'), 'completed')
    expect(screen.getByLabelText('Gereksinim analizini tamamla durumu')).toHaveValue('completed')

    await user.click(screen.getByRole('tab', { name: 'Genel Bakış' }))
    expect(screen.getByText('1 proje aşaması')).toBeInTheDocument()
  })

  it('teslim tarihi geçtikten sonra tamamlanan aşamayı geç tamamlandı olarak korur', async () => {
    const user = userEvent.setup()
    const lateMilestone = { id: 'late-phase', projectId: 'demo-yesil-kampus', title: 'Analiz teslimi', description: 'Analiz belgelerini danışmana sun.', dueDate: '2026-09-30', status: 'in_progress' as const, createdAt: '2026-09-20T00:00:00.000Z' }
    const milestoneRepository = {
      listByProject: async () => [lateMilestone],
      save: async () => { throw new Error('bu testte kullanılmaz') },
      updateStatus: async () => ({ ...lateMilestone, status: 'completed' as const, completedAt: '2026-10-01T10:00:00.000Z' }),
    }
    render(<App milestoneRepository={milestoneRepository} />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Proje Aşamaları' }))
    await user.selectOptions(await screen.findByLabelText('Analiz teslimi durumu'), 'completed')

    expect(await screen.findByText('Geç tamamlandı')).toBeInTheDocument()
  })
})

describe('seçili proje haftalık rapor akışı', () => {
  it('boş raporu ve http/https olmayan kanıt bağlantısını reddedip ilk hataya odaklanır', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Raporlar' }))
    await user.click(screen.getByRole('button', { name: 'Yeni rapor oluştur' }))
    await user.click(screen.getByRole('button', { name: /rapor taslağını kaydet/i }))

    expect(screen.getByText('Hafta başlangıcı gerekli.')).toBeInTheDocument()
    expect(screen.getByText('Bu hafta tamamlananlar gerekli.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Hafta başlangıcı')).toHaveFocus())

    await user.type(screen.getByLabelText('Kanıt bağlantısı'), 'ftp://ornek.edu/kanit')
    await user.click(screen.getByRole('button', { name: /rapor taslağını kaydet/i }))
    expect(screen.getByText('Kanıt bağlantısı yalnız http veya https olmalı.')).toBeInTheDocument()
  })

  it('taslağı gönderir ve demo danışman kararını geri bildirimle kaydeder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Raporlar' }))
    await user.click(screen.getByRole('button', { name: 'Yeni rapor oluştur' }))
    await user.type(screen.getByLabelText('Hafta başlangıcı'), '2026-09-28')
    await user.type(screen.getByLabelText('Bu hafta tamamlananlar'), 'Sensör veri akışının ilk prototipi tamamlandı.')
    await user.click(screen.getByLabelText('Engel yok'))
    await user.type(screen.getByLabelText('Gelecek hafta planı'), 'Danışman görüşmesi için prototip ekranlarını hazırlayacağım.')
    await user.type(screen.getByLabelText('Kanıt bağlantısı'), 'https://example.edu/rapor')
    await user.click(screen.getByRole('button', { name: /rapor taslağını kaydet/i }))

    expect(await screen.findByText('Rapor sürüm 1 taslağı bu cihazın tarayıcısına kaydedildi.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /raporu gönder/i }))
    expect(await screen.findByText('Rapor danışman demo incelemesine gönderildi.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Danışman geri bildirimi'), 'Kanıtın neyi gösterdiğini bir cümleyle açıklayın.')
    await user.click(screen.getByRole('button', { name: /düzeltme istendi/i }))
    expect(await screen.findByText('Demo danışman kararı kaydedildi.')).toBeInTheDocument()
    expect(screen.getByText('Kanıtın neyi gösterdiğini bir cümleyle açıklayın.')).toBeInTheDocument()
    expect(screen.getByText('Karar: Düzeltme istendi')).toBeInTheDocument()
    const feedbackRegion = screen.getByRole('region', { name: 'Danışman geri bildirimi' })
    expect(feedbackRegion).toContainElement(screen.getByText(/Geri bildirim zamanı:/))
    expect(feedbackRegion.querySelector('time')).toHaveAttribute('dateTime')

    await user.click(screen.getByRole('button', { name: /yeni sürüm oluştur/i }))
    expect(screen.getByLabelText('Bu hafta tamamlananlar')).toHaveValue('Sensör veri akışının ilk prototipi tamamlandı.')
    await user.clear(screen.getByLabelText('Bu hafta tamamlananlar'))
    await user.type(screen.getByLabelText('Bu hafta tamamlananlar'), 'Sensör veri akışı ve kanıt açıklaması tamamlandı.')
    await user.click(screen.getByRole('button', { name: /yeni rapor sürümünü kaydet/i }))

    expect(await screen.findByText('Rapor sürüm 2 taslağı bu cihazın tarayıcısına kaydedildi.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /sürüm 1/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /sürüm 2/i })).toBeInTheDocument()
    expect(screen.getByText('Sürüm zinciri: 2 sürüm')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Rapor durumuna göre filtrele'), 'draft')
    expect(screen.getByRole('heading', { name: /sürüm 2/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sürüm 1/i })).not.toBeInTheDocument()
  }, 10_000)
})

describe('dönem teslim merkezi', () => {
  it('seçilen teslim şablonunu yalnız başlık ve açıklamaya uygular, yeni teslimde sıfırlar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Teslimler' }))
    await user.click(screen.getByRole('button', { name: 'Yeni teslim ekle' }))
    await user.selectOptions(screen.getByLabelText('Teslim şablonu (isteğe bağlı)'), 'final-report')

    expect(screen.getByLabelText('Teslim başlığı')).toHaveValue('Final raporu')
    expect(screen.getByLabelText('Teslim açıklaması')).toHaveValue('Projenin sonuçlarını, değerlendirmesini ve eklerini içeren final raporu.')
    expect(screen.getByLabelText('Teslim tarihi')).toHaveValue('')
    expect(screen.getByLabelText('Sorumlu ekip üyesi')).toHaveValue('')
    expect(screen.getByLabelText('Teslim durumu')).toHaveValue('planned')
    expect(screen.getByLabelText('Kanıt URLsi')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Teslim formunu kapat' }))
    await user.click(screen.getByRole('button', { name: 'Yeni teslim ekle' }))
    expect(screen.getByLabelText('Teslim şablonu (isteğe bağlı)')).toHaveValue('')
  })

  it('teslim sorumlusunu proje üyelerinden seçip oluşturma ve düzenlemede korur', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Teslimler' }))
    expect((await screen.findByText('Atanmadı')).parentElement).toHaveTextContent('Sorumlu: Atanmadı')
    await user.click(screen.getByRole('button', { name: 'Yeni teslim ekle' }))
    await user.type(screen.getByLabelText('Teslim başlığı'), 'Sorumluluğu atanmış teslim')
    await user.type(screen.getByLabelText('Teslim açıklaması'), 'Sorumlu ekip üyesiyle kaydedilecek teslim açıklaması.')
    await user.type(screen.getByLabelText('Teslim tarihi'), '2026-10-15')
    await user.selectOptions(screen.getByLabelText('Sorumlu ekip üyesi'), 'Demo üye: Ayşe Kaya')
    await user.click(screen.getByRole('button', { name: 'Teslimi kaydet' }))

    expect(await screen.findByText('Demo üye: Ayşe Kaya')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sorumluluğu atanmış teslim teslimini düzenle' }))
    expect(screen.getByLabelText('Sorumlu ekip üyesi')).toHaveValue('Demo üye: Ayşe Kaya')
    await user.selectOptions(screen.getByLabelText('Sorumlu ekip üyesi'), 'Demo üye: Mehmet Aras')
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))

    expect(await screen.findByText('Demo üye: Mehmet Aras')).toBeInTheDocument()
  })

  it('ready teslimi kanıt URLsiyle oluşturur ve genel bakıştan teslimlere döner', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /çalışma alanını aç/i }))
    await user.click(screen.getByRole('tab', { name: 'Teslimler' }))
    await user.click(screen.getByRole('button', { name: 'Yeni teslim ekle' }))
    await user.type(screen.getByLabelText('Teslim başlığı'), 'Dönem final raporu')
    await user.type(screen.getByLabelText('Teslim açıklaması'), 'Dönem sonunda teslim edilecek ayrıntılı proje raporu.')
    await user.type(screen.getByLabelText('Teslim tarihi'), '2026-10-15')
    await user.selectOptions(screen.getByLabelText('Teslim durumu'), 'ready')
    await user.type(screen.getByLabelText('Kanıt URLsi'), 'https://example.edu/rapor')
    await user.click(screen.getByRole('button', { name: 'Teslimi kaydet' }))

    expect(await screen.findByRole('heading', { name: 'Dönem final raporu' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Genel Bakış' }))
    expect(screen.getByText('1 hazır teslim · 0 geciken')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Teslimleri aç' }))
    expect(screen.getByRole('tab', { name: 'Teslimler' })).toHaveFocus()
  })
})

describe('veri güvenliği yedekleri', () => {
  it('yedek indirme isteğini JSON Blob ile tetikler', async () => {
    const user = userEvent.setup()
    const createObjectUrl = vi.fn(() => 'blob:kampus-yedek')
    const revokeObjectUrl = vi.fn()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectUrl },
      revokeObjectURL: { configurable: true, value: revokeObjectUrl },
    })
    const downloadClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Yedek indir' }))

    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob)))
    expect(downloadClick).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:kampus-yedek')
  })

  it('yedek dışa aktarımı başarısız olduğunda görünür hata uyarısı gösterir', async () => {
    const user = userEvent.setup()
    backupApi.exportLocalStorageBackup.mockResolvedValue({ ok: false, message: 'Yedek oluşturulamadı' })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Yedek indir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Yedek oluşturulamadı')
  })

  it('bozuk seçilmiş yedeği geri yüklemez ve yerel verileri korur', async () => {
    const user = userEvent.setup()
    localStorage.setItem('kampus-proje-demo-projects-v1', JSON.stringify([{ id: 'mevcut-proje' }]))
    const before = localStorage.getItem('kampus-proje-demo-projects-v1')
    backupApi.importLocalStorageBackup.mockResolvedValue({ ok: false, message: 'Yedek dosyası veya sürümü desteklenmiyor' })
    render(<App />)
    const file = new File(['{bozuk-json'], 'bozuk-yedek.json', { type: 'application/json' })

    await user.upload(screen.getByLabelText('Yedek JSON dosyası'), file)
    await user.click(screen.getByRole('button', { name: 'Yedeği geri yükle' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Yedek dosyası veya sürümü desteklenmiyor')
    expect(localStorage.getItem('kampus-proje-demo-projects-v1')).toBe(before)
  })
})
