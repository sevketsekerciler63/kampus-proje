import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'
import './App.css'
import { LocalStorageProjectRepository, type ProjectRepository } from './repositories/projectRepository'
import { LocalStorageTaskRepository, type TaskRepository } from './repositories/taskRepository'
import { LocalStorageReportRepository, type ReportRepository } from './repositories/reportRepository'
import { LocalStorageMemberRepository, type MemberRepository } from './repositories/memberRepository'
import { LocalStorageMilestoneRepository, type MilestoneRepository } from './repositories/milestoneRepository'
import { LocalStorageDeliverableRepository, type DeliverableRepository } from './repositories/deliverableRepository'
import { exportLocalStorageBackup, importLocalStorageBackup } from './repositories/localBackup'
import type { Project, ProjectInput, ProjectValidationErrors } from './types/project'
import type { Task, TaskInput, TaskPriority, TaskStatus, TaskValidationErrors } from './types/task'
import type { FeedbackDecision, Report, ReportInput, ReportStatus, ReportValidationErrors } from './types/report'
import type { Member, MemberInput, MemberValidationErrors } from './types/member'
import type { Milestone, MilestoneInput, MilestoneStatus, MilestoneValidationErrors } from './types/milestone'
import type { Deliverable, DeliverableInput, DeliverableStatus } from './types/deliverable'

const demoProjects: Project[] = [
  {
    id: 'demo-yesil-kampus',
    name: 'Yağmur Suyu İzleme Sistemi',
    problem: 'Saha ölçümleri tek bir görünümde takip edilemiyor.',
    goal: 'Su seviyesi verisini proje ekibi için görünür kılmak.',
    scope: 'Sensör verisi ve ilk gösterge paneli taslağı.',
    advisor: 'Dr. Ece Demir',
    createdAt: '2026-10-01T09:00:00.000Z',
  },
]

const demoTasks: Task[] = [
  {
    id: 'demo-sensor-yerlesimi',
    projectId: 'demo-yesil-kampus',
    title: 'Sensör yerleşimini gözden geçir',
    description: 'Örnek saha noktalarını proje taslağındaki kapsama göre kontrol et.',
    assigneeName: 'Demo üye: Ayşe Kaya',
    status: 'in_progress',
    createdAt: '2026-10-01T09:00:00.000Z',
  },
]

const demoDeliverables: Deliverable[] = [
  {
    id: 'demo-donem-raporu',
    projectId: 'demo-yesil-kampus',
    title: 'Dönem proje raporu',
    description: 'Dönem sonunda danışmana sunulacak proje raporu.',
    dueDate: '2026-10-16',
    status: 'planned',
    createdAt: '2026-10-01T09:00:00.000Z',
  },
]

const demoMembers: Member[] = [
  { id: 'demo-member-ayse', projectId: 'demo-yesil-kampus', name: 'Demo üye: Ayşe Kaya', email: 'ayse@demo.local', responsibility: 'Arayüz ve saha akışı', createdAt: '2026-10-01T09:00:00.000Z' },
  { id: 'demo-member-mehmet', projectId: 'demo-yesil-kampus', name: 'Demo üye: Mehmet Aras', email: 'mehmet@demo.local', responsibility: 'Sensör ve veri akışı', createdAt: '2026-10-01T09:00:00.000Z' },
]
const emptyProjectForm: ProjectInput = { name: '', problem: '', goal: '', scope: '', advisor: '' }
const emptyTaskForm: Omit<TaskInput, 'projectId'> = { title: '', description: '', assigneeName: '', dueDate: '', status: 'todo', priority: 'medium' }
const emptyReportForm: Omit<ReportInput, 'projectId'> = { weekStart: '', completedThisWeek: '', blockers: '', nextWeekPlan: '', evidenceUrl: '' }
const emptyMemberForm: Omit<MemberInput, 'projectId'> = { name: '', email: '', responsibility: '' }
const emptyMilestoneForm: Omit<MilestoneInput, 'projectId'> = { title: '', description: '', dueDate: '', status: 'planned' }
const emptyDeliverableForm: Omit<DeliverableInput, 'projectId'> = { title: '', description: '', dueDate: '', status: 'planned', evidenceUrl: '', assigneeName: '' }
const deliverableTemplates = [
  { id: 'project-proposal', label: 'Proje önerisi', title: 'Proje önerisi', description: 'Projenin problem, amaç, kapsam ve beklenen çıktılarını açıklayan öneri belgesi.' },
  { id: 'requirements-analysis', label: 'Gereksinim/analiz belgesi', title: 'Gereksinim/analiz belgesi', description: 'Kullanıcı ihtiyaçlarını, gereksinimleri ve analiz bulgularını içeren belge.' },
  { id: 'design-prototype', label: 'Tasarım/prototip', title: 'Tasarım/prototip', description: 'Çözüm tasarımını ve doğrulanabilir prototip çıktısını içeren teslim.' },
  { id: 'progress-report', label: 'Ara rapor', title: 'Ara rapor', description: 'Dönem içindeki ilerlemeyi, yapılan çalışmaları ve sonraki adımları özetleyen rapor.' },
  { id: 'final-report', label: 'Final raporu', title: 'Final raporu', description: 'Projenin sonuçlarını, değerlendirmesini ve eklerini içeren final raporu.' },
  { id: 'presentation-demo', label: 'Sunum/demo', title: 'Sunum/demo', description: 'Proje çıktılarının sunumu ve canlı veya kayıtlı demo materyali.' },
] as const
type DeliverableTemplateId = typeof deliverableTemplates[number]['id']
type WorkspaceView = 'overview' | 'team' | 'tasks' | 'milestones' | 'deliverables' | 'reports'
type ProjectTaskSummary = { total: number; completed: number; attention: number } | null

function projectTaskSummaryLabel(summary: ProjectTaskSummary | undefined) {
  if (summary === undefined) return 'Görev özeti yükleniyor…'
  if (summary === null) return 'Görev özeti yüklenemedi.'
  return `${summary.total} görev · ${summary.completed} tamamlandı · ${summary.attention} dikkat`
}

function mergeProjectTasks(stored: Task[], projectId: string) {
  const tasksById = new Map(demoTasks.filter((task) => task.projectId === projectId).map((task) => [task.id, task]))
  stored.forEach((task) => tasksById.set(task.id, task))
  return [...tasksById.values()]
}

function mergeProjectDeliverables(stored: Deliverable[], projectId: string) {
  const byId = new Map(demoDeliverables.filter((item) => item.projectId === projectId).map((item) => [item.id, item]))
  stored.forEach((item) => byId.set(item.id, item))
  return [...byId.values()]
}

function summarizeProjectTasks(tasks: Task[], todayIso: string): Exclude<ProjectTaskSummary, null> {
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    attention: tasks.filter((task) => task.status !== 'completed' && (task.priority === 'high' || Boolean(task.dueDate && task.dueDate < todayIso))).length,
  }
}

function currentLocalDateIso() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function validateProject(input: ProjectInput): ProjectValidationErrors {
  const errors: ProjectValidationErrors = {}
  if (!input.name.trim()) errors.name = 'Proje adı gerekli.'
  if (input.problem.trim().length < 20) errors.problem = 'Problem en az 20 karakter olmalı.'
  if (input.goal.trim().length < 20) errors.goal = 'Amaç en az 20 karakter olmalı.'
  if (input.scope.trim().length < 10) errors.scope = 'Kapsam en az 10 karakter olmalı.'
  if (!input.advisor.trim()) errors.advisor = 'Danışman adı gerekli.'
  return errors
}

function validateTask(input: Omit<TaskInput, 'projectId'>): TaskValidationErrors {
  const errors: TaskValidationErrors = {}
  if (!input.title.trim()) errors.title = 'Görev başlığı gerekli.'
  if (input.description.trim().length < 10) errors.description = 'Açıklama en az 10 karakter olmalı.'
  if (!input.assigneeName) errors.assigneeName = 'Ekip sorumlusu seçimi gerekli.'
  return errors
}

function statusLabel(status: TaskStatus) {
  return { todo: 'Yapılacak', in_progress: 'Devam ediyor', completed: 'Tamamlandı' }[status]
}

function priorityLabel(priority: TaskPriority | undefined) {
  return { low: 'Düşük', medium: 'Orta', high: 'Yüksek' }[priority ?? 'medium']
}

function reportStatusLabel(status: ReportStatus) {
  return { draft: 'Taslak', submitted: 'Gönderildi', reviewed: 'İncelendi', changes_requested: 'Düzeltme istendi' }[status]
}

function reportChainKey(report: Report, allReports: Report[]) {
  if (report.chainId) return report.chainId
  let current = report
  const visited = new Set<string>()
  while (current.previousVersionId && !visited.has(current.id)) {
    visited.add(current.id)
    const previous = allReports.find((item) => item.id === current.previousVersionId)
    if (!previous) break
    current = previous
  }
  return current.id
}

function validateReport(input: Omit<ReportInput, 'projectId'>): ReportValidationErrors {
  const errors: ReportValidationErrors = {}
  if (!input.weekStart) errors.weekStart = 'Hafta başlangıcı gerekli.'
  if (!input.completedThisWeek.trim()) errors.completedThisWeek = 'Bu hafta tamamlananlar gerekli.'
  if (!input.blockers.trim()) errors.blockers = 'Engel yok ifadesini seçin veya engelleri yazın.'
  if (!input.nextWeekPlan.trim()) errors.nextWeekPlan = 'Gelecek hafta planı gerekli.'
  if (input.evidenceUrl) { try { const url = new URL(input.evidenceUrl); if (url.protocol !== 'http:' && url.protocol !== 'https:') errors.evidenceUrl = 'Kanıt bağlantısı yalnız http veya https olmalı.' } catch { errors.evidenceUrl = 'Kanıt bağlantısı yalnız http veya https olmalı.' } }
  return errors
}

function validateMember(input: Omit<MemberInput, 'projectId'>): MemberValidationErrors {
  const errors: MemberValidationErrors = {}
  if (!input.name.trim()) errors.name = 'Üye adı gerekli.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = 'Geçerli bir e-posta adresi gerekli.'
  if (!input.responsibility.trim()) errors.responsibility = 'Sorumluluk gerekli.'
  return errors
}

function validateMilestone(input: Omit<MilestoneInput, 'projectId'>): MilestoneValidationErrors {
  const errors: MilestoneValidationErrors = {}
  if (!input.title.trim()) errors.title = 'Proje aşaması başlığı gerekli.'
  if (input.description.trim().length < 10) errors.description = 'Açıklama en az 10 karakter olmalı.'
  if (!input.dueDate) errors.dueDate = 'Teslim tarihi gerekli.'
  return errors
}

function milestoneStatusLabel(status: MilestoneStatus) {
  return { planned: 'Planlandı', in_progress: 'Devam ediyor', completed: 'Tamamlandı' }[status]
}

function deliverableStatusLabel(status: DeliverableStatus) {
  return { planned: 'Planlandı', preparing: 'Hazırlanıyor', ready: 'Hazır', submitted: 'Gönderildi' }[status]
}

function validateDeliverable(input: Omit<DeliverableInput, 'projectId'>) {
  const errors: Partial<Record<'title' | 'description' | 'dueDate' | 'evidenceUrl', string>> = {}
  if (!input.title.trim()) errors.title = 'Teslim başlığı gerekli.'
  if (input.description.trim().length < 10) errors.description = 'Açıklama en az 10 karakter olmalı.'
  if (!input.dueDate) errors.dueDate = 'Teslim tarihi gerekli.'
  if (input.status === 'ready' || input.status === 'submitted') {
    try {
      const url = new URL(input.evidenceUrl ?? '')
      if (url.protocol !== 'http:' && url.protocol !== 'https:') errors.evidenceUrl = 'Hazır veya gönderildi teslim için geçerli bir http(s) kanıt URLsi gerekli.'
    } catch { errors.evidenceUrl = 'Hazır veya gönderildi teslim için geçerli bir http(s) kanıt URLsi gerekli.' }
  }
  return errors
}

interface AppProps {
  repository?: ProjectRepository
  taskRepository?: TaskRepository
  reportRepository?: ReportRepository
  memberRepository?: MemberRepository
  milestoneRepository?: MilestoneRepository
  deliverableRepository?: DeliverableRepository
}

const defaultProjectRepository = new LocalStorageProjectRepository()
const defaultTaskRepository = new LocalStorageTaskRepository((projectId) => demoProjects.some((project) => project.id === projectId && !project.archivedAt))
const defaultReportRepository = new LocalStorageReportRepository((projectId) => demoProjects.some((project) => project.id === projectId && !project.archivedAt))
const defaultMemberRepository = new LocalStorageMemberRepository((projectId) => demoProjects.some((project) => project.id === projectId && !project.archivedAt))
const defaultMilestoneRepository = new LocalStorageMilestoneRepository((projectId) => demoProjects.some((project) => project.id === projectId && !project.archivedAt))
const defaultDeliverableRepository = new LocalStorageDeliverableRepository((projectId) => demoProjects.some((project) => project.id === projectId && !project.archivedAt))

function App({ repository = defaultProjectRepository, taskRepository = defaultTaskRepository, reportRepository = defaultReportRepository, memberRepository = defaultMemberRepository, milestoneRepository = defaultMilestoneRepository, deliverableRepository = defaultDeliverableRepository }: AppProps) {
  const [projects, setProjects] = useState<Project[]>(demoProjects)
  const [projectTaskSummaries, setProjectTaskSummaries] = useState<Record<string, ProjectTaskSummary>>({})
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activeWorkspaceView, setActiveWorkspaceView] = useState<WorkspaceView>('overview')
  const [tasks, setTasks] = useState<Task[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [projectForm, setProjectForm] = useState<ProjectInput>(emptyProjectForm)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [showArchivedProjects, setShowArchivedProjects] = useState(false)
  const [todayIso, setTodayIso] = useState(currentLocalDateIso)
  const [taskForm, setTaskForm] = useState<Omit<TaskInput, 'projectId'>>(emptyTaskForm)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [isMilestoneFormOpen, setIsMilestoneFormOpen] = useState(false)
  const [isDeliverableFormOpen, setIsDeliverableFormOpen] = useState(false)
  const [isReportFormOpen, setIsReportFormOpen] = useState(false)
  const [showAdvancedTaskFilters, setShowAdvancedTaskFilters] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState('all')
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [taskDueFilter, setTaskDueFilter] = useState<'all' | 'overdue'>('all')
  const [reportStatusFilter, setReportStatusFilter] = useState<ReportStatus | 'all'>('all')
  const [reportForm, setReportForm] = useState<Omit<ReportInput, 'projectId'>>(emptyReportForm)
  const [memberForm, setMemberForm] = useState<Omit<MemberInput, 'projectId'>>(emptyMemberForm)
  const [milestoneForm, setMilestoneForm] = useState<Omit<MilestoneInput, 'projectId'>>(emptyMilestoneForm)
  const [deliverableForm, setDeliverableForm] = useState<Omit<DeliverableInput, 'projectId'>>(emptyDeliverableForm)
  const [selectedDeliverableTemplate, setSelectedDeliverableTemplate] = useState<DeliverableTemplateId | ''>('')
  const [editingDeliverableId, setEditingDeliverableId] = useState<string | null>(null)
  const [projectErrors, setProjectErrors] = useState<ProjectValidationErrors>({})
  const [taskErrors, setTaskErrors] = useState<TaskValidationErrors>({})
  const [reportErrors, setReportErrors] = useState<ReportValidationErrors>({})
  const [memberErrors, setMemberErrors] = useState<MemberValidationErrors>({})
  const [milestoneErrors, setMilestoneErrors] = useState<MilestoneValidationErrors>({})
  const [deliverableErrors, setDeliverableErrors] = useState<Partial<Record<'title' | 'description' | 'dueDate' | 'evidenceUrl', string>>>({})
  const [projectStatus, setProjectStatus] = useState('')
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [projectLoadError, setProjectLoadError] = useState('')
  const [taskStatusMessage, setTaskStatusMessage] = useState('')
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)
  const [taskLoadError, setTaskLoadError] = useState(false)
  const [reportStatusMessage, setReportStatusMessage] = useState('')
  const [isLoadingReports, setIsLoadingReports] = useState(false)
  const [reportLoadError, setReportLoadError] = useState(false)
  const [memberStatusMessage, setMemberStatusMessage] = useState('')
  const [milestoneStatusMessage, setMilestoneStatusMessage] = useState('')
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [memberLoadError, setMemberLoadError] = useState(false)
  const [isLoadingMilestones, setIsLoadingMilestones] = useState(false)
  const [milestoneLoadError, setMilestoneLoadError] = useState(false)
  const [isLoadingDeliverables, setIsLoadingDeliverables] = useState(false)
  const [deliverableLoadError, setDeliverableLoadError] = useState(false)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [isSavingReport, setIsSavingReport] = useState(false)
  const [isSavingMember, setIsSavingMember] = useState(false)
  const [isSavingMilestone, setIsSavingMilestone] = useState(false)
  const [isSavingDeliverable, setIsSavingDeliverable] = useState(false)
  const [deliverableStatusMessage, setDeliverableStatusMessage] = useState('')
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [backupStatus, setBackupStatus] = useState('')
  const [backupError, setBackupError] = useState('')
  const [isExportingBackup, setIsExportingBackup] = useState(false)
  const [isRestoringBackup, setIsRestoringBackup] = useState(false)
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(new Set())
  const [updatingReportIds, setUpdatingReportIds] = useState<Set<string>>(new Set())
  const [updatingMilestoneIds, setUpdatingMilestoneIds] = useState<Set<string>>(new Set())
  const [updatingDeliverableIds, setUpdatingDeliverableIds] = useState<Set<string>>(new Set())
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({})
  const [revisionSourceId, setRevisionSourceId] = useState<string | undefined>()
  const selectedProjectIdRef = useRef<string | null>(null)
  const backupFileInputRef = useRef<HTMLInputElement>(null)
  const taskRequestIdRef = useRef(0)
  const memberRequestIdRef = useRef(0)
  const milestoneRequestIdRef = useRef(0)
  const reportRequestIdRef = useRef(0)
  const deliverableRequestIdRef = useRef(0)
  const projectFormTitleId = useId()
  const taskFormTitleId = useId()
  const reportFormTitleId = useId()
  const memberFormTitleId = useId()
  const milestoneFormTitleId = useId()
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null
  const completedTaskCount = tasks.filter((task) => task.status === 'completed').length
  const inProgressTaskCount = tasks.filter((task) => task.status === 'in_progress').length
  const taskProgress = tasks.length === 0 ? 0 : Math.round((completedTaskCount / tasks.length) * 100)
  const openTasks = tasks.filter((task) => task.status !== 'completed')
  const overdueTasks = openTasks.filter((task) => Boolean(task.dueDate && task.dueDate < todayIso))
  const highPriorityTasks = openTasks.filter((task) => task.priority === 'high')
  const attentionTasks = openTasks
    .filter((task) => task.priority === 'high' || Boolean(task.dueDate && task.dueDate < todayIso))
    .sort((a, b) => {
      const aOverdue = Boolean(a.dueDate && a.dueDate < todayIso)
      const bOverdue = Boolean(b.dueDate && b.dueDate < todayIso)
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
    })
  const sortedReports = [...reports].sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.version - a.version)
  const filteredReports = sortedReports.filter((report) => reportStatusFilter === 'all' || report.status === reportStatusFilter)
  const reportVersionCounts = reports.reduce<Record<string, number>>((counts, report) => { const key = reportChainKey(report, reports); counts[key] = (counts[key] ?? 0) + 1; return counts }, {})
  const reportLatestVersions = reports.reduce<Record<string, number>>((versions, report) => { const key = reportChainKey(report, reports); versions[key] = Math.max(versions[key] ?? 0, report.version); return versions }, {})
  const latestReport = sortedReports[0]
  const nextMilestone = [...milestones].filter((item) => item.status !== 'completed').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const readyDeliverableCount = deliverables.filter((item) => item.status === 'ready').length
  const overdueDeliverableCount = deliverables.filter((item) => item.status !== 'submitted' && Boolean(item.dueDate && item.dueDate < todayIso)).length
  const nextDeliverable = [...deliverables].filter((item) => item.status !== 'submitted').sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'))[0]
  const normalizedTaskSearch = taskSearch.trim().toLocaleLowerCase('tr-TR')
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = !normalizedTaskSearch || `${task.title} ${task.description}`.toLocaleLowerCase('tr-TR').includes(normalizedTaskSearch)
    const matchesStatus = taskStatusFilter === 'all' || task.status === taskStatusFilter
    const matchesAssignee = taskAssigneeFilter === 'all' || task.assigneeName === taskAssigneeFilter
    const matchesPriority = taskPriorityFilter === 'all' || (task.priority ?? 'medium') === taskPriorityFilter
    const matchesDue = taskDueFilter === 'all' || Boolean(task.status !== 'completed' && task.dueDate && task.dueDate < todayIso)
    return matchesSearch && matchesStatus && matchesAssignee && matchesPriority && matchesDue
  }).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority ?? 'medium'] - { high: 0, medium: 1, low: 2 }[b.priority ?? 'medium']))
  const visibleProjects = projects.filter((project) => showArchivedProjects ? Boolean(project.archivedAt) : !project.archivedAt)

  useEffect(() => {
    const timer = window.setInterval(() => setTodayIso(currentLocalDateIso()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    repository.list().then((stored) => {
      if (!cancelled) {
        setProjects([...stored, ...demoProjects])
        setProjectLoadError('')
      }
    }).catch(() => {
      if (!cancelled) {
        setProjects([])
        setProjectLoadError('Projeler yüklenemedi. Tarayıcı depolama iznini kontrol edip sayfayı yenileyin.')
      }
    }).finally(() => {
      if (!cancelled) setIsLoadingProjects(false)
    })
    return () => { cancelled = true }
  }, [repository])

  useEffect(() => {
    if (isLoadingProjects || projectLoadError) return
    let cancelled = false
    Promise.all(projects.map(async (project) => {
      try {
        const stored = await taskRepository.listByProject(project.id)
        const summary = summarizeProjectTasks(mergeProjectTasks(stored, project.id), todayIso)
        return [project.id, summary] as const
      } catch {
        return [project.id, null] as const
      }
    })).then((entries) => {
      if (!cancelled) setProjectTaskSummaries(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
  }, [projects, taskRepository, todayIso, isLoadingProjects, projectLoadError])

  async function refreshProjectTaskSummary(projectId: string) {
    try {
      const stored = await taskRepository.listByProject(projectId)
      const summary = summarizeProjectTasks(mergeProjectTasks(stored, projectId), todayIso)
      setProjectTaskSummaries((current) => ({ ...current, [projectId]: summary }))
    } catch {
      setProjectTaskSummaries((current) => ({ ...current, [projectId]: null }))
    }
  }

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
    if (!selectedProjectId) return
    let cancelled = false
    const requestedProjectId = selectedProjectId
    const requestId = ++taskRequestIdRef.current
    taskRepository.listByProject(requestedProjectId).then((stored) => {
      if (cancelled || taskRequestIdRef.current !== requestId || selectedProjectIdRef.current !== requestedProjectId) return
      setTasks(mergeProjectTasks(stored, requestedProjectId))
      setIsLoadingTasks(false)
      setTaskLoadError(false)
      setTaskStatusMessage('')
    }).catch(() => {
      if (!cancelled && taskRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) {
        setIsLoadingTasks(false)
        setTaskLoadError(true)
        setTaskStatusMessage('Görevler yüklenemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
      }
    })
    return () => { cancelled = true }
  }, [selectedProjectId, taskRepository])

  useEffect(() => {
    if (!selectedProjectId) return
    let cancelled = false
    const requestedProjectId = selectedProjectId
    const requestId = ++reportRequestIdRef.current
    reportRepository.listByProject(requestedProjectId).then((stored) => {
      if (!cancelled && reportRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) { setReports(stored); setIsLoadingReports(false); setReportLoadError(false); setReportStatusMessage('') }
    }).catch(() => {
      if (!cancelled && reportRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) { setIsLoadingReports(false); setReportLoadError(true); setReportStatusMessage('Raporlar yüklenemedi. Tarayıcı depolama iznini kontrol edin.') }
    })
    return () => { cancelled = true }
  }, [selectedProjectId, reportRepository])


  useEffect(() => {
    if (!selectedProjectId) return
    let cancelled = false
    const requestedProjectId = selectedProjectId
    const requestId = ++memberRequestIdRef.current
    memberRepository.listByProject(requestedProjectId).then((stored) => {
      if (cancelled || memberRequestIdRef.current !== requestId || selectedProjectIdRef.current !== requestedProjectId) return
      const demos = demoMembers.filter((member) => member.projectId === requestedProjectId)
      setMembers([...stored, ...demos])
      setIsLoadingMembers(false)
      setMemberLoadError(false)
      setMemberStatusMessage('')
    }).catch(() => {
      if (!cancelled && memberRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) { setIsLoadingMembers(false); setMemberLoadError(true); setMemberStatusMessage('Ekip üyeleri yüklenemedi.') }
    })
    return () => { cancelled = true }
  }, [selectedProjectId, memberRepository])

  useEffect(() => {
    if (!selectedProjectId) return
    let cancelled = false
    const requestedProjectId = selectedProjectId
    const requestId = ++deliverableRequestIdRef.current
    deliverableRepository.listByProject(requestedProjectId).then((stored) => {
      if (!cancelled && deliverableRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) { setDeliverables(mergeProjectDeliverables(stored, requestedProjectId)); setIsLoadingDeliverables(false); setDeliverableLoadError(false); setDeliverableStatusMessage('') }
    }).catch(() => {
      if (!cancelled && deliverableRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) { setIsLoadingDeliverables(false); setDeliverableLoadError(true); setDeliverableStatusMessage('Teslimler yüklenemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.') }
    })
    return () => { cancelled = true }
  }, [selectedProjectId, deliverableRepository])

  useEffect(() => {
    if (!selectedProjectId) return
    let cancelled = false
    const requestedProjectId = selectedProjectId
    const requestId = ++milestoneRequestIdRef.current
    milestoneRepository.listByProject(requestedProjectId).then((stored) => {
      if (!cancelled && milestoneRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) {
        setMilestones(stored)
        setIsLoadingMilestones(false)
        setMilestoneLoadError(false)
        setMilestoneStatusMessage('')
      }
    }).catch(() => {
      if (!cancelled && milestoneRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) { setIsLoadingMilestones(false); setMilestoneLoadError(true); setMilestoneStatusMessage('Proje aşamaları yüklenemedi.') }
    })
    return () => { cancelled = true }
  }, [selectedProjectId, milestoneRepository])

  function updateProjectField(field: keyof ProjectInput, value: string) {
    setProjectForm((current) => ({ ...current, [field]: value }))
    setProjectErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function retryProjectLoad() {
    setIsLoadingProjects(true)
    setProjectLoadError('')
    try {
      const stored = await repository.list()
      setProjects([...stored, ...demoProjects])
    } catch {
      setProjects([])
      setProjectLoadError('Projeler yüklenemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
    } finally {
      setIsLoadingProjects(false)
    }
  }

  async function handleBackupDownload() {
    setIsExportingBackup(true)
    setBackupStatus('')
    setBackupError('')
    try {
      const result = await exportLocalStorageBackup()
      if (!result.ok) {
        setBackupError(result.message)
        return
      }
      const blob = new Blob([result.data], { type: 'application/json' })
      const objectUrl = URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      downloadLink.href = objectUrl
      downloadLink.download = 'kampus-proje-yedek.json'
      document.body.append(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      URL.revokeObjectURL(objectUrl)
      setBackupStatus('Yedek indirildi.')
    } catch {
      setBackupError('Yedek indirilemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
    } finally {
      setIsExportingBackup(false)
    }
  }

  function handleBackupFileChange(event: ChangeEvent<HTMLInputElement>) {
    setBackupFile(event.target.files?.[0] ?? null)
    setBackupStatus('')
    setBackupError('')
  }

  async function refreshApplicationStateAfterBackupRestore() {
    selectedProjectIdRef.current = null
    setSelectedProjectId(null)
    setActiveWorkspaceView('overview')
    setTasks([])
    setReports([])
    setMembers([])
    setMilestones([])
    setDeliverables([])
    setProjectTaskSummaries({})
    setIsLoadingProjects(true)
    setProjectLoadError('')
    try {
      const stored = await repository.list()
      setProjects([...stored, ...demoProjects])
    } catch {
      setProjects([])
      setProjectLoadError('Yedek geri yüklendi, ancak projeler yeniden okunamadı. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
      throw new Error('Yedek sonrası uygulama durumu yenilenemedi.')
    } finally {
      setIsLoadingProjects(false)
    }
  }

  async function handleBackupRestore() {
    if (!backupFile) return
    setIsRestoringBackup(true)
    setBackupStatus('')
    setBackupError('')
    try {
      const result = await importLocalStorageBackup(await backupFile.text())
      if (!result.ok) {
        setBackupError(result.message)
        return
      }
      try {
        await refreshApplicationStateAfterBackupRestore()
        setBackupFile(null)
        if (backupFileInputRef.current) backupFileInputRef.current.value = ''
        setBackupStatus('Yedek geri yüklendi. Uygulama verileri güvenli şekilde yenilendi.')
      } catch {
        setBackupError('Yedek geri yüklendi, ancak uygulama durumu yenilenemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
      }
    } catch {
      setBackupError('Yedek dosyası okunamadı. Mevcut uygulama verileri korunmuştur.')
    } finally {
      setIsRestoringBackup(false)
    }
  }

  async function retryTaskLoad() {
    if (!selectedProjectId) return
    const requestedProjectId = selectedProjectId
    const requestId = ++taskRequestIdRef.current
    setIsLoadingTasks(true)
    setTaskLoadError(false)
    setTaskStatusMessage('')
    try {
      const stored = await taskRepository.listByProject(requestedProjectId)
      if (taskRequestIdRef.current !== requestId || selectedProjectIdRef.current !== requestedProjectId) return
      setTasks(mergeProjectTasks(stored, requestedProjectId))
    } catch {
      if (taskRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) {
        setTaskLoadError(true)
        setTaskStatusMessage('Görevler yüklenemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
      }
    } finally {
      if (taskRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) setIsLoadingTasks(false)
    }
  }

  async function retryMemberLoad() {
    if (!selectedProjectId) return
    const requestedProjectId = selectedProjectId
    const requestId = ++memberRequestIdRef.current
    setIsLoadingMembers(true)
    setMemberLoadError(false)
    setMemberStatusMessage('')
    try {
      const stored = await memberRepository.listByProject(requestedProjectId)
      if (memberRequestIdRef.current !== requestId || selectedProjectIdRef.current !== requestedProjectId) return
      const demos = demoMembers.filter((member) => member.projectId === requestedProjectId)
      setMembers([...stored, ...demos])
    } catch {
      if (memberRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) {
        setMemberLoadError(true)
        setMemberStatusMessage('Ekip üyeleri yüklenemedi.')
      }
    } finally {
      if (memberRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) setIsLoadingMembers(false)
    }
  }

  async function retryDeliverableLoad() {
    if (!selectedProjectId) return
    const requestedProjectId = selectedProjectId
    const requestId = ++deliverableRequestIdRef.current
    setIsLoadingDeliverables(true); setDeliverableLoadError(false); setDeliverableStatusMessage('')
    try {
      const stored = await deliverableRepository.listByProject(requestedProjectId)
      if (deliverableRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) setDeliverables(mergeProjectDeliverables(stored, requestedProjectId))
    } catch {
      if (deliverableRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) { setDeliverableLoadError(true); setDeliverableStatusMessage('Teslimler yüklenemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.') }
    } finally { if (deliverableRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) setIsLoadingDeliverables(false) }
  }

  async function retryMilestoneLoad() {
    if (!selectedProjectId) return
    const requestedProjectId = selectedProjectId
    const requestId = ++milestoneRequestIdRef.current
    setIsLoadingMilestones(true)
    setMilestoneLoadError(false)
    setMilestoneStatusMessage('')
    try {
      const stored = await milestoneRepository.listByProject(requestedProjectId)
      if (milestoneRequestIdRef.current !== requestId || selectedProjectIdRef.current !== requestedProjectId) return
      setMilestones(stored)
    } catch {
      if (milestoneRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) {
        setMilestoneLoadError(true)
        setMilestoneStatusMessage('Proje aşamaları yüklenemedi.')
      }
    } finally {
      if (milestoneRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) setIsLoadingMilestones(false)
    }
  }

  async function retryReportLoad() {
    if (!selectedProjectId) return
    const requestedProjectId = selectedProjectId
    const requestId = ++reportRequestIdRef.current
    setIsLoadingReports(true)
    setReportLoadError(false)
    setReportStatusMessage('')
    try {
      const stored = await reportRepository.listByProject(requestedProjectId)
      if (reportRequestIdRef.current !== requestId || selectedProjectIdRef.current !== requestedProjectId) return
      setReports(stored)
    } catch {
      if (reportRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) {
        setReportLoadError(true)
        setReportStatusMessage('Raporlar yüklenemedi. Tarayıcı depolama iznini kontrol edin.')
      }
    } finally {
      if (reportRequestIdRef.current === requestId && selectedProjectIdRef.current === requestedProjectId) setIsLoadingReports(false)
    }
  }

  function selectProject(projectId: string) {
    selectedProjectIdRef.current = projectId
    setSelectedProjectId(projectId)
    setActiveWorkspaceView('overview')
    setTasks([])
    setTaskForm(emptyTaskForm)
    setEditingTaskId(null)
    setIsTaskFormOpen(false)
    setIsMilestoneFormOpen(false)
    setIsDeliverableFormOpen(false)
    setIsReportFormOpen(false)
    setShowAdvancedTaskFilters(false)
    setTaskSearch('')
    setTaskStatusFilter('all')
    setTaskAssigneeFilter('all')
    setTaskPriorityFilter('all')
    setTaskDueFilter('all'); setReportStatusFilter('all')
    setMembers([])
    setMilestones([])
    setDeliverables([])
    setReports([])
    setIsLoadingReports(true)
    setReportLoadError(false)
    setIsLoadingTasks(true)
    setTaskLoadError(false)
    setIsLoadingMembers(true)
    setMemberLoadError(false)
    setIsLoadingMilestones(true)
    setMilestoneLoadError(false)
    setIsLoadingDeliverables(true)
    setDeliverableLoadError(false)
    setDeliverableForm(emptyDeliverableForm)
    setSelectedDeliverableTemplate('')
    setEditingDeliverableId(null)
    setDeliverableErrors({})
    setDeliverableStatusMessage('')
    setTaskStatusMessage('')
    setMemberForm(emptyMemberForm)
    setMemberStatusMessage('')
    setMilestoneForm(emptyMilestoneForm)
    setMilestoneStatusMessage('')
    setReportForm(emptyReportForm)
    setRevisionSourceId(undefined)
    setReportStatusMessage('')
    window.setTimeout(() => document.getElementById('task-board-title')?.focus(), 0)
  }

  function openWorkspaceView(view: WorkspaceView, focusTab = false) {
    setActiveWorkspaceView(view)
    if (focusTab) document.getElementById(`workspace-tab-${view}`)?.focus()
  }

  function handleWorkspaceTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, view: WorkspaceView) {
    const views: WorkspaceView[] = ['overview', 'team', 'tasks', 'milestones', 'deliverables', 'reports']
    const index = views.indexOf(view)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % views.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + views.length) % views.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = views.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    openWorkspaceView(views[nextIndex], true)
  }

  function closeWorkspace() {
    selectedProjectIdRef.current = null
    setSelectedProjectId(null)
    setActiveWorkspaceView('overview')
    setTasks([])
    setTaskForm(emptyTaskForm)
    setEditingTaskId(null)
    setIsTaskFormOpen(false)
    setIsMilestoneFormOpen(false)
    setIsDeliverableFormOpen(false)
    setIsReportFormOpen(false)
    setShowAdvancedTaskFilters(false)
    setTaskSearch('')
    setTaskStatusFilter('all')
    setTaskAssigneeFilter('all')
    setTaskPriorityFilter('all')
    setTaskDueFilter('all'); setReportStatusFilter('all')
    setMembers([])
    setMilestones([])
    setDeliverables([])
    setReports([])
    setIsLoadingReports(false)
    setReportLoadError(false)
    setIsLoadingTasks(false)
    setTaskLoadError(false)
    setIsLoadingMembers(false)
    setMemberLoadError(false)
    setIsLoadingMilestones(false)
    setMilestoneLoadError(false)
    setReportForm(emptyReportForm)
    setReportErrors({})
    setRevisionSourceId(undefined)
    setTaskStatusMessage('')
    setMemberStatusMessage('')
    setMilestoneStatusMessage('')
    setReportStatusMessage('')
    window.setTimeout(() => document.getElementById(projectFormTitleId)?.focus(), 0)
  }

  function startReportRevision(report: Report) {
    setIsReportFormOpen(true)
    setReportForm({
      weekStart: report.weekStart,
      completedThisWeek: report.completedThisWeek,
      blockers: report.blockers,
      nextWeekPlan: report.nextWeekPlan,
      evidenceUrl: report.evidenceUrl ?? '',
    })
    setRevisionSourceId(report.id)
    setReportErrors({})
    setReportStatusMessage(`Sürüm ${report.version + 1} taslağı için önceki içerik forma aktarıldı.`)
    requestAnimationFrame(() => {
      const panel = document.getElementById('workspace-panel-reports')
      if (panel && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function updateTaskField(field: keyof Omit<TaskInput, 'projectId'>, value: string) {
    setTaskForm((current) => ({ ...current, [field]: value }))
    if (field === 'title' || field === 'description' || field === 'assigneeName') {
      setTaskErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  function updateReportField(field: keyof Omit<ReportInput, 'projectId'>, value: string) {
    setReportForm((current) => ({ ...current, [field]: value }))
    setReportErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateProject(projectForm)
    setProjectErrors(nextErrors)
    setProjectStatus('')
    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    const input: ProjectInput = { name: projectForm.name.trim(), problem: projectForm.problem.trim(), goal: projectForm.goal.trim(), scope: projectForm.scope.trim(), advisor: projectForm.advisor.trim() }
    try {
      if (editingProjectId) {
        const updated = await repository.update(editingProjectId, input)
        if (!updated) { setProjectStatus('Proje bulunamadı.'); return }
        setProjects((current) => current.map((project) => project.id === updated.id ? updated : project))
        setEditingProjectId(null)
        setProjectForm(emptyProjectForm)
        setProjectStatus('Proje değişiklikleri kaydedildi.')
      } else {
        const saved = await repository.save(input)
        setProjects((current) => [saved, ...current])
        setProjectForm(emptyProjectForm)
        setProjectStatus('Proje taslağı bu cihazın tarayıcısına kaydedildi.')
      }
    } catch {
      setProjectStatus(editingProjectId ? 'Proje değişiklikleri kaydedilemedi.' : 'Proje taslağı kaydedilemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
    }
  }

  function showTaskRisk(kind: 'overdue' | 'high') {
    setTaskSearch('')
    setTaskStatusFilter('all')
    setTaskAssigneeFilter('all')
    setTaskPriorityFilter(kind === 'high' ? 'high' : 'all')
    setTaskDueFilter(kind === 'overdue' ? 'overdue' : 'all')
    setShowAdvancedTaskFilters(kind === 'high')
    setActiveWorkspaceView('tasks')
  }

  function startProjectEdit(project: Project) {
    if (project.id.startsWith('demo-') || project.archivedAt) return
    setEditingProjectId(project.id)
    setProjectForm({ name: project.name, problem: project.problem, goal: project.goal, scope: project.scope, advisor: project.advisor })
    setProjectErrors({})
    setProjectStatus('Proje bilgileri düzenleme formuna aktarıldı.')
  }

  async function handleProjectArchive(project: Project, archived: boolean) {
    try {
      const updated = await repository.setArchived(project.id, archived)
      if (!updated) { setProjectStatus('Proje bulunamadı.'); return }
      setProjects((current) => current.map((item) => item.id === updated.id ? updated : item))
      if (archived && selectedProjectIdRef.current === project.id) closeWorkspace()
      if (archived && editingProjectId === project.id) {
        setEditingProjectId(null)
        setProjectForm(emptyProjectForm)
        setProjectErrors({})
      }
      if (!archived) setShowArchivedProjects(false)
      setProjectStatus(archived ? 'Proje silinmeden arşivlendi.' : 'Proje yeniden aktif hale getirildi.')
    } catch {
      setProjectStatus(archived ? 'Proje arşivlenemedi. Tarayıcı depolamasını kontrol edip yeniden deneyin.' : 'Proje geri getirilemedi. Tarayıcı depolamasını kontrol edip yeniden deneyin.')
    }
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProject) return
    const nextErrors = validateTask(taskForm)
    setTaskErrors(nextErrors)
    setTaskStatusMessage('')
    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#gorev-panosi [aria-invalid="true"]')?.focus())
      return
    }

    const projectIdAtStart = selectedProject.id
    const input: TaskInput = {
      projectId: projectIdAtStart,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      assigneeName: taskForm.assigneeName,
      dueDate: taskForm.dueDate || undefined,
      status: editingTaskId ? taskForm.status : 'todo',
      priority: taskForm.priority ?? 'medium',
    }
    setIsSavingTask(true)
    try {
      if (editingTaskId) {
        const updated = await taskRepository.update(projectIdAtStart, editingTaskId, input)
        if (selectedProjectIdRef.current !== projectIdAtStart) return
        if (!updated) {
          setTaskStatusMessage('Görev bulunamadı; liste yenilendi.')
          const stored = await taskRepository.listByProject(projectIdAtStart)
          setTasks(mergeProjectTasks(stored, projectIdAtStart))
          void refreshProjectTaskSummary(projectIdAtStart)
          return
        }
        setTasks((current) => current.map((task) => task.id === updated.id ? updated : task))
        void refreshProjectTaskSummary(projectIdAtStart)
        setTaskForm(emptyTaskForm)
        setEditingTaskId(null)
        setIsTaskFormOpen(false)
        setTaskStatusMessage('Görev değişiklikleri kaydedildi.')
      } else {
        const saved = await taskRepository.save(input)
        if (selectedProjectIdRef.current === projectIdAtStart) {
          setTasks((current) => [saved, ...current])
          void refreshProjectTaskSummary(projectIdAtStart)
          setTaskForm(emptyTaskForm)
          setIsTaskFormOpen(false)
          setTaskStatusMessage('Görev bu cihazın tarayıcısına kaydedildi.')
        }
      }
    } catch {
      if (selectedProjectIdRef.current === projectIdAtStart) {
        setTaskStatusMessage(editingTaskId ? 'Görev değişiklikleri kaydedilemedi.' : 'Görev kaydedilemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
      }
    } finally {
      setIsSavingTask(false)
    }
  }

  function startTaskEdit(task: Task) {
    if (task.id.startsWith('demo-')) return
    setEditingTaskId(task.id)
    setIsTaskFormOpen(true)
    setTaskForm({ title: task.title, description: task.description, assigneeName: task.assigneeName, dueDate: task.dueDate ?? '', status: task.status, priority: task.priority ?? 'medium' })
    setTaskErrors({})
    setTaskStatusMessage('Görev bilgileri düzenleme formuna aktarıldı.')
    requestAnimationFrame(() => document.getElementById(taskFormTitleId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  function cancelTaskEdit() {
    setEditingTaskId(null)
    setIsTaskFormOpen(false)
    setTaskForm(emptyTaskForm)
    setTaskErrors({})
    setTaskStatusMessage('Düzenleme iptal edildi.')
  }

  async function handleTaskStatusChange(task: Task, status: TaskStatus) {
    if (!selectedProject) return
    if (task.id.startsWith('demo-')) {
      const nextTasks = tasks.map((currentTask) => currentTask.id === task.id ? { ...currentTask, status } : currentTask)
      setTasks(nextTasks)
      setProjectTaskSummaries((current) => ({ ...current, [selectedProject.id]: summarizeProjectTasks(nextTasks, todayIso) }))
      setTaskStatusMessage('Demo görevinin durumu bu oturumda güncellendi; gerçek ekip veya yetki kaydı değildir.')
      return
    }

    const projectIdAtStart = selectedProject.id
    setUpdatingTaskIds((current) => new Set(current).add(task.id))
    try {
      const updated = await taskRepository.updateStatus(projectIdAtStart, task.id, status)
      if (selectedProjectIdRef.current !== projectIdAtStart) return
      if (!updated) {
        setTaskStatusMessage('Görev bulunamadı veya başka bir işlemde değişti. Görev listesi yenilendi.')
        const stored = await taskRepository.listByProject(projectIdAtStart)
        if (selectedProjectIdRef.current === projectIdAtStart) setTasks(mergeProjectTasks(stored, projectIdAtStart))
        void refreshProjectTaskSummary(projectIdAtStart)
        return
      }
      setTasks((current) => current.map((currentTask) => currentTask.id === task.id ? updated : currentTask))
      void refreshProjectTaskSummary(projectIdAtStart)
      setTaskStatusMessage('Görev durumu bu cihazın tarayıcısına kaydedildi.')
    } catch {
      if (selectedProjectIdRef.current === projectIdAtStart) {
        setTaskStatusMessage('Görev durumu kaydedilemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.')
      }
    } finally {
      setUpdatingTaskIds((current) => {
        const next = new Set(current)
        next.delete(task.id)
        return next
      })
    }
  }


  function updateDeliverableField(field: keyof Omit<DeliverableInput, 'projectId'>, value: string) {
    setDeliverableForm((current) => ({ ...current, [field]: value }))
    if (field !== 'status') setDeliverableErrors((current) => ({ ...current, [field]: undefined }))
  }

  function applyDeliverableTemplate(templateId: DeliverableTemplateId | '') {
    setSelectedDeliverableTemplate(templateId)
    const template = deliverableTemplates.find((item) => item.id === templateId)
    if (!template) return
    setDeliverableForm((current) => ({ ...current, title: template.title, description: template.description }))
    setDeliverableErrors((current) => ({ ...current, title: undefined, description: undefined }))
  }

  async function handleDeliverableSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProject) return
    const errors = validateDeliverable(deliverableForm)
    setDeliverableErrors(errors); setDeliverableStatusMessage('')
    if (Object.keys(errors).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>('#workspace-panel-deliverables [aria-invalid="true"]')?.focus()); return }
    const projectIdAtStart = selectedProject.id
    const input: DeliverableInput = { projectId: projectIdAtStart, title: deliverableForm.title.trim(), description: deliverableForm.description.trim(), dueDate: deliverableForm.dueDate || undefined, status: deliverableForm.status, evidenceUrl: deliverableForm.evidenceUrl || undefined, assigneeName: deliverableForm.assigneeName || undefined }
    setIsSavingDeliverable(true)
    try {
      const saved = editingDeliverableId ? await deliverableRepository.update(projectIdAtStart, editingDeliverableId, input) : await deliverableRepository.save(input)
      if (selectedProjectIdRef.current !== projectIdAtStart) return
      if (!saved) { setDeliverableStatusMessage('Teslim bulunamadı; liste yenilendi.'); void retryDeliverableLoad(); return }
      setDeliverables((current) => editingDeliverableId ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current])
      setDeliverableForm(emptyDeliverableForm); setSelectedDeliverableTemplate(''); setEditingDeliverableId(null); setIsDeliverableFormOpen(false); setDeliverableStatusMessage(editingDeliverableId ? 'Teslim değişiklikleri kaydedildi.' : 'Teslim kaydedildi.')
    } catch { if (selectedProjectIdRef.current === projectIdAtStart) setDeliverableStatusMessage('Teslim kaydedilemedi. Tarayıcı depolama iznini kontrol edip yeniden deneyin.') } finally { setIsSavingDeliverable(false) }
  }

  async function handleDeliverableStatusChange(item: Deliverable, status: DeliverableStatus) {
    if (!selectedProject) return
    const projectIdAtStart = selectedProject.id
    if ((status === 'ready' || status === 'submitted') && !item.evidenceUrl) { setDeliverableStatusMessage('Hazır veya gönderildi durumu için önce teslimi düzenleyip kanıt URLsi ekleyin.'); return }
    setUpdatingDeliverableIds((current) => new Set(current).add(item.id))
    try {
      const updated = await deliverableRepository.updateStatus(projectIdAtStart, item.id, status, item.evidenceUrl)
      if (selectedProjectIdRef.current === projectIdAtStart && updated) { setDeliverables((current) => current.map((currentItem) => currentItem.id === item.id ? updated : currentItem)); setDeliverableStatusMessage('Teslim durumu güncellendi.') }
    } catch { if (selectedProjectIdRef.current === projectIdAtStart) setDeliverableStatusMessage('Teslim durumu kaydedilemedi.') } finally { setUpdatingDeliverableIds((current) => { const next = new Set(current); next.delete(item.id); return next }) }
  }

  function updateMemberField(field: keyof Omit<MemberInput, 'projectId'>, value: string) {
    setMemberForm((current) => ({ ...current, [field]: value }))
    setMemberErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleMemberSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProject) return
    const errors = validateMember(memberForm)
    setMemberErrors(errors)
    setMemberStatusMessage('')
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#workspace-panel-team [aria-invalid="true"]')?.focus())
      return
    }
    const projectIdAtStart = selectedProject.id
    setIsSavingMember(true)
    try {
      const saved = await memberRepository.save({ projectId: projectIdAtStart, name: memberForm.name.trim(), email: memberForm.email.trim(), responsibility: memberForm.responsibility.trim() })
      if (selectedProjectIdRef.current === projectIdAtStart) {
        setMembers((current) => [saved, ...current])
        setMemberForm(emptyMemberForm)
        setMemberStatusMessage('Üye bu projenin yerel ekip listesine eklendi.')
      }
    } catch (error) {
      if (selectedProjectIdRef.current === projectIdAtStart) setMemberStatusMessage(error instanceof Error ? error.message : 'Üye kaydedilemedi.')
    } finally {
      setIsSavingMember(false)
    }
  }

  function updateMilestoneField(field: keyof Omit<MilestoneInput, 'projectId'>, value: string) {
    setMilestoneForm((current) => ({ ...current, [field]: value }))
    if (field === 'title' || field === 'description' || field === 'dueDate') setMilestoneErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleMilestoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProject) return
    const errors = validateMilestone(milestoneForm)
    setMilestoneErrors(errors)
    setMilestoneStatusMessage('')
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#workspace-panel-milestones [aria-invalid="true"]')?.focus())
      return
    }
    const projectIdAtStart = selectedProject.id
    setIsSavingMilestone(true)
    try {
      const saved = await milestoneRepository.save({ projectId: projectIdAtStart, title: milestoneForm.title.trim(), description: milestoneForm.description.trim(), dueDate: milestoneForm.dueDate, status: 'planned' })
      if (selectedProjectIdRef.current === projectIdAtStart) {
        setMilestones((current) => [saved, ...current])
        setMilestoneForm(emptyMilestoneForm)
        setIsMilestoneFormOpen(false)
        setMilestoneStatusMessage('Proje aşaması bu projenin takvimine eklendi.')
      }
    } catch {
      if (selectedProjectIdRef.current === projectIdAtStart) setMilestoneStatusMessage('Proje aşaması kaydedilemedi.')
    } finally { setIsSavingMilestone(false) }
  }

  async function handleMilestoneStatusChange(milestone: Milestone, status: MilestoneStatus) {
    if (!selectedProject) return
    const projectIdAtStart = selectedProject.id
    setUpdatingMilestoneIds((current) => new Set(current).add(milestone.id))
    try {
      const updated = await milestoneRepository.updateStatus(projectIdAtStart, milestone.id, status)
      if (selectedProjectIdRef.current !== projectIdAtStart) return
      if (!updated) { setMilestones(await milestoneRepository.listByProject(projectIdAtStart)); setMilestoneStatusMessage('Proje aşaması bulunamadı; liste yenilendi.'); return }
      setMilestones((current) => current.map((item) => item.id === milestone.id ? updated : item))
      setMilestoneStatusMessage('Proje aşaması durumu güncellendi.')
    } catch {
      if (selectedProjectIdRef.current === projectIdAtStart) setMilestoneStatusMessage('Proje aşaması durumu kaydedilemedi.')
    } finally {
      setUpdatingMilestoneIds((current) => { const next = new Set(current); next.delete(milestone.id); return next })
    }
  }

  async function handleReportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedProject) return
    const errors = validateReport(reportForm)
    setReportErrors(errors)
    if (Object.keys(errors).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>('#workspace-panel-reports [aria-invalid="true"]')?.focus()); return }
    const projectIdAtStart = selectedProject.id
    setIsSavingReport(true)
    try {
      const saved = await reportRepository.createDraft({ projectId: projectIdAtStart, weekStart: reportForm.weekStart, completedThisWeek: reportForm.completedThisWeek.trim(), blockers: reportForm.blockers.trim(), nextWeekPlan: reportForm.nextWeekPlan.trim(), evidenceUrl: reportForm.evidenceUrl || undefined }, revisionSourceId)
      if (selectedProjectIdRef.current === projectIdAtStart) { reportRequestIdRef.current += 1; setIsLoadingReports(false); setReportLoadError(false); setReports((current) => [saved, ...current]); setReportForm(emptyReportForm); setRevisionSourceId(undefined); setIsReportFormOpen(false); setReportStatusMessage(`Rapor sürüm ${saved.version} taslağı bu cihazın tarayıcısına kaydedildi.`) }
    } catch { if (selectedProjectIdRef.current === projectIdAtStart) setReportStatusMessage('Rapor taslağı kaydedilemedi. Tarayıcı depolama iznini kontrol edin.') } finally { setIsSavingReport(false) }
  }

  async function handleReportAction(report: Report, decision: 'submit' | FeedbackDecision) {
    if (!selectedProject) return
    const projectIdAtStart = selectedProject.id
    const message = feedbackText[report.id]?.trim() ?? ''
    if (decision !== 'submit' && !message) { setReportStatusMessage('Danışman geri bildirimi gerekli.'); return }
    setUpdatingReportIds((current) => new Set(current).add(report.id))
    try {
      const updated = decision === 'submit' ? await reportRepository.submit(projectIdAtStart, report.id) : await reportRepository.review(projectIdAtStart, report.id, decision, message)
      if (selectedProjectIdRef.current !== projectIdAtStart) return
      if (!updated) { setReports(await reportRepository.listByProject(projectIdAtStart)); reportRequestIdRef.current += 1; setIsLoadingReports(false); setReportLoadError(false); setReportStatusMessage('Rapor bulunamadı veya değişti; liste yenilendi.'); return }
      setReports((current) => current.map((item) => item.id === report.id ? updated : item))
      reportRequestIdRef.current += 1
      setIsLoadingReports(false)
      setReportLoadError(false)
      setReportStatusMessage(decision === 'submit' ? 'Rapor danışman demo incelemesine gönderildi.' : 'Demo danışman kararı kaydedildi.')
    } catch { if (selectedProjectIdRef.current === projectIdAtStart) setReportStatusMessage('Rapor işlemi kaydedilemedi. Tarayıcı depolama iznini kontrol edin.') } finally { setUpdatingReportIds((current) => { const next = new Set(current); next.delete(report.id); return next }) }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#ana-icerik">Ana içeriğe geç</a>
      <aside className="sidebar" aria-label="Ana menü">
        <div className="brand"><span aria-hidden="true" className="brand-mark">İSTE</span><span><strong>Kampüs Proje</strong><small>Öğrenci proje yönetimi</small></span></div>
        <p className="demo-tag">Demo modunda: kayıtlar yalnız bu cihazın tarayıcısında tutulur.</p>
        <nav><p className="nav-label">Çalışma alanı</p><ul>{selectedProject ? <><li><button type="button" className={activeWorkspaceView === 'overview' ? 'sidebar-action is-active' : 'sidebar-action'} onClick={() => setActiveWorkspaceView('overview')}>Genel Bakış</button></li><li><button type="button" className={activeWorkspaceView === 'team' ? 'sidebar-action is-active' : 'sidebar-action'} onClick={() => setActiveWorkspaceView('team')}>Ekip</button></li><li><button type="button" className={activeWorkspaceView === 'tasks' ? 'sidebar-action is-active' : 'sidebar-action'} onClick={() => setActiveWorkspaceView('tasks')}>Görevler</button></li><li><button type="button" className={activeWorkspaceView === 'milestones' ? 'sidebar-action is-active' : 'sidebar-action'} onClick={() => setActiveWorkspaceView('milestones')}>Proje Aşamaları</button></li><li><button type="button" className={activeWorkspaceView === 'deliverables' ? 'sidebar-action is-active' : 'sidebar-action'} onClick={() => setActiveWorkspaceView('deliverables')}>Teslimler</button></li><li><button type="button" className={activeWorkspaceView === 'reports' ? 'sidebar-action is-active' : 'sidebar-action'} onClick={() => setActiveWorkspaceView('reports')}>Raporlar</button></li></> : <><li><a href="#projeler" aria-current="page">Proje özeti</a></li><li><a href="#proje-olustur">Proje oluştur</a></li><li><a href="#sinirlar">Uygulama sınırları</a></li></>}</ul></nav>
        <div className="sidebar-footer"><strong>İSTE için öğrenci projesi</strong><span>Resmî üniversite sistemi değildir.</span></div>
      </aside>

      <main id="ana-icerik" tabIndex={-1}>
        <header className="topbar"><div><p className="eyebrow">Kampüs Proje / Çalışan yerel demo</p><h1>Proje çalışma alanı</h1></div><span className="demo-badge">Demo veri açıkça etiketlidir</span></header>
        <div className="content">
          {!selectedProject && <>
          <section className="intro" aria-labelledby="intro-title"><p className="eyebrow">Başlangıç</p><h2 id="intro-title">Projenizi, görevleri ve haftalık ilerlemeyi aynı alanda yönetin.</h2><p>Görevler ve raporlar yalnız seçilen proje için listelenir. Danışman değerlendirmesi görünüm demosudur; gerçek giriş veya yetki kontrolü yoktur.</p></section>

          <div className="workspace-grid">
            <section className="panel" id="proje-olustur" aria-labelledby={projectFormTitleId}>
              <div className="panel-heading"><div><p className="eyebrow">{editingProjectId ? 'Proje düzenleme' : 'Yeni taslak'}</p><h2 id={projectFormTitleId} tabIndex={-1}>{editingProjectId ? 'Projeyi düzenle' : 'Proje oluştur'}</h2></div><span>Yerel kayıt</span></div>
              <form noValidate onSubmit={handleProjectSubmit}>
                <Field label="Proje adı" value={projectForm.name} error={projectErrors.name} onChange={(value) => updateProjectField('name', value)} />
                <Field label="Problem" as="textarea" hint="En az 20 karakter." value={projectForm.problem} error={projectErrors.problem} onChange={(value) => updateProjectField('problem', value)} />
                <Field label="Amaç" as="textarea" hint="En az 20 karakter." value={projectForm.goal} error={projectErrors.goal} onChange={(value) => updateProjectField('goal', value)} />
                <Field label="Kapsam" as="textarea" hint="En az 10 karakter." value={projectForm.scope} error={projectErrors.scope} onChange={(value) => updateProjectField('scope', value)} />
                <Field label="Danışman" value={projectForm.advisor} error={projectErrors.advisor} onChange={(value) => updateProjectField('advisor', value)} />
                <div className="form-actions"><button type="submit">{editingProjectId ? 'Proje değişikliklerini kaydet' : 'Proje taslağını kaydet'}</button>{editingProjectId && <button className="secondary-button" type="button" onClick={() => { setEditingProjectId(null); setProjectForm(emptyProjectForm); setProjectErrors({}) }}>İptal</button>}<p role="status" aria-live="polite">{projectStatus}</p></div>
              </form>
            </section>

            <section className="panel project-panel" id="projeler" aria-labelledby="projects-title">
              <div className="panel-heading"><div><p className="eyebrow">Liste</p><h2 id="projects-title">{showArchivedProjects ? 'Arşivlenen projeler' : 'Aktif projeler'}</h2></div><button className="secondary-button compact-button" type="button" onClick={() => setShowArchivedProjects((shown) => !shown)}>{showArchivedProjects ? 'Aktif projeleri göster' : 'Arşivlenen projeleri göster'}</button></div>
              <p className="demo-notice"><strong>Demo örneği:</strong> İlk kart ve örnek üyeler kurgusaldır. Yeni kayıtlar yalnız bu tarayıcıda saklanır.</p>
              {isLoadingProjects ? <p role="status" aria-live="polite">Projeler yükleniyor…</p> : projectLoadError ? <div className="load-error"><p role="alert">{projectLoadError}</p><button className="secondary-button" type="button" onClick={retryProjectLoad}>Projeleri yeniden dene</button></div> : <ul className="project-list" aria-label="Proje listesi">{visibleProjects.map((project) => <li key={project.id} className={`${project.id.startsWith('demo-') ? 'project-card is-demo' : 'project-card'} ${project.id === selectedProjectId ? 'is-selected' : ''}`}><div><h3>{project.name}</h3><p>{project.problem}</p></div><dl><div><dt>Amaç</dt><dd>{project.goal}</dd></div><div><dt>Kapsam</dt><dd>{project.scope}</dd></div><div><dt>Danışman</dt><dd>{project.advisor}</dd></div></dl><p className="project-task-summary" aria-live="polite" aria-atomic="true">{projectTaskSummaryLabel(projectTaskSummaries[project.id])}</p>{project.archivedAt ? <button className="secondary-button" type="button" aria-label={`${project.name} projesini geri getir`} onClick={() => handleProjectArchive(project, false)}>Geri getir</button> : <><button className="secondary-button" type="button" onClick={() => selectProject(project.id)} aria-pressed={project.id === selectedProjectId}>{project.id === selectedProjectId ? 'Çalışma alanı açık' : `${project.name} çalışma alanını aç`}</button>{!project.id.startsWith('demo-') && <div className="project-card-actions"><button className="secondary-button compact-button" type="button" aria-label={`${project.name} projesini düzenle`} onClick={() => startProjectEdit(project)}>Düzenle</button><button className="secondary-button compact-button" type="button" aria-label={`${project.name} projesini arşivle`} onClick={() => handleProjectArchive(project, true)}>Arşivle</button></div>}</>}{project.id.startsWith('demo-') && <span className="card-label">Demo örneği</span>}</li>)}</ul>}
            </section>
          </div>
          </>}

          {selectedProject && <section className="task-board" id="gorev-panosi" aria-labelledby="task-board-title">
            <div className="task-board-header"><div><button className="workspace-back" type="button" onClick={closeWorkspace}>← Projelere dön</button><p className="eyebrow">Seçili proje</p><h2 id="task-board-title" tabIndex={-1}>{selectedProject.name} çalışma alanı</h2><p>Ekip, görev, teslim ve rapor kayıtları bu projeye bağlı tutulur.</p></div><span className="selected-project-label">{members.length} üye · {tasks.length} görev</span></div>
            <div className="workspace-tabs" role="tablist" aria-label="Proje çalışma alanı bölümleri">
              <button id="workspace-tab-overview" type="button" role="tab" aria-selected={activeWorkspaceView === 'overview'} aria-controls="workspace-panel-overview" tabIndex={activeWorkspaceView === 'overview' ? 0 : -1} onKeyDown={(event) => handleWorkspaceTabKeyDown(event, 'overview')} onClick={() => openWorkspaceView('overview')}>Genel Bakış</button>
              <button id="workspace-tab-team" type="button" role="tab" aria-selected={activeWorkspaceView === 'team'} aria-controls="workspace-panel-team" tabIndex={activeWorkspaceView === 'team' ? 0 : -1} onKeyDown={(event) => handleWorkspaceTabKeyDown(event, 'team')} onClick={() => openWorkspaceView('team')}>Ekip</button>
              <button id="workspace-tab-tasks" type="button" role="tab" aria-selected={activeWorkspaceView === 'tasks'} aria-controls="workspace-panel-tasks" tabIndex={activeWorkspaceView === 'tasks' ? 0 : -1} onKeyDown={(event) => handleWorkspaceTabKeyDown(event, 'tasks')} onClick={() => openWorkspaceView('tasks')}>Görevler</button>
              <button id="workspace-tab-milestones" type="button" role="tab" aria-selected={activeWorkspaceView === 'milestones'} aria-controls="workspace-panel-milestones" tabIndex={activeWorkspaceView === 'milestones' ? 0 : -1} onKeyDown={(event) => handleWorkspaceTabKeyDown(event, 'milestones')} onClick={() => openWorkspaceView('milestones')}>Proje Aşamaları</button>
              <button id="workspace-tab-deliverables" type="button" role="tab" aria-selected={activeWorkspaceView === 'deliverables'} aria-controls="workspace-panel-deliverables" tabIndex={activeWorkspaceView === 'deliverables' ? 0 : -1} onKeyDown={(event) => handleWorkspaceTabKeyDown(event, 'deliverables')} onClick={() => openWorkspaceView('deliverables')}>Teslimler</button>
              <button id="workspace-tab-reports" type="button" role="tab" aria-selected={activeWorkspaceView === 'reports'} aria-controls="workspace-panel-reports" tabIndex={activeWorkspaceView === 'reports' ? 0 : -1} onKeyDown={(event) => handleWorkspaceTabKeyDown(event, 'reports')} onClick={() => openWorkspaceView('reports')}>Raporlar</button>
            </div>
            {activeWorkspaceView === 'overview' && <section id="workspace-panel-overview" role="tabpanel" aria-labelledby="workspace-tab-overview" className="overview-panel">
              <div className="overview-heading"><div><p className="eyebrow">Proje özeti</p><h3 id="overview-title">Genel Bakış</h3></div><span>{taskProgress}% ilerleme</span></div>
              <div className="summary-grid">
                <article><span>Ekip</span><strong>{members.length}</strong><small>proje üyesi</small></article>
                <article><span>Görevler</span><strong>{tasks.length}</strong><small>{completedTaskCount} / {tasks.length} görev tamamlandı</small></article>
                <article><span>Devam eden</span><strong>{inProgressTaskCount}</strong><small>aktif görev</small></article>
                <article><span>Proje aşamaları</span><strong>{milestones.length}</strong><small>{milestones.length} proje aşaması</small><button className="summary-link" type="button" onClick={() => openWorkspaceView('milestones', true)}>Proje aşamalarını aç</button></article><article><span>Teslimler</span><strong>{readyDeliverableCount} / {deliverables.length}</strong><small>{readyDeliverableCount} hazır teslim · {overdueDeliverableCount} geciken</small><button className="summary-link" type="button" onClick={() => openWorkspaceView('deliverables', true)}>Teslimleri aç</button></article><article><span>Raporlar</span><strong>{reports.length}</strong><small>haftalık kayıt</small><button className="summary-link" type="button" onClick={() => openWorkspaceView('reports', true)}>Raporları aç</button></article>
              </div>
              <div className="progress-card"><div><strong>Görev ilerlemesi</strong><span>{taskProgress}%</span></div><progress max="100" value={taskProgress}>{taskProgress}%</progress></div>
              <section className="attention-panel" aria-labelledby="attention-title">
                <div className="attention-heading"><div><p className="eyebrow">Eylem listesi</p><h4 id="attention-title">Dikkat gerektiren görevler</h4></div><div className="attention-actions"><button type="button" disabled={overdueTasks.length === 0} onClick={() => showTaskRisk('overdue')}>{overdueTasks.length} geciken görevi göster</button><button type="button" disabled={highPriorityTasks.length === 0} onClick={() => showTaskRisk('high')}>{highPriorityTasks.length} yüksek öncelikli görevi göster</button></div></div>
                {attentionTasks.length === 0 ? <p className="empty-attention">Geciken veya yüksek öncelikli açık görev yok.</p> : <><ul className="attention-list">{attentionTasks.slice(0, 5).map((task) => { const overdue = Boolean(task.dueDate && task.dueDate < todayIso); return <li key={task.id}><div><strong>{task.title}</strong><span>{task.assigneeName} · {statusLabel(task.status)}</span></div><div className="attention-meta"><span className={`priority-label priority-${task.priority ?? 'medium'}`}>{priorityLabel(task.priority)}</span>{task.dueDate && <span>{task.dueDate}</span>}{overdue && <span className="overdue-label">Gecikti</span>}</div></li> })}</ul>{attentionTasks.length > 5 && <p className="attention-more">{attentionTasks.length - 5} ek dikkat gerektiren görev daha var.</p>}</>}
              </section>
              <div className="overview-columns"><article><h4>Son rapor</h4>{latestReport ? <><p>{latestReport.weekStart} haftası · Sürüm {latestReport.version}</p><span className="overview-status">{reportStatusLabel(latestReport.status)}</span></> : <p>Henüz haftalık rapor oluşturulmadı.</p>}</article><article><h4>Yaklaşan proje aşaması</h4>{nextMilestone ? <><p>{nextMilestone.title}</p><span className="overview-status">{nextMilestone.dueDate}</span></> : <p>Planlanmış proje aşaması yok.</p>}</article><article><h4>Sıradaki görev</h4><p>{tasks.find((task) => task.status !== 'completed')?.title ?? 'Tüm görevler tamamlandı.'}</p></article><article><h4>Sıradaki teslim</h4>{nextDeliverable ? <><p>{nextDeliverable.title}</p><span className="overview-status">{nextDeliverable.dueDate ?? 'Tarih belirtilmedi'}</span></> : <p>Planlanmış teslim yok.</p>}</article></div>
            </section>}
            {activeWorkspaceView === 'team' && <section className="member-board" id="workspace-panel-team" role="tabpanel" aria-labelledby="workspace-tab-team">
              <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Proje ekibi</p><h3 id={memberFormTitleId}>Ekip üyesi ekle</h3></div><span>Yerel demo</span></div><form noValidate onSubmit={handleMemberSubmit}><Field label="Üye adı" value={memberForm.name} error={memberErrors.name} onChange={(value) => updateMemberField('name', value)} /><Field label="Üye e-postası" type="email" value={memberForm.email} error={memberErrors.email} onChange={(value) => updateMemberField('email', value)} /><Field label="Sorumluluk" value={memberForm.responsibility} error={memberErrors.responsibility} onChange={(value) => updateMemberField('responsibility', value)} /><div className="form-actions"><button type="submit" disabled={isSavingMember}>{isSavingMember ? 'Ekleniyor…' : 'Üyeyi ekle'}</button><p role="status" aria-live="polite">{memberStatusMessage}</p></div></form></section>
              <section className="panel" aria-labelledby="member-list-title"><div className="panel-heading"><div><p className="eyebrow">Dağılım</p><h3 id="member-list-title">Ekip üyeleri</h3></div><span>{members.length} kişi</span></div><p className="demo-notice"><strong>Demo sınırı:</strong> E-posta gönderilmez ve gerçek hesap oluşturulmaz.</p><ul className="member-list">{isLoadingMembers ? <li className="empty-state">Ekip üyeleri yükleniyor…</li> : memberLoadError ? <li className="load-error"><button className="secondary-button" type="button" onClick={retryMemberLoad}>Ekip üyelerini yeniden dene</button></li> : members.length === 0 ? <li className="empty-state">Bu proje için henüz ekip üyesi yok.</li> : members.map((member) => <li className="member-card" key={member.id}><div><h4>{member.name}</h4><p>{member.responsibility}</p></div><span>{member.email}</span></li>)}</ul></section>
            </section>}
            {activeWorkspaceView === 'tasks' && <section id="workspace-panel-tasks" role="tabpanel" aria-labelledby="workspace-tab-tasks" className="compact-workspace-section"><div className="section-toolbar"><div><p className="eyebrow">Görev yönetimi</p><h3>Görev listesi</h3></div><div className="toolbar-actions"><button type="button" onClick={() => { setEditingTaskId(null); setTaskForm(emptyTaskForm); setTaskErrors({}); setIsTaskFormOpen((open) => !open) }}>{isTaskFormOpen ? 'Görev formunu kapat' : 'Yeni görev ekle'}</button><p role="status" aria-live="polite">{taskStatusMessage}</p></div></div><div className={`task-grid ${!isTaskFormOpen ? 'single-panel' : ''}`}>
              {isTaskFormOpen && <section className="panel compact-form-panel" aria-labelledby={taskFormTitleId}>
                <div className="panel-heading"><div><p className="eyebrow">{editingTaskId ? 'Görev düzenleme' : 'Yeni görev'}</p><h3 id={taskFormTitleId}>{editingTaskId ? 'Görevi düzenle' : 'Görev ekle'}</h3></div><span>{'Yerel ekip kaydı'}</span></div>
                <form noValidate onSubmit={handleTaskSubmit}>
                  <Field label="Görev başlığı" value={taskForm.title} error={taskErrors.title} onChange={(value) => updateTaskField('title', value)} />
                  <Field label="Görev açıklaması" as="textarea" hint="En az 10 karakter." value={taskForm.description} error={taskErrors.description} onChange={(value) => updateTaskField('description', value)} />
                  <SelectField label="Ekip sorumlusu" value={taskForm.assigneeName} error={taskErrors.assigneeName} onChange={(value) => updateTaskField('assigneeName', value)}><option value="">Ekip üyesini seçin</option>{members.map((member) => <option value={member.name} key={member.id}>{member.name}</option>)}</SelectField>
                  <Field label="Hedef tarih (isteğe bağlı)" type="date" value={taskForm.dueDate ?? ''} onChange={(value) => updateTaskField('dueDate', value)} /><SelectField label="Öncelik" value={taskForm.priority ?? 'medium'} onChange={(value) => updateTaskField('priority', value)}><option value="low">Düşük</option><option value="medium">Orta</option><option value="high">Yüksek</option></SelectField>
                  <div className="form-actions"><button type="submit" disabled={isSavingTask}>{isSavingTask ? 'Kaydediliyor…' : editingTaskId ? 'Değişiklikleri kaydet' : 'Görevi kaydet'}</button>{editingTaskId && <button className="secondary-button" type="button" disabled={isSavingTask} onClick={cancelTaskEdit}>İptal</button>}</div>
                </form>
              </section>}
              <section className="panel" aria-labelledby="task-list-title"><div className="panel-heading"><div><p className="eyebrow">Akış</p><h3 id="task-list-title">Görevler</h3></div><span>{filteredTasks.length} / {tasks.length} gösteriliyor</span></div><p className="demo-notice"><strong>Demo sınırı:</strong> Sorumlu seçenekleri bu projenin yerel ekip kayıtlarıdır; gerçek hesap, davet veya atama yetkisi göstermez.</p><div className="task-filters"><Field label="Görevlerde ara" value={taskSearch} onChange={setTaskSearch} /><SelectField label="Duruma göre filtrele" value={taskStatusFilter} onChange={(value) => setTaskStatusFilter(value as TaskStatus | 'all')}><option value="all">Tüm durumlar</option><option value="todo">Yapılacak</option><option value="in_progress">Devam ediyor</option><option value="completed">Tamamlandı</option></SelectField><button className="secondary-button filter-toggle" type="button" aria-expanded={showAdvancedTaskFilters} onClick={() => setShowAdvancedTaskFilters((shown) => !shown)}>Diğer filtreler</button>{showAdvancedTaskFilters && <SelectField label="Sorumluya göre filtrele" value={taskAssigneeFilter} onChange={setTaskAssigneeFilter}><option value="all">Tüm sorumlular</option>{members.map((member) => <option value={member.name} key={member.id}>{member.name}</option>)}</SelectField>}<SelectField label="Teslim durumuna göre filtrele" value={taskDueFilter} onChange={(value) => setTaskDueFilter(value as 'all' | 'overdue')}><option value="all">Tüm teslim durumları</option><option value="overdue">Geciken açık görevler</option></SelectField>{showAdvancedTaskFilters && <SelectField label="Önceliğe göre filtrele" value={taskPriorityFilter} onChange={(value) => setTaskPriorityFilter(value as TaskPriority | 'all')}><option value="all">Tüm öncelikler</option><option value="high">Yüksek</option><option value="medium">Orta</option><option value="low">Düşük</option></SelectField>}</div><ul className="task-list">{isLoadingTasks ? <li className="empty-state">Görevler yükleniyor…</li> : taskLoadError ? <li className="load-error"><button className="secondary-button" type="button" onClick={retryTaskLoad}>Görevleri yeniden dene</button></li> : tasks.length === 0 ? <li className="empty-state">Bu proje için henüz görev yok.</li> : filteredTasks.length === 0 ? <li className="empty-state">Filtrelere uyan görev bulunamadı.</li> : filteredTasks.map((task) => <li className="task-card" key={task.id}><div className="task-card-heading"><div><h4>{task.title}</h4><p>{task.description}</p></div><div className="task-card-actions"><span className={`priority-label priority-${task.priority ?? 'medium'}`}>{priorityLabel(task.priority)}</span>{task.dueDate && task.dueDate < todayIso && task.status !== 'completed' && <span className="overdue-label">Gecikti</span>}{task.id.startsWith('demo-') ? <span className="card-label">Demo görevi</span> : <button className="secondary-button compact-button" type="button" onClick={() => startTaskEdit(task)} aria-label={`${task.title} görevini düzenle`}>Düzenle</button>}</div></div><dl><div><dt>Sorumlu</dt><dd>{task.assigneeName}</dd></div><div><dt>Hedef tarih</dt><dd>{task.dueDate || 'Hedef tarih belirtilmedi'}</dd></div></dl><div className="task-status-control"><span className={`status-dot status-${task.status}`} aria-hidden="true" /><label htmlFor={`task-status-${task.id}`}>Durum: <strong>{statusLabel(task.status)}</strong></label><select id={`task-status-${task.id}`} aria-label={`${task.title} durumu`} value={task.status} disabled={updatingTaskIds.has(task.id)} onChange={(event) => handleTaskStatusChange(task, event.target.value as TaskStatus)}><option value="todo">Yapılacak</option><option value="in_progress">Devam ediyor</option><option value="completed">Tamamlandı</option></select></div></li>)}</ul></section>
            </div></section>}
            {activeWorkspaceView === 'milestones' && <section id="workspace-panel-milestones" role="tabpanel" aria-labelledby="workspace-tab-milestones" className="compact-workspace-section"><div className="section-toolbar"><div><p className="eyebrow">Dönem planı</p><h3>Proje aşamaları</h3></div><div className="toolbar-actions"><button type="button" onClick={() => setIsMilestoneFormOpen((open) => !open)}>{isMilestoneFormOpen ? 'Aşama formunu kapat' : 'Yeni proje aşaması ekle'}</button><p role="status" aria-live="polite">{milestoneStatusMessage}</p></div></div><div className={`milestone-board ${!isMilestoneFormOpen ? 'single-panel' : ''}`}>
              {isMilestoneFormOpen && <section className="panel compact-form-panel"><div className="panel-heading"><div><p className="eyebrow">Yeni aşama</p><h3 id={milestoneFormTitleId}>Proje aşaması ekle</h3></div><span>Teslim takvimi</span></div><form noValidate onSubmit={handleMilestoneSubmit}><Field label="Proje aşaması başlığı" value={milestoneForm.title} error={milestoneErrors.title} onChange={(value) => updateMilestoneField('title', value)} /><Field label="Açıklama" as="textarea" value={milestoneForm.description} error={milestoneErrors.description} onChange={(value) => updateMilestoneField('description', value)} /><Field label="Teslim tarihi" type="date" value={milestoneForm.dueDate} error={milestoneErrors.dueDate} onChange={(value) => updateMilestoneField('dueDate', value)} /><div className="form-actions"><button type="submit" disabled={isSavingMilestone}>{isSavingMilestone ? 'Kaydediliyor…' : 'Proje aşamasını kaydet'}</button></div></form></section>}
              <section className="panel" aria-labelledby="milestone-list-title"><div className="panel-heading"><div><p className="eyebrow">Takvim</p><h3 id="milestone-list-title">Proje aşamaları</h3></div><span>{milestones.length} kayıt</span></div><ul className="milestone-list">{isLoadingMilestones ? <li className="empty-state">Proje aşamaları yükleniyor…</li> : milestoneLoadError ? <li className="load-error"><button className="secondary-button" type="button" onClick={retryMilestoneLoad}>Proje aşamalarını yeniden dene</button></li> : milestones.length === 0 ? <li className="empty-state">Bu proje için henüz proje aşaması yok.</li> : milestones.map((milestone) => <li className="milestone-card" key={milestone.id}><div className="milestone-card-heading"><div><h4>{milestone.title}</h4><p>{milestone.description}</p></div><span className={`milestone-status status-${milestone.status}`}>{milestoneStatusLabel(milestone.status)}</span></div><div className="milestone-meta"><span>Teslim: <strong>{milestone.dueDate}</strong></span>{milestone.status !== 'completed' && milestone.dueDate < todayIso && <span className="overdue-label">Gecikti</span>}{milestone.status === 'completed' && milestone.completedAt && milestone.completedAt.slice(0, 10) > milestone.dueDate && <span className="late-completed-label">Geç tamamlandı</span>}</div><label htmlFor={`milestone-status-${milestone.id}`}>Durum</label><select id={`milestone-status-${milestone.id}`} aria-label={`${milestone.title} durumu`} value={milestone.status} disabled={updatingMilestoneIds.has(milestone.id)} onChange={(event) => handleMilestoneStatusChange(milestone, event.target.value as MilestoneStatus)}><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="completed">Tamamlandı</option></select></li>)}</ul></section>
            </div></section>}
            {activeWorkspaceView === 'deliverables' && <section id="workspace-panel-deliverables" role="tabpanel" aria-labelledby="workspace-tab-deliverables" className="compact-workspace-section"><div className="section-toolbar"><div><p className="eyebrow">Dönem teslim merkezi</p><h3>Teslimler</h3></div><div className="toolbar-actions"><button type="button" onClick={() => { if (isDeliverableFormOpen) { setIsDeliverableFormOpen(false); return } setEditingDeliverableId(null); setDeliverableForm(emptyDeliverableForm); setSelectedDeliverableTemplate(''); setDeliverableErrors({}); setIsDeliverableFormOpen(true) }}>{isDeliverableFormOpen ? 'Teslim formunu kapat' : 'Yeni teslim ekle'}</button><p role="status" aria-live="polite">{deliverableStatusMessage}</p></div></div><div className={`deliverable-board ${!isDeliverableFormOpen ? 'single-panel' : ''}`}>
              {isDeliverableFormOpen && <section className="panel compact-form-panel"><div className="panel-heading"><div><p className="eyebrow">{editingDeliverableId ? 'Teslim düzenleme' : 'Yeni teslim'}</p><h3>{editingDeliverableId ? 'Teslimi düzenle' : 'Teslim ekle'}</h3></div><span>Yerel kayıt</span></div><form noValidate onSubmit={handleDeliverableSubmit}>{!editingDeliverableId && <SelectField label="Teslim şablonu (isteğe bağlı)" value={selectedDeliverableTemplate} onChange={(value) => applyDeliverableTemplate(value as DeliverableTemplateId | '')}><option value="">Şablon seçilmedi</option>{deliverableTemplates.map((template) => <option value={template.id} key={template.id}>{template.label}</option>)}</SelectField>}<Field label="Teslim başlığı" value={deliverableForm.title} error={deliverableErrors.title} onChange={(value) => updateDeliverableField('title', value)} /><Field label="Teslim açıklaması" as="textarea" value={deliverableForm.description} error={deliverableErrors.description} onChange={(value) => updateDeliverableField('description', value)} /><SelectField label="Sorumlu ekip üyesi" value={deliverableForm.assigneeName ?? ''} onChange={(value) => updateDeliverableField('assigneeName', value)}><option value="">Sorumlu seçilmedi</option>{members.map((member) => <option value={member.name} key={member.id}>{member.name}</option>)}</SelectField><Field label="Teslim tarihi" type="date" value={deliverableForm.dueDate ?? ''} error={deliverableErrors.dueDate} onChange={(value) => updateDeliverableField('dueDate', value)} /><SelectField label="Teslim durumu" value={deliverableForm.status} onChange={(value) => updateDeliverableField('status', value)}><option value="planned">Planlandı</option><option value="preparing">Hazırlanıyor</option><option value="ready">Hazır</option><option value="submitted">Gönderildi</option></SelectField><Field label="Kanıt URLsi" hint={deliverableForm.status === 'ready' || deliverableForm.status === 'submitted' ? 'Hazır ve gönderildi teslimler için http(s) kanıt URLsi zorunludur.' : 'Hazır veya gönderildi durumunda http(s) URL zorunludur.'} value={deliverableForm.evidenceUrl ?? ''} error={deliverableErrors.evidenceUrl} onChange={(value) => updateDeliverableField('evidenceUrl', value)} /><div className="form-actions"><button type="submit" disabled={isSavingDeliverable}>{isSavingDeliverable ? 'Kaydediliyor…' : editingDeliverableId ? 'Değişiklikleri kaydet' : 'Teslimi kaydet'}</button></div></form></section>}
              <section className="panel" aria-labelledby="deliverable-list-title"><div className="panel-heading"><div><p className="eyebrow">Dönem akışı</p><h3 id="deliverable-list-title">Teslim listesi</h3></div><span>{deliverables.length} kayıt</span></div><ul className="deliverable-list">{isLoadingDeliverables ? <li className="empty-state">Teslimler yükleniyor…</li> : deliverableLoadError ? <li className="load-error"><p role="alert">{deliverableStatusMessage}</p><button className="secondary-button" type="button" onClick={retryDeliverableLoad}>Teslimleri yeniden dene</button></li> : deliverables.length === 0 ? <li className="empty-state">Bu proje için henüz teslim yok.</li> : deliverables.map((item) => <li className="deliverable-card" key={item.id}><div className="task-card-heading"><div><h4>{item.title}</h4><p>{item.description}</p></div><span className="card-label">{deliverableStatusLabel(item.status)}</span></div><div className="milestone-meta"><span>Teslim: <strong>{item.dueDate ?? 'Belirtilmedi'}</strong></span><span>Sorumlu: <strong>{item.assigneeName || 'Atanmadı'}</strong></span>{item.status !== 'submitted' && item.dueDate && item.dueDate < todayIso && <span className="overdue-label">Gecikti</span>}</div>{item.evidenceUrl && <p><a href={item.evidenceUrl} target="_blank" rel="noreferrer">Kanıt URLsi</a></p>}<div className="task-card-actions"><button className="secondary-button compact-button" type="button" aria-label={`${item.title} teslimini düzenle`} onClick={() => { setEditingDeliverableId(item.id); setSelectedDeliverableTemplate(''); setDeliverableForm({ title: item.title, description: item.description, dueDate: item.dueDate ?? '', status: item.status, evidenceUrl: item.evidenceUrl ?? '', assigneeName: item.assigneeName ?? '' }); setDeliverableErrors({}); setIsDeliverableFormOpen(true) }}>Düzenle</button><select aria-label={`${item.title} durumu`} value={item.status} disabled={updatingDeliverableIds.has(item.id)} onChange={(event) => handleDeliverableStatusChange(item, event.target.value as DeliverableStatus)}><option value="planned">Planlandı</option><option value="preparing">Hazırlanıyor</option><option value="ready">Hazır</option><option value="submitted">Gönderildi</option></select></div></li>)}</ul></section>
            </div></section>}
            {activeWorkspaceView === 'reports' && <section id="workspace-panel-reports" role="tabpanel" aria-labelledby="workspace-tab-reports" className="compact-workspace-section"><div className="section-toolbar"><div><p className="eyebrow">Haftalık ilerleme</p><h3>Haftalık raporlar</h3></div><div className="toolbar-actions"><button type="button" onClick={() => { setRevisionSourceId(undefined); setReportForm(emptyReportForm); setReportErrors({}); setIsReportFormOpen((open) => !open) }}>{isReportFormOpen ? 'Rapor formunu kapat' : 'Yeni rapor oluştur'}</button><p role="status" aria-live="polite">{reportStatusMessage}</p></div></div><div className={`report-board ${!isReportFormOpen ? 'single-panel' : ''}`}>
              {isReportFormOpen && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Haftalık ilerleme</p><h3 id={reportFormTitleId}>Rapor taslağı oluştur</h3></div><span>Yerel kayıt</span></div><p className="demo-notice"><strong>Görünür demo uyarısı:</strong> Danışman görünümü rol, oturum veya gerçek onay değildir.</p><form noValidate onSubmit={handleReportSubmit}><Field label="Hafta başlangıcı" type="date" value={reportForm.weekStart} error={reportErrors.weekStart} onChange={(value) => updateReportField('weekStart', value)} /><Field label="Bu hafta tamamlananlar" as="textarea" value={reportForm.completedThisWeek} error={reportErrors.completedThisWeek} onChange={(value) => updateReportField('completedThisWeek', value)} /><div className="field"><label htmlFor="blockers">Engeller</label><textarea id="blockers" value={reportForm.blockers} aria-invalid={Boolean(reportErrors.blockers)} onChange={(event) => updateReportField('blockers', event.target.value)} /><label className="checkbox-label"><input type="checkbox" checked={reportForm.blockers === 'Engel yok.'} onChange={(event) => updateReportField('blockers', event.target.checked ? 'Engel yok.' : '')} /> Engel yok</label>{reportErrors.blockers && <p className="field-error" role="alert">{reportErrors.blockers}</p>}</div><Field label="Gelecek hafta planı" as="textarea" value={reportForm.nextWeekPlan} error={reportErrors.nextWeekPlan} onChange={(value) => updateReportField('nextWeekPlan', value)} /><Field label="Kanıt bağlantısı" hint="İsteğe bağlı; yalnız http/https." value={reportForm.evidenceUrl ?? ''} error={reportErrors.evidenceUrl} onChange={(value) => updateReportField('evidenceUrl', value)} /><div className="form-actions"><button type="submit" disabled={isSavingReport}>{isSavingReport ? 'Kaydediliyor…' : revisionSourceId ? 'Yeni rapor sürümünü kaydet' : 'Rapor taslağını kaydet'}</button><p role="status" aria-live="polite">{reportStatusMessage}</p></div></form></section>}
              <section className="panel" aria-labelledby="reports-title"><div className="panel-heading"><div><p className="eyebrow">Danışman demo görünümü</p><h3 id="reports-title">Haftalık raporlar</h3></div><span>{filteredReports.length} / {reports.length} gösteriliyor</span></div><p className="demo-notice"><strong>Demo sınırı:</strong> Bu kararlar gerçek danışman yetkisi veya bildirim oluşturmaz.</p><div className="report-filters"><SelectField label="Rapor durumuna göre filtrele" value={reportStatusFilter} onChange={(value) => setReportStatusFilter(value as ReportStatus | 'all')}><option value="all">Tüm durumlar</option><option value="draft">Taslak</option><option value="submitted">Gönderildi</option><option value="reviewed">İncelendi</option><option value="changes_requested">Düzeltme istendi</option></SelectField></div><ul className="task-list">{isLoadingReports ? <li className="empty-state">Raporlar yükleniyor…</li> : reportLoadError ? <li className="load-error"><button className="secondary-button" type="button" onClick={retryReportLoad}>Raporları yeniden dene</button></li> : filteredReports.length === 0 ? <li className="empty-state">Bu filtreye uygun rapor yok.</li> : filteredReports.map((report) => { const chainKey = reportChainKey(report, reports); return <li className="task-card" key={report.id}><div className="task-card-heading"><div><h4>{report.weekStart} haftası · Sürüm {report.version}</h4><p>{report.completedThisWeek}</p>{report.version === reportLatestVersions[chainKey] && <small className="version-chain-label">Sürüm zinciri: {reportVersionCounts[chainKey]} sürüm</small>}</div><span className="card-label">{reportStatusLabel(report.status)}</span></div><p><strong>Engeller:</strong> {report.blockers}</p><p><strong>Gelecek hafta:</strong> {report.nextWeekPlan}</p>{report.feedback && <section className="feedback" aria-label="Danışman geri bildirimi"><strong>Karar: {reportStatusLabel(report.feedback.decision)}</strong><p>{report.feedback.message}</p><small>Geri bildirim zamanı: <time dateTime={report.feedback.createdAt}>{new Date(report.feedback.createdAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</time></small></section>}{report.status === 'changes_requested' && <button type="button" disabled={isSavingReport || updatingReportIds.has(report.id)} onClick={() => startReportRevision(report)}>Yeni sürüm oluştur</button>}{report.status === 'draft' && <button type="button" disabled={updatingReportIds.has(report.id)} onClick={() => handleReportAction(report, 'submit')}>Raporu gönder</button>}{report.status === 'submitted' && <div className="review-controls"><label htmlFor={`feedback-${report.id}`}>Danışman geri bildirimi</label><textarea id={`feedback-${report.id}`} value={feedbackText[report.id] ?? ''} disabled={updatingReportIds.has(report.id)} onChange={(event) => setFeedbackText((current) => ({ ...current, [report.id]: event.target.value }))} /><div className="form-actions"><button type="button" disabled={updatingReportIds.has(report.id)} onClick={() => handleReportAction(report, 'reviewed')}>İncelendi</button><button type="button" disabled={updatingReportIds.has(report.id)} onClick={() => handleReportAction(report, 'changes_requested')}>Düzeltme istendi</button></div></div>}</li>})}</ul></section>
            </div></section>}
          </section>}

          <section className="data-security panel" id="veri-guvenligi" aria-labelledby="data-security-title">
            <div className="panel-heading"><div><p className="eyebrow">Ayarlar</p><h2 id="data-security-title">Veri güvenliği</h2></div><span>Yerel yedek</span></div>
            <p>Bu cihazdaki yerel proje verilerinizi JSON dosyası olarak indirebilir veya daha önce indirdiğiniz bir yedeği seçebilirsiniz.</p>
            <div className="backup-actions"><button type="button" disabled={isExportingBackup || isRestoringBackup} onClick={handleBackupDownload}>{isExportingBackup ? 'Yedek indiriliyor…' : 'Yedek indir'}</button></div>
            <div className="backup-restore">
              <div className="field"><label htmlFor="backup-json-file">Yedek JSON dosyası</label><input ref={backupFileInputRef} id="backup-json-file" type="file" accept="application/json,.json" aria-describedby="backup-restore-warning backup-file-status" disabled={isExportingBackup || isRestoringBackup} onChange={handleBackupFileChange} /></div>
              <p id="backup-file-status" role="status" aria-live="polite">{backupFile ? `${backupFile.name} seçildi. Geri yükleme henüz uygulanmadı.` : 'Henüz yedek dosyası seçilmedi.'}</p>
              <p className="backup-warning" id="backup-restore-warning"><strong>Uyarı:</strong> Yedeği geri yüklemek, mevcut yerel proje, görev, ekip, aşama, teslim ve rapor verilerinin tamamını bu yedekteki snapshot ile değiştirir.</p>
              <button type="button" disabled={!backupFile || isExportingBackup || isRestoringBackup} onClick={handleBackupRestore}>{isRestoringBackup ? 'Yedek geri yükleniyor…' : 'Yedeği geri yükle'}</button>
              {backupError && <p className="backup-error" role="alert">{backupError}</p>}
              {backupStatus && <p role="status" aria-live="polite">{backupStatus}</p>}
            </div>
          </section>

          <section className="limits" id="sinirlar" aria-labelledby="limits-title"><h2 id="limits-title">Bu sürümün sınırları</h2><ul><li>Gerçek hesap, giriş, ekip üyeliği ve yetkilendirme yoktur.</li><li>Supabase veya başka bir uzak veritabanı bağlı değildir.</li><li>Proje, ekip, görev, proje aşaması, teslim ve rapor verileri ayrı repository arayüzleriyle ayrılmıştır; sonraki aşamada localStorage uyarlayıcıları değiştirilebilir.</li></ul></section>
        </div>
      </main>
    </div>
  )
}

interface FieldProps { label: string; value: string; error?: string; hint?: string; as?: 'input' | 'textarea'; type?: string; onChange: (value: string) => void }
function Field({ label, value, error, hint, as = 'input', type = 'text', onChange }: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  const common = { id, value, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), 'aria-invalid': Boolean(error), 'aria-describedby': describedBy }
  return <div className="field"><label htmlFor={id}>{label}</label>{as === 'textarea' ? <textarea {...common} /> : <input {...common} type={type} />}{hint && <small id={hintId}>{hint}</small>}{error && <p className="field-error" id={errorId} role="alert">{error}</p>}</div>
}

interface SelectFieldProps { label: string; value: string; error?: string; onChange: (value: string) => void; children: React.ReactNode }
function SelectField({ label, value, error, onChange, children }: SelectFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)}>{children}</select>{error && <p className="field-error" id={errorId} role="alert">{error}</p>}</div>
}

export default App
