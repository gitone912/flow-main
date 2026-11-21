import type { Task } from './domain'

// Synthetic record of finished work: what was estimated at intake vs. what the booked blocks actually took.
// In production these rows come from closed issues (Jira/Linear) joined with the time their calendar blocks used.
export type PastTask = { id: string; title: string; titleKo: string; skills: string[]; estimate: number; actual: number; daysAgo: number }

export const pastTasks: PastTask[] = [
  { id: 'p1', title: 'Fix table sort regression', titleKo: '표 정렬 회귀 오류 수정', skills: ['react', 'typescript'], estimate: 180, actual: 195, daysAgo: 6 },
  { id: 'p2', title: 'Checkout form validation', titleKo: '결제 폼 검증 수정', skills: ['react', 'typescript', 'qa'], estimate: 240, actual: 260, daysAgo: 13 },
  { id: 'p3', title: 'Date picker timezone bug', titleKo: '날짜 선택기 시간대 오류', skills: ['react', 'javascript'], estimate: 120, actual: 140, daysAgo: 19 },
  { id: 'p4', title: 'Report filter state sync', titleKo: '리포트 필터 상태 동기화', skills: ['react', 'typescript'], estimate: 240, actual: 250, daysAgo: 27 },
  { id: 'p5', title: 'Dashboard chart refactor', titleKo: '대시보드 차트 리팩터링', skills: ['typescript', 'react'], estimate: 300, actual: 320, daysAgo: 34 },
  { id: 'p6', title: 'Login redirect hotfix', titleKo: '로그인 리디렉션 긴급 수정', skills: ['typescript', 'nextjs'], estimate: 90, actual: 95, daysAgo: 41 },
  { id: 'p7', title: 'Orders API pagination', titleKo: '주문 API 페이지네이션', skills: ['api', 'nodejs', 'postgresql'], estimate: 240, actual: 300, daysAgo: 9 },
  { id: 'p8', title: 'Slow query on invoices', titleKo: '청구서 느린 쿼리 개선', skills: ['sql', 'postgresql'], estimate: 120, actual: 165, daysAgo: 16 },
  { id: 'p9', title: 'Webhook retry handler', titleKo: '웹훅 재시도 처리', skills: ['api', 'nodejs'], estimate: 180, actual: 210, daysAgo: 30 },
  { id: 'p10', title: 'Staging deploy pipeline fix', titleKo: '스테이징 배포 파이프라인 수정', skills: ['devops', 'cicd', 'docker'], estimate: 120, actual: 110, daysAgo: 8 },
  { id: 'p11', title: 'Alert noise cleanup', titleKo: '알림 노이즈 정리', skills: ['observability', 'incident'], estimate: 180, actual: 170, daysAgo: 22 },
  { id: 'p12', title: 'Container memory limits', titleKo: '컨테이너 메모리 제한 조정', skills: ['kubernetes', 'docker'], estimate: 150, actual: 160, daysAgo: 37 },
  { id: 'p13', title: 'Churn model feature fix', titleKo: '이탈 모델 피처 수정', skills: ['python', 'ml', 'data'], estimate: 240, actual: 330, daysAgo: 11 },
  { id: 'p14', title: 'Nightly ETL failure', titleKo: '야간 ETL 실패 대응', skills: ['airflow', 'dbt', 'sql'], estimate: 120, actual: 150, daysAgo: 25 },
  { id: 'p15', title: 'Month-end reconciliation', titleKo: '월말 대사 작업', skills: ['reconciliation', 'excel', 'accounting'], estimate: 240, actual: 255, daysAgo: 20 },
  { id: 'p16', title: 'Budget variance report', titleKo: '예산 차이 리포트', skills: ['budgeting', 'excel', 'forecasting'], estimate: 180, actual: 175, daysAgo: 33 },
  { id: 'p17', title: 'Campaign landing tracking', titleKo: '캠페인 랜딩 추적 설정', skills: ['ga4', 'gtm'], estimate: 90, actual: 120, daysAgo: 14 },
  { id: 'p18', title: 'Onboarding checklist update', titleKo: '입사 체크리스트 개선', skills: ['onboarding', 'hris'], estimate: 120, actual: 125, daysAgo: 29 },
]

export const MIN_SAMPLES = 3
const round15 = (value: number) => Math.round(value / 15) * 15

export type Calibration = {
  matches: PastTask[]; ratio: number; suggested: number; withinTen: number; enough: boolean
}

// Rule-based check on the AI (or human) effort estimate: similar finished work tells us how optimistic intake usually is.
export function calibrate(task: Task): Calibration | null {
  if (!task.max) return null
  const wanted = new Set([...task.required.map(({ id }) => id), ...task.preferred])
  if (!wanted.size) return null
  const matches = pastTasks.filter((item) => item.skills.some((skill) => wanted.has(skill)))
  const estimate = matches.reduce((sum, item) => sum + item.estimate, 0)
  const actual = matches.reduce((sum, item) => sum + item.actual, 0)
  const ratio = estimate ? actual / estimate : 1
  return {
    matches, ratio, suggested: Math.max(15, round15(task.max * ratio)),
    withinTen: matches.filter((item) => Math.abs(item.actual - item.estimate) <= item.estimate * .1).length,
    enough: matches.length >= MIN_SAMPLES,
  }
}
