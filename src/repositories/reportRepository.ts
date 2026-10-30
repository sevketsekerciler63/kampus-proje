import { reportStatuses, type FeedbackDecision, type Report, type ReportInput, type ReportStatus } from '../types/report'
import { enqueueStorageWrite, waitForStorageWrites } from './storageWriteCoordinator'
import { activeProjectStorageKey, assertActiveProject } from './activeProjectGuard'

export interface ReportRepository {
  listByProject(projectId: string): Promise<Report[]>
  createDraft(input: ReportInput, previousVersionId?: string): Promise<Report>
  submit(projectId: string, reportId: string): Promise<Report | null>
  review(projectId: string, reportId: string, decision: FeedbackDecision, message: string): Promise<Report | null>
}

const storageKey = 'kampus-proje-demo-reports-v1'

function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === 'string' && reportStatuses.includes(value as ReportStatus)
}

function isReport(value: unknown): value is Report {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const basicFields = ['id', 'projectId', 'weekStart', 'completedThisWeek', 'blockers', 'nextWeekPlan', 'createdAt']
  if (!basicFields.every((key) => typeof item[key] === 'string') || !isReportStatus(item.status) || !Number.isInteger(item.version) || (item.version as number) < 1) return false
  if (Number.isNaN(Date.parse(item.createdAt as string))) return false
  if (item.evidenceUrl !== undefined && typeof item.evidenceUrl !== 'string') return false
  if (item.chainId !== undefined && typeof item.chainId !== 'string') return false
  if (item.previousVersionId !== undefined && typeof item.previousVersionId !== 'string') return false
  if (item.submittedAt !== undefined && (typeof item.submittedAt !== 'string' || Number.isNaN(Date.parse(item.submittedAt)))) return false
  if (item.feedback !== undefined) {
    if (!item.feedback || typeof item.feedback !== 'object') return false
    const feedback = item.feedback as Record<string, unknown>
    if ((feedback.decision !== 'reviewed' && feedback.decision !== 'changes_requested') || typeof feedback.message !== 'string' || typeof feedback.createdAt !== 'string') return false
    if (Number.isNaN(Date.parse(feedback.createdAt))) return false
    if (item.status !== feedback.decision) return false
  }
  if ((item.status === 'reviewed' || item.status === 'changes_requested') && item.feedback === undefined) return false
  if ((item.status === 'draft' || item.status === 'submitted') && item.feedback !== undefined) return false
  if (item.status === 'draft' && item.submittedAt !== undefined) return false
  if (item.status !== 'draft' && item.submittedAt === undefined) return false
  return true
}

function migrateLegacyReport(value: unknown): Report | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if ('status' in item || 'version' in item) return null
  const allowedFields = new Set(['id', 'projectId', 'weekStart', 'completedThisWeek', 'blockers', 'nextWeekPlan', 'evidenceUrl', 'createdAt'])
  if (Object.keys(item).some((key) => !allowedFields.has(key))) return null
  const requiredFields = ['id', 'projectId', 'weekStart', 'completedThisWeek', 'blockers', 'nextWeekPlan', 'createdAt']
  if (!requiredFields.every((key) => typeof item[key] === 'string')) return null
  if (Number.isNaN(Date.parse(item.createdAt as string))) return null
  if (item.evidenceUrl !== undefined && typeof item.evidenceUrl !== 'string') return null
  if (item.submittedAt !== undefined || item.feedback !== undefined || item.previousVersionId !== undefined || item.chainId !== undefined) return null
  return {
    id: item.id as string,
    projectId: item.projectId as string,
    weekStart: item.weekStart as string,
    completedThisWeek: item.completedThisWeek as string,
    blockers: item.blockers as string,
    nextWeekPlan: item.nextWeekPlan as string,
    ...(typeof item.evidenceUrl === 'string' ? { evidenceUrl: item.evidenceUrl } : {}),
    status: 'draft',
    version: 1,
    chainId: item.id as string,
    createdAt: item.createdAt as string,
  }
}

function hasValidVersionChains(reports: Report[]): boolean {
  const reportsById = new Map<string, Report>()
  for (const report of reports) {
    if (reportsById.has(report.id)) return false
    reportsById.set(report.id, report)
  }

  const childCounts = new Map<string, number>()
  for (const report of reports) {
    if (report.previousVersionId === undefined) {
      if (report.version !== 1 || report.chainId !== report.id) return false
      continue
    }

    const previous = reportsById.get(report.previousVersionId)
    if (!previous) return false
    const previousChainId = previous.chainId ?? previous.id
    const chainId = report.chainId ?? report.id
    if (
      report.projectId !== previous.projectId ||
      report.weekStart !== previous.weekStart ||
      chainId !== previousChainId ||
      report.version !== previous.version + 1
    ) return false

    const childCount = (childCounts.get(previous.id) ?? 0) + 1
    if (childCount > 1) return false
    childCounts.set(previous.id, childCount)
  }

  return true
}

export function isValidReportStorage(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  const normalized = value.map((item) => isReport(item) ? item : migrateLegacyReport(item))
  return normalized.every((item): item is Report => item !== null) && hasValidVersionChains(normalized)
}

export class LocalStorageReportRepository implements ReportRepository {
  private readonly isKnownActiveProject?: (projectId: string) => boolean

  constructor(isKnownActiveProject?: (projectId: string) => boolean) {
    this.isKnownActiveProject = isKnownActiveProject
  }

  async listByProject(projectId: string): Promise<Report[]> {
    await waitForStorageWrites(storageKey)
    return (await this.readAll()).filter((report) => report.projectId === projectId)
  }

  async createDraft(input: ReportInput, previousVersionId?: string): Promise<Report> {
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(input.projectId, 'Rapor yalnız aktif bir projeye bağlanabilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => {
      const reports = await this.readAll(true)
      const previous = previousVersionId ? reports.find((report) => report.id === previousVersionId && report.projectId === input.projectId) : undefined
      if (previousVersionId && !previous) throw new Error('Önceki rapor sürümü bulunamadı.')
      if (previous && previous.weekStart !== input.weekStart) throw new Error('Yeni sürüm aynı rapor haftasını korumalı.')
      if (previous && reports.some((report) => report.previousVersionId === previous.id)) throw new Error('En güncel rapor sürümünden devam edin.')
      const id = crypto.randomUUID()
      const chainId = previous?.chainId ?? previous?.id ?? id
      const latestVersion = reports
        .filter((report) => (report.chainId ?? report.id) === chainId)
        .reduce((highest, report) => Math.max(highest, report.version), 0)
      const report: Report = {
        ...input,
        id,
        chainId,
        status: 'draft',
        version: previous ? latestVersion + 1 : 1,
        ...(previous ? { previousVersionId: previous.id } : {}),
        createdAt: new Date().toISOString(),
      }
      window.localStorage.setItem(storageKey, JSON.stringify([report, ...reports]))
      return report
      })
    })
  }

  async submit(projectId: string, reportId: string): Promise<Report | null> {
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(projectId, 'Rapor yalnız aktif bir projede teslim edilebilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => this.update(projectId, reportId, (report) => report.status === 'draft' ? {
        ...report,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
      } : null))
    })
  }

  async review(projectId: string, reportId: string, decision: FeedbackDecision, message: string): Promise<Report | null> {
    if (decision !== 'reviewed' && decision !== 'changes_requested') return null
    return enqueueStorageWrite(activeProjectStorageKey, async () => {
      assertActiveProject(projectId, 'Rapor yalnız aktif bir projede incelenebilir', this.isKnownActiveProject)
      return enqueueStorageWrite(storageKey, async () => this.update(projectId, reportId, (report) => report.status === 'submitted' ? {
        ...report,
        status: decision,
        feedback: { decision, message, createdAt: new Date().toISOString() },
      } : null))
    })
  }

  private async update(projectId: string, reportId: string, apply: (report: Report) => Report | null): Promise<Report | null> {
    const reports = await this.readAll(true)
    const index = reports.findIndex((report) => report.id === reportId && report.projectId === projectId)
    if (index === -1) return null
    const updated = apply(reports[index])
    if (!updated) return null
    reports[index] = updated
    window.localStorage.setItem(storageKey, JSON.stringify(reports))
    return updated
  }


  private async readAll(strict = false): Promise<Report[]> {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        if (strict) throw new Error('Rapor verileri güvenli biçimde okunamadı')
        return []
      }
      const normalized = parsed.map((item) => isReport(item) ? item : migrateLegacyReport(item))
      if (strict && normalized.some((item) => item === null)) throw new Error('Rapor verileri güvenli biçimde okunamadı')
      const reports = normalized.filter((item): item is Report => item !== null)
      if (strict && !hasValidVersionChains(reports)) throw new Error('Rapor verileri güvenli biçimde okunamadı')
      return reports
    } catch (error) {
      if (strict) {
        if (error instanceof Error && error.message === 'Rapor verileri güvenli biçimde okunamadı') throw error
        throw new Error('Rapor verileri güvenli biçimde okunamadı')
      }
      return []
    }
  }
}
