import { Scale } from 'lucide-react'
import { type Employee, type Language, type Workspace } from './domain'
import { workload } from './scheduler'
import { type Translate } from './ui'

// Korean Labor Standards Act: 40h regular + up to 12h extended work = 52h per week (주 52시간 근무제).
export const REGULAR_WEEK = 40 * 60
export const LEGAL_WEEK = 52 * 60
const SCALE = 56 * 60

export function weekHours(person: Employee, workspace: Workspace, add = 0) {
  const { used } = workload(person, workspace)
  const total = used + add
  const status = total > LEGAL_WEEK ? 'over' : total > REGULAR_WEEK ? 'extended' : 'regular'
  return { used, total, status } as const
}

const h = (value: number) => (Math.round(value / 6) / 10).toString()

// A compact weekly-hours meter with the 40h and 52h lines, so every assignment is visibly inside the legal limit.
export function WeekHours({ person, workspace, add = 0, t, compact = false }: { person: Employee; workspace: Workspace; add?: number; t: Translate; lang?: Language; compact?: boolean }) {
  const { used, total, status } = weekHours(person, workspace, add)
  const label = status === 'over' ? t('Over the 52h legal limit', '주 52시간 법정 한도 초과')
    : status === 'extended' ? t('Extended hours · ' + h(total - REGULAR_WEEK) + 'h of 12h', '연장 근무 ' + h(total - REGULAR_WEEK) + '시간 · 한도 12시간')
      : t('Within regular 40h', '정규 40시간 이내')
  return <div className={'week-hours ' + status + (compact ? ' compact' : '')} title={t('Korean 52-hour workweek: 40h regular + 12h extended', '주 52시간 근무제: 정규 40시간 + 연장 12시간')}>
    <div className="wh-head"><Scale size={12} aria-hidden="true" /><span>{t('This week', '이번 주 근무')}</span><b className="tabular">{h(total)}h</b><em>/ 52h</em></div>
    <div className="wh-track" role="meter" aria-valuemin={0} aria-valuemax={52} aria-valuenow={Number(h(total))} aria-label={t('Weekly hours', '주간 근무 시간')}>
      <span className="wh-used" style={{ width: Math.min(100, used / SCALE * 100) + '%' }} />
      {add > 0 && <span className="wh-add" style={{ left: Math.min(100, used / SCALE * 100) + '%', width: Math.max(0, Math.min(100, total / SCALE * 100) - used / SCALE * 100) + '%' }} />}
      <i className="wh-mark regular" style={{ left: REGULAR_WEEK / SCALE * 100 + '%' }} />
      <i className="wh-mark legal" style={{ left: LEGAL_WEEK / SCALE * 100 + '%' }} />
    </div>
    {!compact && <small>{label}{add > 0 ? t(' · includes this task', ' · 이 과제 포함') : ''}</small>}
  </div>
}
