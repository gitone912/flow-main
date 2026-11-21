import { useState } from 'react'
import { FileInput, RotateCcw } from 'lucide-react'
import { dateInput, fromInput, span, type Policy, type Workspace } from './domain'
import type { Health } from './api'
import { policyIssues } from './scheduler'
import { type AiMode } from './Compare'
import { Field, Label, Notice, PrivacyNote, Select, type Translate } from './ui'

const toClock = (n: number) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')
const parseClock = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m }
export function Settings({ workspace, health, llmFail, setLlmFail, t, savePolicy, check, onImport, onReset, aiMode, setAiMode }: {
  workspace: Workspace; health: Health | null; llmFail: boolean; setLlmFail: (on: boolean) => void; t: Translate; savePolicy: (policy: Policy, now: number) => void;
  check: () => void; onImport: () => void; onReset: () => void; aiMode: AiMode; setAiMode: (mode: AiMode) => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false)
  const old = workspace.policy
  const [daily, setDaily] = useState(old.daily?.toString() || '')
  const [weekly, setWeekly] = useState(old.weekly?.toString() || '')
  const [overload, setOverload] = useState(old.overload ? String(Math.round(old.overload * 100)) : '')
  const [breaks, setBreaks] = useState(old.breaks?.[0] ? [toClock(old.breaks[0].start), toClock(old.breaks[0].end)] : ['', ''])
  const [reserve, setReserve] = useState(old.reserve?.[0] ? [toClock(old.reserve[0].start), toClock(old.reserve[0].end)] : ['', ''])
  const [reserveDay, setReserveDay] = useState(old.reserveDay)
  const [clock, setClock] = useState(dateInput(workspace.now))
  const [error, setError] = useState(false)
  function interval(value: string[], extra: { start: number; end: number }[]) {
    if (!value[0] && !value[1]) return extra
    if (!value[0] || !value[1]) return null
    return [span(parseClock(value[0]), parseClock(value[1])), ...extra]
  }
  return <div className="stack">
    <div className="actions"><button className="btn secondary slim" onClick={onImport}><FileInput size={15} />{t('Import team CSV', '팀 CSV 가져오기')}</button></div>
    <section className="settings-section"><h3>{t('LLM API', 'LLM API')}</h3><p>{t('Task extraction is the only live backend call (POST /api/intake/extract), and API keys stay on the server. Every other endpoint is a static MVP stub; scheduling runs in the browser with deterministic rules.', '업무 정보 추출(POST /api/intake/extract)만 실제 백엔드를 호출하며 API 키는 서버에만 보관됩니다. 나머지 엔드포인트는 정적 MVP 스텁이고, 일정 계산은 브라우저의 결정적 규칙으로 실행됩니다.')}</p>
      <div className="field-line"><span className={'api-pill ' + (!health ? 'tone-risk' : health.llmConfigured && !llmFail ? 'tone-focus' : 'tone-gap')}><span className={'live-dot' + (health ? '' : ' off')} />{!health ? t('API offline · browser parser', 'API 오프라인 · 브라우저 파서') : health.llmConfigured && !llmFail ? t('LLM API: Live', 'LLM API: 연결됨') + ' (' + health.llmProvider + (health.llmModel ? ' · ' + health.llmModel : '') + ')' : t('LLM API: Fallback mode', 'LLM API: 대체 모드')}</span><button className="btn secondary slim" onClick={check}>{t('Check connection', '연결 확인')}</button></div>
      {health && !health.llmConfigured && <p className="muted">{t('No provider key is configured on the server. Set GROQ_API_KEY (or GEMINI_API_KEY / OPENAI_API_KEY) in .env and restart. Drafts use the deterministic parser meanwhile.', '서버에 LLM 키가 없습니다. .env에 GROQ_API_KEY(또는 GEMINI_API_KEY / OPENAI_API_KEY)를 설정하고 다시 시작하세요. 그동안 결정적 파서를 사용합니다.')}</p>}
      {health && <p className="muted">{t('Live', '실시간')}: {health.endpoints.live.join(', ')} · {t('Static stubs', '정적 스텁')}: {health.endpoints.staticStub.length}</p>}
      <label className="check-line"><input type="checkbox" checked={llmFail} onChange={(event) => setLlmFail(event.target.checked)} /><span><strong>{t('Simulate LLM failure', 'LLM 실패 시뮬레이션')}</strong> · {t('Sends simulateFailure: true so you can show the fallback draft and “Retry live AI”.', 'simulateFailure: true를 보내 대체 초안과 실시간 AI 재시도를 시연합니다.')}</span></label>
    </section>
    <section className="settings-section"><h3>{t('Demo controls', '데모 제어')}</h3><p>{t('Simulate how the comparison behaves when AI analysis is slow or fails. The rule-based ranking always runs underneath.', 'AI 분석이 느리거나 실패할 때의 동작을 시뮬레이션합니다. 규칙 기반 순위는 항상 함께 실행됩니다.')}</p>
      <div className="segmented" role="group" aria-label={t('AI analysis simulation', 'AI 분석 시뮬레이션')}>{([['off', t('Normal', '정상')], ['delay', t('Slow', '지연')], ['fail', t('Fail once', '1회 실패')]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={aiMode === id} onClick={() => setAiMode(id)}>{label}</button>)}</div>
    </section>
    <form className="settings-section stack" onSubmit={(event) => {
      event.preventDefault()
      const next = { ...old, daily: Number(daily), weekly: Number(weekly), overload: Number(overload) / 100, breaks: interval(breaks, old.breaks?.slice(1) || []), reserve: interval(reserve, old.reserve?.slice(1) || []), reserveDay }
      const now = fromInput(clock)
      setError(!!policyIssues(next).length || now === null)
      if (!policyIssues(next).length && now !== null) savePolicy(next, now)
    }}>
      <h3>{t('Company policy', '회사 정책')} <Label tone="peach">{t('Demo settings', '데모 설정')}</Label></h3>
      <Field label={t('Workspace clock · Asia/Seoul', '워크스페이스 기준 시각 · Asia/Seoul')}><input type="datetime-local" required value={clock} onChange={(event) => setClock(event.target.value)} /></Field>
      <div className="form-grid">
        <Field label={t('Daily work limit · minutes', '일일 업무 한도 · 분')}><input type="number" min={1} max={1440} required value={daily} onChange={(event) => setDaily(event.target.value)} /></Field>
        <Field label={t('Weekly work limit · minutes', '주간 업무 한도 · 분')}><input type="number" min={1} max={10080} required value={weekly} onChange={(event) => setWeekly(event.target.value)} /></Field>
        <Field label={t('Daily break starts', '일일 휴식 시작')}><input type="time" value={breaks[0]} onChange={(event) => setBreaks([event.target.value, breaks[1]])} /></Field>
        <Field label={t('Daily break ends', '일일 휴식 종료')}><input type="time" value={breaks[1]} onChange={(event) => setBreaks([breaks[0], event.target.value])} /></Field>
        <Field label={t('Reserved capacity starts', '예비 시간 시작')}><input type="time" value={reserve[0]} onChange={(event) => setReserve([event.target.value, reserve[1]])} /></Field>
        <Field label={t('Reserved capacity ends', '예비 시간 종료')}><input type="time" value={reserve[1]} onChange={(event) => setReserve([reserve[0], event.target.value])} /></Field>
        <Field label={t('Reserve weekday', '예비 시간 요일')}><Select value={reserveDay} onChange={(event) => setReserveDay(Number(event.target.value))}>{[t('Sunday', '일요일'), t('Monday', '월요일'), t('Tuesday', '화요일'), t('Wednesday', '수요일'), t('Thursday', '목요일'), t('Friday', '금요일'), t('Saturday', '토요일')].map((day, i) => <option key={i} value={i}>{day}</option>)}</Select></Field>
        <Field label={t('Overload threshold · %', '과부하 기준 · %')}><input type="number" min={1} max={100} required value={overload} onChange={(event) => setOverload(event.target.value)} /></Field>
      </div>
      {error && <Notice tone="red">{t('Complete the policy fields. Each time range must end after it starts.', '정책 항목을 확인하세요. 종료 시각은 시작 이후여야 합니다.')}</Notice>}
      <div className="actions"><button className="btn primary" type="submit">{t('Save demo policy', '데모 정책 저장')}</button></div>
    </form>
    <section className="settings-section"><h3>{t('Reset demo workspace', '데모 워크스페이스 초기화')}</h3>
      <p>{t('Clears assignments, reviews, scans, imports, and policy edits in this browser and restores the seeded calendar.', '이 브라우저의 배정, 검토, 스캔, 가져오기, 정책 변경을 지우고 기본 캘린더로 되돌립니다.')}</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>{confirmReset
        ? <><button className="btn danger-solid slim" onClick={onReset}><RotateCcw size={14} />{t('Yes, reset everything', '모두 초기화')}</button><button className="btn secondary slim" onClick={() => setConfirmReset(false)}>{t('Cancel', '취소')}</button></>
        : <button className="btn secondary slim danger" onClick={() => setConfirmReset(true)}><RotateCcw size={14} />{t('Reset workspace', '워크스페이스 초기화')}</button>}</div>
    </section>
    <PrivacyNote t={t} />
  </div>
}
