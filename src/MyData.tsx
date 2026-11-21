import { Database, Download, EyeOff, PencilLine } from 'lucide-react'
import { DAY, skillLabel, type Employee, type Language, type Workspace } from './domain'
import { effectivePerson } from './scheduler'
import { Label, PanelTitle, type Translate } from './ui'

const clock = (value: number) => String(Math.floor(value / 60) % 24).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0')

// "Your data": everything Flow holds about one employee, what it is used for, and how to correct or export it.
export function MyData({ person: base, workspace, lang, t, onCorrect }: { person: Employee; workspace: Workspace; lang: Language; t: Translate; onCorrect: () => void }) {
  const person = effectivePerson(base, workspace)
  const edited = workspace.verifications?.[base.id] || {}
  const days = lang === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hours = Object.entries(person.hours).filter(([, windows]) => windows.length)
    .map(([day, windows]) => days[Number(day)] + ' ' + windows.map((w) => clock(w.start) + '–' + (w.end === DAY ? '24:00' : clock(w.end))).join(', '))
  const skills = Object.entries(person.skills).filter(([, level]) => level).sort((a, b) => (b[1] || 0) - (a[1] || 0))
  const access = Object.entries(person.access).map(([id, value]) => skillLabel(id, lang) + ' · ' + (value === 'unknown' ? t('needs verification', '확인 필요') : value.length ? t('verified', '확인됨') : t('none', '없음')))
  const recentUrgent = (person.urgent || []).filter((at) => at > workspace.now - 30 * DAY).length
  const blocks = workspace.blocks.filter((block) => block.employeeId === base.id)
  const assignments = workspace.assignments.filter((record) => record.employeeId === base.id)
  const notSet = t('Not recorded', '기록 없음')

  const rows: { label: string; value: string; use: string; source: 'csv' | 'synthetic' | 'you' }[] = [
    { label: t('Name, team, job title', '이름, 팀, 직무'), value: [lang === 'ko' ? person.korean : person.name, person.source?.department, person.source?.title].filter(Boolean).join(' · '), use: t('Shown to your lead and team', '리드와 팀에 표시'), source: 'csv' },
    { label: t('Employment and shift', '고용 형태 및 근무조'), value: [person.source?.employment, person.source?.shift, person.status].filter(Boolean).join(' · ') || notSet, use: t('Inactive people are never assigned', '비재직자는 배정되지 않음'), source: 'csv' },
    { label: t('Skills', '스킬'), value: skills.length ? skills.map(([id, level]) => skillLabel(id, lang) + ' ' + level).join(', ') : notSet, use: t('Matching required skills', '필수 스킬 매칭'), source: edited.skills ? 'you' : 'synthetic' },
    { label: t('Working window', '근무 시간'), value: hours.join(' · ') || notSet, use: t('Where work blocks may go', '작업 블록 배치 범위'), source: edited.hours ? 'you' : 'synthetic' },
    { label: t('System access', '시스템 접근 권한'), value: access.join(', ') || notSet, use: t('Eligibility check only', '자격 확인에만 사용'), source: edited.access ? 'you' : 'synthetic' },
    { label: t('Comparable past work', '유사 업무 경험'), value: person.experience ? t(person.experience.filter((item) => item.verified).length + ' verified items', '확인된 항목 ' + person.experience.filter((item) => item.verified).length + '건') : notSet, use: t('Experience factor (15 of 100)', '경험 요소 (100점 중 15점)'), source: 'synthetic' },
    { label: t('Urgent work, last 30 days', '최근 30일 긴급 업무'), value: person.urgent ? t(recentUrgent + ' assignments', recentUrgent + '건') : notSet, use: t('Fair rotation — fewer goes first', '공정 순환 — 적은 사람이 먼저'), source: 'synthetic' },
    { label: t('Calendar and assignments', '캘린더 및 배정'), value: t(blocks.length + ' blocks · ' + assignments.length + ' assignments', '일정 ' + blocks.length + '건 · 배정 ' + assignments.length + '건'), use: t('Free time and workload limits', '여유 시간 및 업무량 한도'), source: 'synthetic' },
  ]
  const sourceLabel = { csv: t('Roster CSV', '명단 CSV'), synthetic: t('Synthetic', '합성'), you: t('Edited by you', '본인 수정') }

  function download() {
    const data = { exportedAt: new Date().toISOString(), note: 'Synthetic demo record held in this browser by Flow.', person, verifications: workspace.verifications?.[base.id] || null, blocks, assignments }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: 'flow-my-data-' + base.id + '.json' })
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className="panel my-data"><PanelTitle icon={Database} title={t('Your data', '내 데이터')} subtitle={t('Everything Flow holds about you, and what it is used for', 'Flow가 보유한 내 정보와 사용 목적')}
    actions={<><button className="btn secondary slim" onClick={onCorrect}><PencilLine size={14} />{t('Correct', '정정')}</button><button className="btn secondary slim" onClick={download}><Download size={14} />{t('Download JSON', 'JSON 다운로드')}</button></>} />
    <div className="panel-body stack">
      <div className="my-data-table" role="table" aria-label={t('Your data', '내 데이터')}>
        <div className="my-data-row head" role="row"><span role="columnheader">{t('Data', '항목')}</span><span role="columnheader">{t('Value', '값')}</span><span role="columnheader">{t('Used for', '사용 목적')}</span><span role="columnheader">{t('Source', '출처')}</span></div>
        {rows.map((row) => <div className="my-data-row" role="row" key={row.label}><strong role="cell">{row.label}</strong><span role="cell">{row.value}</span><span role="cell" className="muted">{row.use}</span><span role="cell"><Label tone={row.source === 'you' ? 'green' : row.source === 'csv' ? 'neutral' : 'violet'}>{sourceLabel[row.source]}</Label></span></div>)}
      </div>
      <div className="my-data-never"><EyeOff size={15} aria-hidden="true" /><p>{t('None of this is sent to the AI model, and Flow never uses it for performance reviews, activity monitoring, or health and stress inference. It stays in this workspace and is never shared outside it.', '이 정보는 AI 모델로 전송되지 않으며, 성과 평가, 활동 감시, 건강·스트레스 추정에 사용되지 않습니다. 이 워크스페이스 밖으로 공유되지 않습니다.')}</p></div>
    </div>
  </section>
}
