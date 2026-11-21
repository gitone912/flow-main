import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, ChevronRight, Cpu, Gauge, LockKeyhole, PencilLine, Plus, RefreshCw, ScanText, ShieldCheck, Trash2, Zap } from 'lucide-react'
import type { ExtractResponse } from './extract'
import { accessId, catalog, dateInput, fromInput, minutes, skillLabel, taskIssues, type Employee, type Language, type Task } from './domain'
import { exampleRequest } from './seed'
import { AnalysisLoader, Disclosure, Field, Label, Notice, Select, type Translate } from './ui'

const extractionSteps = (t: Translate) => [t('Sending to the Flow API', 'Flow API로 전송'), t('LLM extracting skills & effort', 'LLM이 스킬·시간 추출'), t('Validating & calibrating', '검증 및 보정')]

export function DemoChip({ t, onClick, disabled }: { t: Translate; onClick: () => void; disabled?: boolean }) {
  return <button className="demo-chip" onClick={onClick} disabled={disabled}><span className="demo-chip-icon"><Zap size={14} /></span>{t('Load 4h urgent demo', '4시간 긴급 데모 불러오기')}<ChevronRight size={15} /></button>
}

export function RequestPane({ raw, setRaw, t, busy, demo, onDemo, onExtract, onManual, onSettings, online, llmLabel }: {
  raw: string; setRaw: (raw: string) => void; t: Translate; busy: boolean; demo: boolean
  onDemo: () => void; onExtract: () => void; onManual: () => void; onSettings: () => void; online: boolean; llmLabel: string
}) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!busy) { setPhase(0); return }
    const timers = [1, 2].map((n) => window.setTimeout(() => setPhase(n), n * 1400))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [busy])
  if (busy) return <section className="intake flow-step"><AnalysisLoader steps={extractionSteps(t)} phase={phase} title={t('AI is drafting your task…', 'AI가 과제를 정리하는 중…')} cards={0} />
    <div className="intake-skeleton"><span className="sk sk-line w40 tall" /><span className="sk sk-line w100" /><span className="sk sk-line w70" /><div className="sk-row"><span className="sk sk-pill" /><span className="sk sk-pill" /><span className="sk sk-pill" /></div></div>
    <div className="intake-actions"><button className="btn ghost" onClick={onManual}>{t('Cancel and enter manually', '취소하고 직접 입력')}</button></div>
  </section>
  return <section className="intake flow-step">
    <div className="intake-hero">
      <div><h2>{t('What needs to happen?', '어떤 업무가 급한가요?')}</h2><p>{t('Paste the request. Flow drafts the task, then finds who has real focus time for it.', '요청을 붙여 넣으면 Flow가 과제를 정리하고 실제로 집중할 시간이 있는 팀원을 찾습니다.')}</p></div>
      {demo && <DemoChip t={t} onClick={onDemo} />}
    </div>
    <div className="request-box">
      <textarea id="request-text" aria-label={t('Request message', '요청 메시지')} spellCheck maxLength={6000} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder={t('Paste a Slack message, email, or work request…', '슬랙, 이메일 또는 업무 요청 내용을 붙여 넣으세요…')} />
      <div className="request-box-footer"><button className="local-note" onClick={onSettings}><LockKeyhole size={13} />{online ? llmLabel + t(' · keys stay on the server', ' · 키는 서버에만 보관') : t('API offline · rule-based parser still works', 'API 오프라인 · 규칙 기반 파서 사용 가능')}<ArrowUpRight size={13} /></button><span className="tabular">{raw.length.toLocaleString()} / 6,000</span></div>
    </div>
    <div className="intake-actions">
      <button className="btn primary lg" onClick={onExtract} disabled={!raw.trim()}><ScanText size={16} />{t('Draft with AI', 'AI로 초안 만들기')}</button>
      <button className="btn ghost" onClick={onManual}><PencilLine size={15} />{t('Enter manually', '직접 입력')}</button>
    </div>
  </section>
}

export const issueText = (id: string, t: Translate) => ({
  scope: t('Add a task title and a concrete deliverable.', '과제 제목과 구체적인 결과물을 입력하세요.'),
  effort: t('Confirm a positive effort range in minutes.', '분 단위의 예상 작업 범위를 확인하세요.'),
  deadline: t('When exactly is the deadline? Choose a time after the workspace clock.', '정확한 마감이 언제인가요? 현재 시각 이후의 시간을 선택하세요.'),
  skills: t('Set a minimum level for each skill and resolve unmapped skills.', '각 스킬의 최소 레벨을 정하고 미분류 스킬을 해결하세요.'),
  priority: t('Confirm the task priority.', '우선순위를 확인하세요.'),
  focus: t('Can this task be split? If so, confirm the minimum focus time.', '작업을 나눌 수 있나요? 가능하면 최소 집중 시간을 입력하세요.'),
  dependency: t('When will each prerequisite be ready?', '각 선행 작업이나 입력 자료는 언제 준비되나요?'),
  questions: t('Resolve the questions in the draft before continuing.', '비교하기 전에 초안에 남은 질문을 해결하세요.'),
  confirmation: t('Confirm the reviewed requirements below.', '아래에서 검토한 요건을 확인하세요.'),
})[id] || t('Complete the company policy in Settings: ', '설정에서 회사 정책을 입력하세요. ') + id.replace('policy-', '')

export function TaskForm({ task, onChange, now, people, t, lang, warning, source, preset, onBack, onSubmit }: {
  task: Task; onChange: (task: Task) => void; now: number; people: Employee[]; t: Translate; lang: Language
  warning: string; source: 'manual' | 'seed' | 'ai' | 'review'; preset: boolean; onBack: () => void; onSubmit: () => void
}) {
  const [submitted, setSubmitted] = useState(false)
  const [newSkill, setNewSkill] = useState('')
  const [newAccess, setNewAccess] = useState('')
  const change = (data: Partial<Task>) => onChange({ ...task, ...data, confirmed: data.confirmed ?? false })
  const errors = taskIssues(task, now)
  const numberValue = (input: string) => input === '' ? null : Number(input)
  const eligiblePreferences = catalog.filter((item) => !task.required.some((rule) => rule.id === item.id))
  const preferredCount = task.preferred.length + task.access.length + task.dependencies.length + (task.previousOwner ? 1 : 0)
  const skillCheckbox = (item: typeof catalog[number]) => <label key={item.id}><input type="checkbox" checked={task.preferred.includes(item.id)} onChange={(e) => change({ preferred: e.target.checked ? [...task.preferred, item.id] : task.preferred.filter((id) => id !== item.id) })} />{item[lang]}</label>
  const sourceLabel = { manual: t('Manual', '직접 입력'), seed: t('Demo preset', '데모 프리셋'), ai: t('AI draft', 'AI 초안'), review: t('Replacement', '재배정') }[source]
  return <section className={'task-sheet flow-step' + (preset ? ' preset-fill' : '')}>
    <form className="task-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (!errors.length) onSubmit() }}>
      <div className="sheet-head"><Label tone={source === 'seed' ? 'focus' : 'violet'}>{sourceLabel}</Label><input className="title-input" aria-label={t('Task title', '과제 제목')} value={task.title} maxLength={120} onChange={(e) => change({ title: e.target.value })} placeholder={t('Name the task', '과제 이름')} /></div>
      {warning && <Notice>{warning}</Notice>}
      {task.questions.length > 0 && <div className="draft-questions"><h3>{t('Questions to resolve', '확인이 필요한 질문')}</h3>{task.questions.map((question, index) => <div key={index}><span>{question}</span><button type="button" className="btn secondary slim" onClick={() => change({ questions: task.questions.filter((_, i) => i !== index) })}><Check size={15} />{t('Resolved', '해결 완료')}</button></div>)}</div>}

      <div className="form-grid primary-fields">
        <Field label={t('Priority', '우선순위')}><Select value={task.priority} onChange={(e) => change({ priority: e.target.value as Task['priority'] })}><option value="">{t('Choose', '선택')}</option><option value="routine">{t('Routine', '일반')}</option><option value="high">{t('High', '높음')}</option><option value="urgent">{t('Urgent', '긴급')}</option></Select></Field>
        <Field label={t('Deadline · KST', '마감 · KST')}><input type="datetime-local" value={dateInput(task.deadline)} onChange={(e) => change({ deadline: fromInput(e.target.value) })} /></Field>
        <Field label={t('Effort · minutes', '예상 작업 · 분')} hint={task.source === 'estimate' ? t('Model estimate · verify', '모델 추정치 · 확인 필요') : task.max ? t('Reserves ', '예약 ') + minutes(task.max, lang) : undefined}>
          <div className="range-input"><input type="number" min={1} aria-label={t('Lower effort', '최소')} value={task.min ?? ''} onChange={(e) => change({ min: numberValue(e.target.value), source: 'manual' })} /><span>–</span><input type="number" min={1} aria-label={t('Upper effort', '최대')} value={task.max ?? ''} onChange={(e) => change({ max: numberValue(e.target.value), source: 'manual' })} /></div>
        </Field>
        <Field label={t('Focus', '집중 방식')}><Select value={task.split === null ? '' : String(task.split)} onChange={(e) => change({ split: e.target.value === '' ? null : e.target.value === 'true' })}><option value="">{t('Choose', '선택')}</option><option value="true">{t('Can split into blocks', '블록 분할 가능')}</option><option value="false">{t('One continuous block', '하나의 연속 블록')}</option></Select></Field>
        {task.split && <Field label={t('Minimum block · minutes', '최소 블록 · 분')}><input type="number" min={1} value={task.focus ?? ''} onChange={(e) => change({ focus: numberValue(e.target.value) })} /></Field>}
        <div className="full"><Field label={t('Deliverable', '결과물')}><input value={task.deliverable} onChange={(e) => change({ deliverable: e.target.value })} placeholder={t('What does done look like?', '완료 기준은 무엇인가요?')} /></Field></div>
        <div className="full skills-field"><span className="field-label">{t('Required skills', '필수 스킬')}</span>
          <div className="skill-rules">{task.required.map(({ id, level }) => <span className="skill-rule" key={id}><span>{skillLabel(id, lang)}</span><select aria-label={skillLabel(id, lang) + ' ' + t('minimum level', '최소 레벨')} value={level ?? ''} onChange={(e) => change({ required: task.required.map((rule) => rule.id === id ? { ...rule, level: numberValue(e.target.value) } : rule) })}><option value="">{t('Lvl?', '레벨?')}</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{t('L', 'L')}{n}+</option>)}</select><button type="button" aria-label={t('Remove ', '삭제 ') + skillLabel(id, lang)} onClick={() => change({ required: task.required.filter((rule) => rule.id !== id) })}><Trash2 size={13} /></button></span>)}
            <span className="skill-add"><select aria-label={t('Skill to add', '추가할 스킬')} value={newSkill} onChange={(e) => setNewSkill(e.target.value)}><option value="">{t('+ Add skill', '+ 스킬 추가')}</option>{eligiblePreferences.map((item) => <option key={item.id} value={item.id}>{item[lang]}</option>)}</select>{newSkill && <button type="button" className="btn secondary slim" onClick={() => { change({ required: [...task.required, { id: newSkill, level: null }], preferred: task.preferred.filter((id) => id !== newSkill) }); setNewSkill('') }}><Plus size={14} />{t('Add', '추가')}</button>}</span>
          </div>
          {task.unmapped.map((item, index) => <div className="field-line" key={index}><Label tone="peach">{item}</Label><button className="text-button" type="button" onClick={() => change({ unmapped: task.unmapped.filter((_, i) => i !== index) })}>{t('Mark reviewed', '검토 완료')}</button></div>)}
        </div>
      </div>

      <Disclosure className="more-details" label={<>{t('More details', '세부 정보')}{preferredCount > 0 && <small> · {preferredCount} {t('set', '개 설정')}</small>}</>}>
        <div className="form-grid">
          <Field label={t('Usual assignee', '기존 담당자')}><Select value={task.previousOwner} onChange={(e) => change({ previousOwner: e.target.value })}><option value="">{t('None', '없음')}</option>{people.map((person) => <option key={person.id} value={person.id}>{lang === 'ko' ? person.korean : person.name}</option>)}</Select></Field>
          <div className="field"><span className="field-label">{t('Required access', '필수 권한')}</span><div className="chips">{task.access.map((item) => <button className="tag" key={item} type="button" onClick={() => change({ access: task.access.filter((id) => id !== item) })} aria-label={t('Remove access ', '권한 삭제 ') + item}>{item}<Trash2 size={12} /></button>)}</div>
            <div className="field-line grow"><input aria-label={t('Access requirement', '필요 권한')} placeholder={t('e.g., staging', '예: 스테이징')} value={newAccess} onChange={(e) => setNewAccess(e.target.value)} /><button className="btn secondary slim" type="button" disabled={!newAccess.trim()} onClick={() => { change({ access: [...new Set([...task.access, accessId(newAccess)])] }); setNewAccess('') }}><Plus size={14} />{t('Add', '추가')}</button></div></div>
          <div className="full"><span className="field-label">{t('Nice-to-have skills', '우대 스킬')}</span><div className="skill-checks">{eligiblePreferences.slice(0, 14).map(skillCheckbox)}</div></div>
          <div className="full"><span className="field-label">{t('Prerequisites', '선행 조건')}</span>{task.dependencies.map((item, index) => <div className="field-line grow" key={index}><input aria-label={t('Prerequisite', '선행 항목')} value={item.name} onChange={(e) => change({ dependencies: task.dependencies.map((row, i) => i === index ? { ...row, name: e.target.value } : row) })} /><input type="datetime-local" aria-label={t('Ready at', '준비 시각')} value={dateInput(item.available)} onChange={(e) => change({ dependencies: task.dependencies.map((row, i) => i === index ? { ...row, available: fromInput(e.target.value) } : row) })} /><button className="icon-button" type="button" aria-label={t('Remove prerequisite', '선행 조건 삭제')} onClick={() => change({ dependencies: task.dependencies.filter((_, i) => i !== index) })}><Trash2 size={15} /></button></div>)}<button className="text-button" type="button" onClick={() => change({ dependencies: [...task.dependencies, { name: '', available: null }] })}><Plus size={13} />{t('Add prerequisite', '선행 조건 추가')}</button></div>
          {task.assumptions.length > 0 && <div className="full"><span className="field-label">{t('Assumptions to verify', '확인할 가정')}</span><ul className="plain-list">{task.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
          {task.raw && <div className="full"><span className="field-label">{t('Original request', '원본 요청')}</span><p className="quote">{task.raw}</p></div>}
        </div>
      </Disclosure>

      {submitted && errors.length > 0 && <Notice tone="red"><ul>{errors.map((id) => <li key={id}>{issueText(id, t)}</li>)}</ul></Notice>}
      <div className="sheet-foot">
        <label className="confirm-box"><input type="checkbox" checked={task.confirmed} onChange={(e) => change({ confirmed: e.target.checked })} />{t('I’ve reviewed these details', '세부 정보를 확인했습니다')}</label>
        <div className="actions"><button className="btn ghost" type="button" onClick={onBack}>{t('Back', '이전')}</button><button className="btn primary lg" type="submit">{t('Find the best fit', '최적 담당자 찾기')}<ChevronRight size={16} /></button></div>
      </div>
    </form>
  </section>
}

export const sampleLoaded = (raw: string) => raw === exampleRequest('en') || raw === exampleRequest('ko')

// Shows where the draft came from (live LLM or deterministic fallback), the AI's role boundary, and the calibrated effort hint.
export function IntakeBanner({ meta, t, lang, retrying, onRetry, onUseCalibrated, calibratedApplied }: {
  meta: ExtractResponse; t: Translate; lang: Language; retrying: boolean; onRetry: () => void; onUseCalibrated: () => void; calibratedApplied: boolean
}) {
  const live = meta.mode === 'live'
  const provider = ({ groq: 'Groq', gemini: 'Gemini', openai: 'OpenAI' } as Record<string, string>)[meta.provider] || meta.provider
  const cal = meta.calibration
  const drift = cal.calibratedMinutes !== null && cal.rawMaxMinutes !== null && cal.calibratedMinutes !== cal.rawMaxMinutes
  return <section className={'intake-banner ' + (live ? 'is-live' : 'is-fallback')} role="status">
    <div className="ib-row">
      <span className={'card-icon ' + (live ? 'tone-violet' : 'tone-gap')}>{live ? <Cpu size={16} /> : <ShieldCheck size={16} />}</span>
      <div className="ib-text">
        <strong>{live ? t('Drafted live by ' + provider, provider + '가 실시간으로 초안 작성') + (meta.model ? ' · ' + meta.model : '') : t('AI unavailable — drafted by the rule-based parser', 'AI 사용 불가 · 규칙 기반 파서로 초안 작성')}</strong>
        <span>{live ? meta.draft.summary : (meta.fallbackReason || '') + t('. Review the fields, then continue — comparison works the same.', '. 항목을 검토한 뒤 계속하세요. 비교 기능은 동일하게 동작합니다.')}</span>
      </div>
      {!live && <button className="btn secondary slim" onClick={onRetry} disabled={retrying}><RefreshCw size={14} className={retrying ? 'spin' : ''} />{retrying ? t('Retrying…', '재시도 중…') : t('Retry live AI', '실시간 AI 재시도')}</button>}
    </div>
    <div className="ib-chips">
      <span className="ib-chip"><ScanText size={12} />{t('AI role: task extraction only', 'AI 역할: 업무 정보 추출만')}</span>
      <span className="ib-chip"><ShieldCheck size={12} />{t('Availability & ranking: deterministic rules', '가용 시간·순위: 결정적 규칙')}</span>
      {live && meta.latencyMs > 0 && <span className="ib-chip muted">{(meta.latencyMs / 1000).toFixed(1)}s</span>}
    </div>
    {cal.rawMaxMinutes !== null && <div className={'ib-cal' + (drift && !calibratedApplied ? ' drift' : '')}>
      <Gauge size={15} />
      <span><b>{t('Effort', '예상 시간')} {minutes(cal.rawMaxMinutes, lang)}</b>{drift && <> → <b>{minutes(cal.calibratedMinutes!, lang)}</b></>} · {cal.calibrationNote}</span>
      {drift && (calibratedApplied ? <Label tone="green"><Check size={11} />{t('Applied', '적용됨')}</Label> : <button className="btn ghost slim" onClick={onUseCalibrated}>{t('Use calibrated', '보정값 사용')}</button>)}
    </div>}
  </section>
}
