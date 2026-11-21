import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { switchTheme, withViewTransition } from './motion'
import { createRoot } from 'react-dom/client'
import {
  Activity, Briefcase, CalendarDays, Check, ChevronDown, ChevronRight, Cpu, Download, FlaskConical, CircleHelp, Globe2, Sparkles, History, Info,
  LayoutDashboard, Menu, Moon, Plus, Search, Settings2, Sun, BarChart3, Upload, User, UserRound, Users, X, Zap,
} from 'lucide-react'
import '@fontsource-variable/inter'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './styles.css'
import './ai.css'
import './mobile.css'
import './dash.css'
import './panel.css'
import './motion.css'
import './stats.css'
import './livecharts.css'
import { Approval, Compare, type AiMode, type AnalysisState } from './Compare'
import { About } from './About'
import { HiddenWorkCheck } from './AiTools'
import { Copilot, Tour } from './Copilot'
import { Dashboard } from './Dashboard'
import { EmployeeProfile, Employees } from './People'
import { IntakeBanner, RequestPane, sampleLoaded, TaskForm } from './Request'
import { AssignmentDetails, Calendar, CommitmentForm, EmployeeView, VerificationForm } from './Schedule'
import { Settings } from './Settings'
import { BrandMark, CommandPalette, Wordmark, NotificationsBell, Toasts, type Notification, type PaletteItem } from './Shell'
import { Automation, downloadCalendar, findingLabel, Import, severity, WorkLog } from './TeamTools'
import { accessId, displayTime, emptyTask, skillLabel, type Assignment, type Block, type Employee, type Language, type Task, type Workspace } from './domain'
import { extractViaApi, fetchHealth, type Health } from './api'
import type { ExtractResponse } from './extract'
import { importToWorkspace, scanTeam } from './operations'
import { checkApproval, flagCalendarChanges, planTask, type PlanResult } from './scheduler'
import { dashboardTask, demoPreviousOwner, demoRecommended, exampleRequest, roster, teamName, teams } from './seed'
import { getPref, readWorkspace, setPref, transact, WORKSPACE_KEY } from './storage'
import { onSyncStatus, resetRemote, startSync, type SyncStatus } from './sync'
import { Dialog, Label, nameOf, PageHeading, Select, ThemeContext, useTheme, type Translate } from './ui'

const Insights = lazy(() => import('./Insights').then(({ Insights }) => ({ default: Insights })))

const VIEWS = ['dashboard', 'employees', 'automation', 'workspace', 'calendar', 'worklog', 'workload', 'employee', 'import', 'about'] as const
type View = typeof VIEWS[number]
type Step = 'request' | 'compare' | 'approve'
type Modal = { kind: 'settings' } | { kind: 'assignment'; id: string } | { kind: 'commitment'; person?: string; block?: Block } | { kind: 'verify'; id: string } | { kind: 'person'; id: string }
const viewFromHash = (): View => { const id = location.hash.replace(/^#\/?/, ''); return (VIEWS as readonly string[]).includes(id) ? id as View : 'about' }
const aiModeFromPref = (): AiMode => { const value = getPref('ai-mode', 'off'); return value === 'delay' || value === 'fail' ? value : 'off' }

function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [lang, setLanguage] = useState<Language>(() => getPref('language', 'ko') === 'en' ? 'en' : 'ko')
  const t: Translate = (en, ko) => lang === 'ko' ? ko : en
  const [team, setTeam] = useState(teams[0])
  const [view, setView] = useState<View>(viewFromHash)
  const [step, setStep] = useState<Step>('request')
  const [raw, setRaw] = useState(() => exampleRequest(lang))
  const [workspace, setWorkspace] = useState(readWorkspace)
  const [task, setTask] = useState<Task>()
  const [draftSource, setDraftSource] = useState<'manual' | 'seed' | 'ai' | 'review'>('manual')
  const [preset, setPreset] = useState(0)
  const [warning, setWarning] = useState('')
  const [snapshot, setSnapshot] = useState<{ plan: PlanResult; version: number; approvalId: string; reviewedHistory?: number }>()
  const [selected, setSelected] = useState('')
  const [replacement, setReplacement] = useState(false)
  const [completedId, setCompletedId] = useState('')
  const [stale, setStale] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState<Modal>()
  const [menu, setMenu] = useState(false)
  const [palette, setPalette] = useState(false)
  const [personId, setPersonId] = useState(demoRecommended)
  const [health, setHealth] = useState<Health | null>(null)
  const online = !!health
  const [llmFail, setLlmFail] = useState(() => getPref('llm-fail', 'off') === 'on')
  const [intakeMeta, setIntakeMeta] = useState<ExtractResponse>()
  const [retrying, setRetrying] = useState(false)
  const [aiMode, setAiMode] = useState<AiMode>(aiModeFromPref)
  const [analysis, setAnalysis] = useState<AnalysisState>({ run: 0, done: 0, attempt: 0, failed: false })
  const [employeeView, setEmployeeView] = useState(false)
  const [corrected, setCorrected] = useState<string[]>([])
  const [copilot, setCopilot] = useState(false)
  const [sync, setSync] = useState<SyncStatus>({ mode: 'local', rev: null, at: null })
  const [tour, setTour] = useState(() => getPref('tour', '') !== 'done')
  const request = useRef<AbortController | null>(null)
  const people = roster.filter((person) => person.team === team)
  const chosen = snapshot?.plan.ranked.find((record) => record.employee.id === selected)
  const confirmed = workspace.assignments.find((record) => record.task.id === completedId)
  const modalAssignment = modal?.kind === 'assignment' ? workspace.assignments.find((record) => record.task.id === modal.id) : undefined
  const modalPerson = modal?.kind === 'verify' ? roster.find((person) => person.id === modal.id) : undefined
  const profilePerson = modal?.kind === 'person' ? roster.find((person) => person.id === modal.id) : undefined
  const teamAssignments = workspace.assignments.filter((record) => record.task.team === team)
  const pendingCount = teamAssignments.filter((record) => record.pending).length
  const demoTeam = team === teams[0]

  // The primary flow sits on top; everything else is secondary and the rarely used tools fold away.
  const routes: { id: View; tier: 'core' | 'more' | 'help'; icon: typeof LayoutDashboard; label: string; hint: string; badge?: number }[] = [
    { id: 'dashboard', tier: 'core', icon: LayoutDashboard, label: t('Dashboard', '대시보드'), hint: t('Team pulse', '팀 현황') },
    { id: 'workspace', tier: 'core', icon: Briefcase, label: t('Assign work', '업무 배정'), hint: t('Urgent task → Compare → Approve', '긴급 업무 → 비교 → 승인') },
    { id: 'calendar', tier: 'core', icon: CalendarDays, label: t('Schedule', '일정'), hint: t('Shared work blocks', '공유 작업 블록') },
    { id: 'employees', tier: 'core', icon: Users, label: t('People', '팀원'), hint: t('Directory, skills, workload', '팀원, 스킬, 업무량') },
    { id: 'about', tier: 'help', icon: Info, label: t('How Flow works', 'Flow 작동 방식'), hint: t('Theme, data sources, privacy', '주제, 데이터 출처, 개인정보') },
    { id: 'worklog', tier: 'more', icon: History, label: t('Work log', '배정 내역'), hint: t('Assignment history', '확정 및 검토 내역'), badge: pendingCount },
    { id: 'automation', tier: 'more', icon: Zap, label: t('Schedule check', '일정 점검'), hint: t('Find schedule risks', '일정 위험 점검') },
    { id: 'workload', tier: 'more', icon: BarChart3, label: t('Reports', '리포트'), hint: t('Workload and comparison', '업무량 및 비교') },
    { id: 'employee', tier: 'more', icon: UserRound, label: t('Employee view', '팀원 화면'), hint: t('What a team member sees', '팀원이 보는 화면') },
    { id: 'import', tier: 'more', icon: Upload, label: t('Upload CSV', 'CSV 업로드'), hint: t('Import commitments or skills', '일정 또는 스킬 가져오기') },
  ]
  const route = routes.find(({ id }) => id === view)!
  const [moreOpen, setMoreOpen] = useState(() => route.tier === 'more')
  const steps = [
    { id: 'request', title: t('Urgent task', '긴급 업무') },
    { id: 'compare', title: t('Compare', '비교') },
    { id: 'approve', title: t('Approve', '승인') },
  ] as const
  const currentStep = steps.findIndex((item) => item.id === step)

  async function checkHealth() {
    try { setHealth(await fetchHealth()) } catch { setHealth(null) }
  }
  useEffect(() => {
    void checkHealth()
    // Shared persistence: pulls the Supabase copy (or seeds it from this browser) and keeps it in sync.
    const stopSync = onSyncStatus(setSync)
    void startSync((state) => setWorkspace(state))
    const storage = (event: StorageEvent) => { if (event.key === WORKSPACE_KEY) setWorkspace(readWorkspace()) }
    const hash = () => withViewTransition(() => setView(viewFromHash()))
    const keys = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette((open) => !open) } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); setCopilot((open) => !open) } }
    window.addEventListener('storage', storage)
    window.addEventListener('hashchange', hash)
    window.addEventListener('keydown', keys)
    return () => { stopSync(); window.removeEventListener('storage', storage); window.removeEventListener('hashchange', hash); window.removeEventListener('keydown', keys) }
  }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  useEffect(() => { document.title = route.label + ' · Flow' }, [route.label])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const go = (page: View) => {
    withViewTransition(() => { setView(page); setMenu(false) })
    if (location.hash !== '#/' + page) history.pushState(null, '', '#/' + page)
    window.scrollTo(0, 0)
  }
  function cancelExtraction() { request.current?.abort(); request.current = null; setBusy(false) }
  function reset(nextTeam = team, sample = false) {
    cancelExtraction()
    setTask(undefined); setWarning(''); setSelected(''); setSnapshot(undefined); setCompletedId(''); setReplacement(false); setStale(null); setCorrected([]); setPreset(0)
    setStep('request'); setRaw(sample && nextTeam === teams[0] ? exampleRequest(lang) : '')
    go('workspace')
  }
  function language() {
    const next = lang === 'en' ? 'ko' : 'en'
    if (sampleLoaded(raw) && !busy) setRaw(exampleRequest(next))
    setPref('language', next)
    setLanguage(next)
  }
  function openDraft(draft: Task, source: typeof draftSource, message = '') {
    setTask({ ...draft, id: draft.id || crypto.randomUUID() }); setDraftSource(source); setWarning(message); setStep('request')
    setSnapshot(undefined); setSelected(''); setCompletedId(''); setStale(null); setCorrected([])
  }
  function manual(message = '') {
    cancelExtraction()
    const sample = sampleLoaded(raw) && demoTeam
    openDraft(sample ? { ...dashboardTask(raw === exampleRequest('ko') ? 'ko' : 'en'), raw } : emptyTask(team, raw), sample ? 'seed' : 'manual', message)
  }
  // One click: the signature 4h urgent scenario, pre-reviewed so the lead can go straight to Compare.
  function openDemo() {
    cancelExtraction(); setReplacement(false); setRaw(exampleRequest(lang))
    openDraft({ ...dashboardTask(lang), confirmed: true }, 'seed')
    setPreset((n) => n + 1)
    go('workspace')
  }
  // The one live backend call: POST /api/intake/extract. It always resolves with a draft (live LLM or deterministic fallback).
  // A retry skips the simulated-failure demo switch so presenters can show recovery right after showing the fallback.
  async function extract(retry = false) {
    if (busy || retrying || !raw.trim()) return
    const controller = new AbortController()
    request.current = controller
    if (retry) setRetrying(true); else setBusy(true)
    try {
      const { task: draft, meta, offline } = await extractViaApi(raw, team, workspace.now, { simulateFailure: llmFail && !retry, simulateDelayMs: aiMode === 'delay' ? 2500 : 0, signal: controller.signal })
      if (request.current !== controller) return
      if (offline) setHealth(null); else if (!health) void checkHealth()
      const sample = sampleLoaded(raw) && demoTeam
      setIntakeMeta(meta)
      openDraft(sample ? { ...draft, id: 'dashboard-demo', previousOwner: demoPreviousOwner } : draft, 'ai')
      if (retry) setToast(meta.mode === 'live' ? t('Live AI draft ready.', '실시간 AI 초안이 준비되었습니다.') : t('AI still unavailable · rule-based draft kept.', 'AI를 여전히 사용할 수 없어 규칙 기반 초안을 유지합니다.'))
    } catch {
      if (request.current !== controller) return
      manual(t('The draft request was cancelled. Your request is preserved in the manual form.', '초안 요청이 취소되었습니다. 직접 입력 화면에 원본 요청을 유지했습니다.'))
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); setRetrying(false) }
    }
  }
  function applyCalibrated() {
    const minutesValue = intakeMeta?.calibration.calibratedMinutes
    if (!task || !minutesValue) return
    setTask({ ...task, max: minutesValue, min: Math.min(task.min || minutesValue, minutesValue), confirmed: false, assumptions: [...task.assumptions, '⟲ ' + (intakeMeta.calibration.calibrationNote)] })
    setSnapshot(undefined)
  }
  // `fresh` runs the visible analysis sequence; recalculations after a correction or re-task update in place.
  function compare(draft = task, fresh = false) {
    if (!draft) return
    const latest = readWorkspace()
    setWorkspace(latest)
    const plan = planTask(draft, latest, replacement ? draft.id : undefined)
    const top = plan.ranked.slice(0, 3)
    const record = latest.assignments.find(({ task }) => task.id === draft.id)
    setSnapshot({ plan, version: latest.version, approvalId: crypto.randomUUID(), reviewedHistory: record?.history.length })
    setSelected(top.some((candidate) => candidate.employee.id === selected) ? selected : top[0]?.employee.id || '')
    setStep('compare'); setStale(null); setCompletedId('')
    if (fresh) { setAnalysis((state) => ({ run: state.run + 1, done: state.done, attempt: 0, failed: false })); setCorrected([]) }
    if (view !== 'workspace' || fresh) go('workspace')
  }
  async function update(mutator: (state: Workspace) => Workspace, success?: string) {
    try {
      const { state } = await transact((current) => ({ state: mutator(current), result: true }))
      setWorkspace(state)
      if (success) setToast(success)
      return true
    } catch {
      setToast(t('The browser could not save this change.', '브라우저에서 변경 사항을 저장하지 못했습니다.'))
      return false
    }
  }
  async function approve() {
    if (!task || !chosen || !snapshot || saving || completedId) return
    setSaving(true)
    try {
      const { state, result } = await transact((latest) => {
        const checked = checkApproval(latest, task, chosen, replacement, snapshot.approvalId, snapshot.reviewedHistory)
        return { state: checked.state, result: { status: checked.status, conflicts: checked.conflicts } }
      })
      setWorkspace(state)
      if (result.status === 'stale') setStale(result.conflicts || [])
      else {
        setCompletedId(task.id)
        setToast(result.status === 'duplicate' ? t('This task was already booked.', '이미 예약된 과제입니다.') : t('Assigned to ' + nameOf(chosen.employee, lang) + ' · on the team calendar', nameOf(chosen.employee, lang) + '님에게 배정 · 팀 캘린더에 등록'))
      }
    } catch { setToast(t('The browser could not save the assignment.', '브라우저에서 배정을 저장하지 못했습니다.')) }
    finally { setSaving(false) }
  }
  // An employee's correction lands on the shared calendar, then the comparison re-runs so every timeline visibly shifts.
  async function correct(block: Block) {
    const ok = await update((state) => flagCalendarChanges({ ...state, blocks: [...state.blocks, block] }, block.title), t('Schedule updated · comparison re-checked', '일정 반영 · 비교 다시 계산'))
    if (ok) { compare(); setCorrected((ids) => [...new Set([...ids, block.employeeId])]) }
    return ok
  }
  function retask(next: Task) { setTask(next); compare(next) }
  function saveSelf(id: string, skills: Employee['skills'], hours: Employee['hours']) {
    void update((state) => flagCalendarChanges({ ...state, verifications: { ...state.verifications, [id]: { ...state.verifications?.[id], skills, hours } } }, t('Employee updated their skills or working window.', '팀원이 스킬 또는 근무 시간을 수정했습니다.')), t('Your details are saved.', '정보가 저장되었습니다.'))
  }
  function editAssignment(record: Assignment) { setModal({ kind: 'assignment', id: record.task.id }) }
  function openCommitment(person?: string, block?: Block) { setModal({ kind: 'commitment', person, block }) }
  function openPerson(id: string) { setModal({ kind: 'person', id }) }
  function beginReplacement(record: Assignment) {
    setModal(undefined); setReplacement(true); setRaw(record.task.raw); setTeam(record.task.team)
    openDraft({ ...(record.proposed || record.task), confirmed: false }, 'review')
    go('workspace')
  }
  function markReview(id: string, note: string, effort: number | null, proposed?: Task) {
    void update((state) => ({ ...state, version: state.version + 1, assignments: state.assignments.map((record) => {
      if (record.task.id !== id) return record
      const taskUpdate = proposed || (effort ? { ...(record.proposed || record.task), max: effort, min: Math.min(record.task.min || effort, effort), confirmed: false } : record.proposed)
      return { ...record, proposed: taskUpdate, pending: true, history: [...record.history, { at: state.now, type: proposed ? 'change' : effort ? 'effort' : 'review', note: note + (effort ? ' · ' + effort + ' min' : '') }] }
    }) }), t('Review saved. The original booking is still visible.', '검토가 저장되었고 기존 예약이 유지됩니다.')).then((ok) => { if (ok) setModal(undefined) })
  }
  // AI-read commitments land on the shared calendar together, flagged so affected plans get re-checked.
  function addBlocks(blocks: Block[]) {
    if (!blocks.length) return
    void update((state) => flagCalendarChanges({ ...state, blocks: [...state.blocks, ...blocks] }, blocks.map((block) => block.title).join(', ')), t(blocks.length + ' commitments added to the calendar.', '일정 ' + blocks.length + '건을 캘린더에 추가했습니다.'))
  }
  function usePart(part: Task) { setReplacement(false); openDraft(part, 'review'); compare(part, true) }
  function saveCommitment(block: Block) {
    const employee = view === 'employee'
    void update((state) => {
      const changed = flagCalendarChanges({ ...state, blocks: [...state.blocks.filter((item) => item.id !== block.id), block] }, block.title)
      if (!employee) return changed
      return { ...changed, assignments: changed.assignments.map((record) => record.employeeId === block.employeeId && record.pending
        ? { ...record, history: [...record.history, { at: state.now, type: 'commitment', note: block.title }] } : record) }
    }, t('Commitment saved.', '일정이 저장되었습니다.')).then((ok) => { if (ok) setModal(undefined) })
  }
  function runScan() {
    void update((state) => ({ ...state, scans: [scanTeam(state, team, roster), ...(state.scans || [])].slice(0, 30) }), t('Schedule scan complete.', '일정 스캔이 완료되었습니다.'))
  }
  function resetWorkspace() {
    try { localStorage.removeItem(WORKSPACE_KEY) } catch { /* A fresh fixture loads either way. */ }
    const fresh = readWorkspace()
    resetRemote(fresh)
    setWorkspace(fresh); setModal(undefined); reset(team, true); go('dashboard')
    setToast(t('Demo workspace restored.', '데모 워크스페이스가 초기화되었습니다.'))
  }
  const providerName = ({ groq: 'Groq', gemini: 'Gemini', openai: 'OpenAI' } as Record<string, string>)[health?.llmProvider || ''] || health?.llmProvider || ''
  const llmStatus = !health ? t('API offline · rule parser', 'API 오프라인 · 규칙 파서') : health.llmConfigured && !llmFail ? t('LLM live · ' + providerName, 'LLM 연결 · ' + providerName) : t('LLM fallback mode', 'LLM 대체 모드')
  const fromLead = view !== 'employee'

  // Bell: pending reviews plus the latest scan's watch/review findings for this team.
  const notifications = useMemo<Notification[]>(() => {
    const items: Notification[] = teamAssignments.filter((record) => record.pending).map((record) => ({
      id: 'review:' + record.task.id + ':' + record.history.length, tone: 'red', level: t('Review', '검토'),
      title: t('Assignment needs review', '배정 검토 필요'), detail: record.task.title + ' · ' + record.history.at(-1)?.note, open: () => editAssignment(record),
    }))
    const scan = (workspace.scans || []).find((item) => item.team === team)
    scan?.findings.filter((finding) => finding.level >= 2 && finding.kind !== 'review').forEach((finding, index) => {
      const person = roster.find(({ id }) => id === finding.ref)
      const sev = severity(finding.level, t)
      items.push({ id: scan.id + ':' + index, tone: sev.tone, level: sev.label, title: findingLabel(finding.kind, t), detail: (person ? nameOf(person, lang) + ' · ' : '') + (finding.kind === 'skill' ? skillLabel(finding.detail, lang) : finding.detail), open: () => go('automation') })
    })
    return items.slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, team, lang])

  const paletteItems: PaletteItem[] = [
    ...routes.map((item) => ({ id: 'page:' + item.id, group: t('Navigate', '이동'), label: item.label, hint: item.hint, icon: item.icon, run: () => go(item.id) })),
    { id: 'act:new', group: t('Actions', '작업'), label: t('New urgent task', '새 긴급 업무'), icon: Plus, keywords: 'task assign request', run: () => reset() },
    ...(demoTeam ? [{ id: 'act:demo', group: t('Actions', '작업'), label: t('Load 4h urgent demo', '4시간 긴급 데모 불러오기'), hint: t('The signature scenario', '대표 시나리오'), icon: FlaskConical, run: openDemo }] : []),
    { id: 'act:scan', group: t('Actions', '작업'), label: t('Run schedule scan', '일정 스캔 실행'), icon: Activity, keywords: 'automation alerts', run: () => { runScan(); go('automation') } },
    { id: 'act:commit', group: t('Actions', '작업'), label: t('Add commitment', '일정 추가'), icon: CalendarDays, keywords: 'meeting block', run: () => openCommitment() },
    { id: 'act:ics', group: t('Actions', '작업'), label: t('Download team calendar', '팀 캘린더 다운로드'), hint: '.ics', icon: Download, run: () => downloadCalendar(teamAssignments, people, workspace.now) },
    { id: 'act:theme', group: t('Actions', '작업'), label: theme === 'dark' ? t('Switch to light mode', '라이트 모드로 전환') : t('Switch to dark mode', '다크 모드로 전환'), icon: theme === 'dark' ? Sun : Moon, run: () => switchTheme(toggleTheme) },
    { id: 'act:lang', group: t('Actions', '작업'), label: lang === 'en' ? '한국어로 전환' : 'Switch to English', icon: Globe2, keywords: 'language korean english', run: language },
    { id: 'act:ai', group: t('Actions', '작업'), label: t('Open AI assistant', 'AI 도우미 열기'), hint: 'Ctrl J', icon: Sparkles, keywords: 'ai copilot brief split schedule', run: () => setCopilot(true) },
    { id: 'act:tour', group: t('Actions', '작업'), label: t('Replay the guided tour', '둘러보기 다시 보기'), icon: CircleHelp, run: () => { go('dashboard'); setTour(true) } },
    { id: 'act:settings', group: t('Actions', '작업'), label: t('Settings', '설정'), hint: t('LLM API, demo controls, policy', 'LLM API, 데모 제어, 정책'), icon: Settings2, run: () => setModal({ kind: 'settings' }) },
    ...people.map((person) => ({ id: 'person:' + person.id, group: t('People', '팀원'), label: nameOf(person, lang), hint: person.role + ' · ' + person.id, icon: User, keywords: person.name + ' ' + person.korean, run: () => openPerson(person.id) })),
  ]

  const descriptions: Partial<Record<View, string>> = {
    employees: t('Skills, availability and this week’s load.', '스킬, 가용 시간, 이번 주 업무량.'),
    automation: t('Proactive checks across the shared calendar.', '공유 캘린더 전체를 미리 점검합니다.'),
    calendar: t('Every work block and commitment · Asia/Seoul', '모든 작업 블록과 일정 · Asia/Seoul'),
    worklog: t('Every confirmed assignment and review.', '모든 확정 배정과 검토 기록.'),
    workload: t('Workload and a replay against previous-owner-first.', '업무량 및 이전 담당자 우선 방식과의 비교.'),
    employee: t('What a team member sees — and can correct.', '팀원이 보고 직접 정정할 수 있는 화면.'),
    import: t('Bring in commitments or verified skills.', '일정이나 검증된 스킬을 가져옵니다.'),
    about: t('Theme fit, data sources and privacy on one page.', '주제 적합성, 데이터 출처, 개인정보 보호를 한 페이지에서 확인합니다.'),
  }
  const navButton = ({ id, icon: Icon, label, badge }: typeof routes[number]) => <button key={id} className={'nav-item ' + (view === id ? 'active' : '')} aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}>
    <Icon size={17} strokeWidth={1.9} /><span>{label}</span>{!!badge && <span className="nav-badge">{badge}</span>}
  </button>

  // The bare URL opens the standalone landing page; the app shell starts at #/dashboard.
  if (view === 'about') return <ThemeContext.Provider value={theme}><div className="landing">
    <header className="landing-bar">
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Flow"><Wordmark /></button>
      <div className="header-actions">
        <button className="icon-button lang-button" onClick={language} aria-label={lang === 'en' ? '한국어로 전환' : 'Switch to English'}><Globe2 size={15} />{lang === 'en' ? 'EN' : '한'}</button>
        <button className="icon-button" onClick={(event) => switchTheme(toggleTheme, event)} aria-label={theme === 'dark' ? t('Switch to light mode', '라이트 모드로 전환') : t('Switch to dark mode', '다크 모드로 전환')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        <button className="btn primary slim" onClick={() => go('dashboard')}>{t('Open app', '앱 열기')}<ChevronRight size={15} /></button>
      </div>
    </header>
    <main className="landing-content page"><About t={t} lang={lang} health={health} now={workspace.now} team={team} onDemo={openDemo} onOpenApp={() => go('dashboard')} onEmployeeView={() => go('employee')} onUseRequest={(text) => { reset(team); setRaw(text) }} /></main>
    <Toasts message={toast} />
  </div></ThemeContext.Provider>

  return <ThemeContext.Provider value={theme}><div className="shell">
    {menu && <button aria-label={t('Close menu', '메뉴 닫기')} className="mobile-overlay" onClick={() => setMenu(false)} />}

    <aside className={'sidebar ' + (menu ? 'open' : '')}>
      <button className="brand" onClick={() => go('dashboard')} aria-label="Flow"><Wordmark /></button>
      <button className="btn primary new-task" onClick={() => reset()}><Plus size={16} />{t('New urgent task', '새 긴급 업무')}</button>
      <nav aria-label={t('Main navigation', '주 메뉴')} className="nav-main">
        {routes.filter((item) => item.tier === 'core').map(navButton)}
        <button className={'nav-more' + (moreOpen ? ' open' : '')} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>{t('More', '더 보기')}{pendingCount > 0 && !moreOpen && <span className="nav-badge">{pendingCount}</span>}<ChevronDown size={14} /></button>
        <div className={'expand' + (moreOpen ? ' open' : '')} inert={!moreOpen}><div className="nav-more-list">{routes.filter((item) => item.tier === 'more').map(navButton)}</div></div>
      </nav>
      <div className="sidebar-bottom">
        <div className="team-switch"><span className="team-icon">{teamName(team, lang).slice(0, 1)}</span><div><label htmlFor="team-select">{t('Team', '팀')}</label><Select id="team-select" value={team} onChange={(event) => { setTeam(event.target.value); reset(event.target.value, true); go(view) }}>{teams.map((item) => <option value={item} key={item}>{teamName(item, lang)}</option>)}</Select></div></div>
        <button className="status-line" onClick={() => setModal({ kind: 'settings' })}><span className={'live-dot ' + (online ? '' : 'off')} /><Cpu size={13} /><span className="status-text">{llmStatus}</span></button>
        <div className="sidebar-row">
          <button className="role-switch" onClick={() => go(view === 'employee' ? 'dashboard' : 'employee')} aria-label={t('Switch perspective', '보기 전환')}><span className="profile-avatar">{view === 'employee' ? 'EV' : 'TL'}</span><span><strong>{view === 'employee' ? t('Employee view', '팀원 화면') : t('Team lead', '팀 리드')}</strong><small>{t('Switch perspective', '보기 전환')}</small></span></button>
          <button className="icon-button" onClick={() => { setMenu(false); setModal({ kind: 'settings' }) }} aria-label={t('Settings', '설정')}><Settings2 size={17} /></button>
        </div>
      </div>
    </aside>

    <div className="main">
      <header className="topbar">
        <div className="topbar-title">
          <button className="icon-button menu-button" onClick={() => setMenu(!menu)} aria-label={t('Open menu', '메뉴 열기')}>{menu ? <X size={20} /> : <Menu size={20} />}</button>
          <div className="breadcrumb"><span>{teamName(team, lang)}</span><ChevronRight size={13} /><strong key={view}>{route.label}</strong></div>
        </div>
        <div className="header-actions">
          <button className="chip-button search-button" onClick={() => setPalette(true)} aria-label={t('Search', '검색')}><Search size={14} /><span>{t('Search', '검색')}</span><kbd>Ctrl K</kbd></button>
          <button className="ai-button" onClick={() => setCopilot(true)} aria-label={t('AI assistant', 'AI 도우미')}><Sparkles size={15} /><span>{t('AI assistant', 'AI 도우미')}</span></button>
          <button className="icon-button help-button" onClick={() => go('about')} aria-label={t('How Flow works', 'Flow 작동 방식')} title={t('How Flow works', 'Flow 작동 방식')}><CircleHelp size={17} /></button>
          <NotificationsBell items={notifications} t={t} footer={{ label: t('View all in Schedule check', '일정 점검에서 모두 보기'), run: () => go('automation') }} />
          <button className="icon-button lang-button" onClick={language} aria-label={lang === 'en' ? '한국어로 전환' : 'Switch to English'}><Globe2 size={15} />{lang === 'en' ? 'EN' : '한'}</button>
          <button className="icon-button" onClick={(event) => switchTheme(toggleTheme, event)} aria-label={theme === 'dark' ? t('Switch to light mode', '라이트 모드로 전환') : t('Switch to dark mode', '다크 모드로 전환')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>

      <main className="content">
        <div className="page" key={view}>
          {view === 'dashboard' && <Dashboard workspace={workspace} people={people} lang={lang} t={t} demoTeam={demoTeam} onNavigate={go} onNewRequest={() => reset()} onDemo={openDemo} onAssignment={editAssignment} onPerson={openPerson} llmFail={llmFail} />}

          {view === 'workspace' && <div className="flow">
            <nav className="stepper" aria-label={t('Assignment steps', '배정 단계')} style={{ '--step': currentStep } as CSSProperties}>
              <span className="stepper-pill" aria-hidden="true" />
              {steps.map((item, index) => <button key={item.id} className={currentStep === index ? 'current' : currentStep > index ? 'past' : ''} aria-current={currentStep === index ? 'step' : undefined}
                disabled={currentStep === index || (!!confirmed && index !== currentStep) || (index === 1 && !snapshot) || (index === 2 && (!snapshot || !chosen || currentStep < 1))}
                onClick={() => { setStep(item.id); if (item.id === 'compare' && stale) compare() }}>
                <span className="step-circle">{index < currentStep ? <Check size={13} strokeWidth={3} /> : index + 1}</span>{item.title}
              </button>)}
            </nav>
            <div className="flow-body" key={step + (task ? ':task' : '')}>
              {step === 'request' && (!task
                ? <RequestPane raw={raw} setRaw={setRaw} t={t} busy={busy} demo={demoTeam} online={online} onDemo={openDemo} onExtract={() => void extract()} onManual={() => manual()} onSettings={() => setModal({ kind: 'settings' })} llmLabel={llmStatus} />
                : <>{draftSource === 'ai' && intakeMeta && <IntakeBanner meta={intakeMeta} t={t} lang={lang} retrying={retrying} onRetry={() => void extract(true)} onUseCalibrated={applyCalibrated} calibratedApplied={task.assumptions.some((item) => item.startsWith('⟲ '))} />}<HiddenWorkCheck task={task} lang={lang} t={t} onAdd={(question) => { setTask({ ...task, questions: [...task.questions, question], confirmed: false }); setSnapshot(undefined) }} /><TaskForm key={task.id + draftSource + preset} task={task} preset={draftSource === 'seed' && preset > 0} onChange={(draft) => { setTask(draft); setSnapshot(undefined); setSelected('') }} now={workspace.now} people={people} t={t} lang={lang} warning={warning} source={draftSource} onBack={() => { setTask(undefined); setSnapshot(undefined); setReplacement(false); setPreset(0) }} onSubmit={() => compare(task, true)} /></>)}
              {step === 'compare' && task && snapshot && <Compare task={task} plan={snapshot.plan} current={workspace} replacement={replacement} lang={lang} t={t} selected={selected} select={setSelected} onEdit={() => setStep('request')} onNext={() => { setStep('approve'); window.scrollTo(0, 0) }} onRetask={retask} onSettings={() => setModal({ kind: 'settings' })} onRefresh={() => compare()} stale={workspace.version !== snapshot.version} onVerify={(id) => setModal({ kind: 'verify', id })}
                onCorrection={correct} corrected={corrected} analysis={analysis} aiMode={aiMode} onAnalysisDone={(failed) => setAnalysis((state) => ({ ...state, done: state.run, failed }))} onRetry={() => setAnalysis((state) => ({ run: state.run + 1, done: state.done, attempt: state.attempt + 1, failed: false }))} employeeView={employeeView} setEmployeeView={setEmployeeView} llmFail={llmFail} onUsePart={usePart} />}
              {step === 'approve' && task && <Approval task={task} candidate={chosen} replacement={replacement} confirmed={confirmed} confirmedEmployee={people.find((person) => person.id === confirmed?.employeeId)} stale={stale} busy={saving} workspace={workspace} onApprove={() => void approve()} onCompare={() => stale ? compare() : setStep('compare')} onCalendar={() => go('calendar')} onNew={() => reset()} onDownload={() => { if (confirmed) downloadCalendar([confirmed], people, workspace.now) }} t={t} lang={lang} />}
            </div>
          </div>}

          {view !== 'dashboard' && view !== 'workspace' && <PageHeading title={route.label} description={descriptions[view]} actions={<Label tone="neutral"><FlaskConical size={12} />{t('Synthetic data', '합성 데이터')}</Label>} />}
          {view === 'employees' && <Employees workspace={workspace} people={people} lang={lang} t={t} onOpen={openPerson} />}
          {view === 'automation' && <Automation workspace={workspace} people={people} team={team} lang={lang} t={t} run={runScan} onAssignment={editAssignment} onPerson={openPerson} />}
          {view === 'calendar' && <Calendar key={team} workspace={workspace} people={people} lang={lang} t={t} onEdit={editAssignment} onCommitment={openCommitment} onLog={() => go('worklog')} />}
          {view === 'worklog' && <WorkLog workspace={workspace} people={people} team={team} lang={lang} t={t} onAssignment={editAssignment} />}
          {view === 'workload' && <Suspense fallback={<p className="muted">{t('Loading analytics…', '분석 불러오는 중…')}</p>}><Insights workspace={workspace} people={people} lang={lang} team={team} t={t} onTools={() => go('employees')} /></Suspense>}
          {view === 'employee' && <EmployeeView workspace={workspace} people={people} personId={personId} setPerson={setPersonId} lang={lang} t={t} onEdit={editAssignment} onCommitment={openCommitment} onSelfSave={saveSelf} onAddBlocks={addBlocks} llmFail={llmFail} />}
          {view === 'import' && <Import people={people} t={t} apply={(data) => update((state) => importToWorkspace(state, data, t('CSV import changed the team schedule or profiles.', 'CSV 가져오기로 팀 일정 또는 프로필이 변경되었습니다.')), t('CSV imported.', 'CSV를 가져왔습니다.'))} />}
        </div>
        <footer className="app-footer">
          <span>Flow v0.2 · {t('Synthetic demo data', '합성 데모 데이터')} · Asia/Seoul</span>
          <span className={'sync-pill ' + sync.mode} title={sync.message || undefined}><span className='sync-dot' key={sync.mode + ':' + (sync.rev ?? '')} />{({ local: t('Saved in this browser', '이 브라우저에 저장'), connecting: t('Connecting to Supabase…', 'Supabase 연결 중…'), synced: t('Synced to Supabase', 'Supabase 동기화됨') + (sync.rev ? ' · rev ' + sync.rev : ''), syncing: t('Saving…', '저장 중…'), offline: t('Offline · will retry', '오프라인 · 자동 재시도'), 'schema-missing': t('Supabase schema missing', 'Supabase 스키마 없음'), error: t('Supabase error', 'Supabase 오류') } as Record<string, string>)[sync.mode]}</span>
          <span className="app-footer-links"><button className="text-button" onClick={() => go('about')}>{t('How Flow works', 'Flow 작동 방식')}</button><button className="text-button" onClick={() => setModal({ kind: 'settings' })}><span className={'live-dot ' + (online ? '' : 'off')} />{llmStatus}</button></span>
        </footer>
      </main>
    </div>

    {/* Phones: the four core screens plus the AI assistant stay one tap away. */}
    <nav className="mobile-tabbar" aria-label={t('Main navigation', '주 메뉴')}>
      {([['dashboard', LayoutDashboard, t('Home', '홈')], ['workspace', Briefcase, t('Assign', '배정')]] as const).map(([id, Icon, label]) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={20} /><span>{label}</span></button>)}
      <button className="tab-new" onClick={() => reset()} aria-label={t('New urgent task', '새 긴급 업무')}><Plus size={22} /></button>
      {([['calendar', CalendarDays, t('Schedule', '일정')], ['employees', Users, t('People', '팀원')]] as const).map(([id, Icon, label]) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={20} /><span>{label}</span></button>)}
    </nav>

    <Copilot open={copilot} close={() => setCopilot(false)} workspace={workspace} people={people} team={team} lang={lang} t={t} simulateFailure={llmFail} onAddBlocks={addBlocks} onUseTask={(next) => { setReplacement(false); openDraft(next, 'review'); go('workspace') }} />
    {tour && <Tour t={t} done={() => { setTour(false); setPref('tour', 'done') }} stops={[
      { selector: '.new-task, .mobile-tabbar .tab-new, .menu-button', title: t('Start with an urgent request', '긴급 요청으로 시작하세요'), body: t('Paste a message in Korean or English. AI drafts the task; you confirm it.', '한국어나 영어 메시지를 붙여 넣으세요. AI가 과제 초안을 만들고, 리드가 확인합니다.') },
      { selector: '.ai-button', title: t('Your AI assistant', 'AI 도우미'), body: t('Weekly fairness brief, schedule from a message, and task splitting. Press Ctrl J anytime.', '주간 공정성 브리핑, 메시지로 일정 등록, 작업 나누기. 언제든 Ctrl J를 누르세요.') },
      { selector: '.search-button', title: t('Jump anywhere', '어디든 바로 이동'), body: t('Ctrl K finds people, pages and actions.', 'Ctrl K로 팀원, 화면, 작업을 찾습니다.') },
      { selector: '.help-button', title: t('How Flow works', 'Flow 작동 방식'), body: t('Theme, data sources and privacy — the page judges should see first.', '주제, 데이터 출처, 개인정보 보호 — 처음 보면 좋은 페이지입니다.') },
    ]} />}
    <CommandPalette open={palette} close={() => setPalette(false)} items={paletteItems} t={t} />
    <Toasts message={toast} />

    {modal?.kind === 'settings' && <Dialog title={t('Settings', '설정')} close={() => setModal(undefined)}><Settings workspace={workspace} health={health} llmFail={llmFail} setLlmFail={(on) => { setLlmFail(on); setPref('llm-fail', on ? 'on' : 'off') }} t={t} aiMode={aiMode} setAiMode={(mode) => { setAiMode(mode); setPref('ai-mode', mode) }} check={() => void checkHealth()} onImport={() => { setModal(undefined); go('import') }} onReset={resetWorkspace} savePolicy={(policy, now) => {
      void update((state) => flagCalendarChanges({ ...state, policy, now }, t('Company policy or fixture clock changed.', '회사 정책 또는 데모 기준 시각이 변경되었습니다.'), true), t('Demo policy saved.', '데모 정책이 저장되었습니다.')).then((ok) => { if (ok) setModal(undefined) })
    }} /></Dialog>}
    {profilePerson && <Dialog key={profilePerson.id} variant="sheet" title={t('Profile', '프로필')} close={() => setModal(undefined)}><EmployeeProfile person={profilePerson} workspace={workspace} people={people} lang={lang} t={t} onAssignment={editAssignment} onCommitment={openCommitment} onVerify={(id) => setModal({ kind: 'verify', id })} onEmployeeView={(id) => { setPersonId(id); setModal(undefined); go('employee') }} /></Dialog>}
    {modal?.kind === 'commitment' && <Dialog title={modal.block ? t('Edit commitment', '일정 수정') : fromLead ? t('Add commitment', '일정 추가') : t('Report missing commitment', '누락 일정 신고')} close={() => setModal(undefined)}><CommitmentForm people={people} personId={modal.person} block={modal.block} workspace={workspace} lang={lang} t={t} employee={!fromLead} save={saveCommitment} remove={() => {
      const id = modal.block?.id
      if (id) void update((state) => flagCalendarChanges({ ...state, blocks: state.blocks.filter((item) => item.id !== id) }, t('Calendar commitment removed.', '일정이 제거되었습니다.'))).then((ok) => { if (ok) setModal(undefined) })
    }} /></Dialog>}
    {modalAssignment && <Dialog key={modalAssignment.task.id} variant="sheet" title={modalAssignment.task.title} close={() => setModal(undefined)}><AssignmentDetails record={modalAssignment} person={roster.find(({ id }) => id === modalAssignment.employeeId)!} employee={!fromLead} lang={lang} t={t} replace={() => beginReplacement(modalAssignment)} update={(note, effort) => markReview(modalAssignment.task.id, note, effort)} propose={(draft) => markReview(modalAssignment.task.id, t('Deadline or upper effort updated for review.', '검토용 마감 또는 최대 예상 작업 시간 변경.'), null, draft)} /></Dialog>}
    {modalPerson && <Dialog title={t('Verify candidate details', '후보 정보 확인')} close={() => setModal(undefined)}><VerificationForm person={modalPerson} workspace={workspace} lang={lang} t={t} save={(schedule, item, value, verifiedTasks) => {
      void update((state) => {
        const current = state.verifications?.[modalPerson.id]
        const access = item ? { ...current?.access, [accessId(item)]: value === 'unknown' ? value : value ? [{ start: value.start, end: value.end }] : [] } : current?.access
        return flagCalendarChanges({ ...state, verifiedTasks, verifications: { ...state.verifications, [modalPerson.id]: { ...current, schedule, access } } }, t('Candidate access or working windows changed.', '후보자의 접근 권한 또는 근무 시간이 변경되었습니다.'))
      }, t('Candidate details saved. Refresh the comparison.', '후보 정보가 저장되었습니다. 비교를 새로고침하세요.')).then((ok) => { if (ok) setModal(undefined) })
    }} /></Dialog>}
  </div></ThemeContext.Provider>
}

// A render error shows a recoverable screen instead of a blank page; the saved workspace is untouched.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[flow] render error', error) }
  render() {
    if (!this.state.error) return this.props.children
    const ko = getPref('language', 'ko') !== 'en'
    return <div className="crash"><div className="crash-card">
      <BrandMark /><h1>{ko ? '화면을 표시하지 못했습니다' : 'Something went wrong'}</h1>
      <p>{ko ? '저장된 데이터는 그대로입니다. 새로고침하거나 대시보드로 돌아가세요.' : 'Your saved data is safe. Reload, or go back to the dashboard.'}</p>
      <code>{this.state.error.message}</code>
      <div className="actions start"><button className="btn primary" onClick={() => location.reload()}>{ko ? '새로고침' : 'Reload'}</button><button className="btn secondary" onClick={() => { location.hash = '#/dashboard'; location.reload() }}>{ko ? '대시보드로' : 'Go to dashboard'}</button></div>
    </div></div>
  }
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>)
