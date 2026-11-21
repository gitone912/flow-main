import { Bot, Clock3, Coffee, EyeOff, FileSearch, Landmark, ShieldCheck, UserCheck } from 'lucide-react'
import { PanelTitle, type Translate } from './ui'

// How Flow's design lines up with Korean law. A design summary, not legal advice: each row names the
// rule and the concrete product behaviour that answers it.
export function KoreanLaw({ t }: { t: Translate }) {
  const rows = [
    { icon: Clock3, law: t('Labor Standards Act · Art. 50 & 53', '근로기준법 제50조·제53조'), rule: t('40-hour week + up to 12h overtime = 52h cap', '주 40시간 + 연장근로 1주 12시간 한도 = 주 52시간'), flow: t('The scheduler books inside regular hours, and every candidate shows this week’s hours against the 40h and 52h lines. It never fills a plan with overtime.', '스케줄러는 정규 근무 시간 안에서만 예약하고, 모든 후보에 이번 주 근무 시간을 40h·52h 기준선과 함께 보여줍니다. 초과 근무로 계획을 채우지 않습니다.') },
    { icon: Coffee, law: t('Labor Standards Act · Art. 54', '근로기준법 제54조'), rule: t('Breaks: 30 min per 4h, 1h per 8h of work', '휴게: 4시간에 30분, 8시간에 1시간 이상'), flow: t('Breaks and reserve time are protected blocks: work is never scheduled into them.', '휴식과 예비 시간은 보호 블록으로, 업무를 그 안에 예약하지 않습니다.') },
    { icon: UserCheck, law: t('PIPA · Art. 37-2 (since 15 Mar 2024)', '개인정보 보호법 제37조의2 (2024.3.15 시행)'), rule: t('Right to refuse fully automated decisions and to ask for an explanation', '완전히 자동화된 결정에 대한 거부권과 설명 요구권'), flow: t('No assignment is fully automated: a lead approves every one, the reason and score are shown to the employee, and the employee can request a review.', '완전 자동 결정은 없습니다. 모든 배정은 리드가 승인하고, 배정 이유와 점수를 팀원에게 보여주며, 팀원은 검토를 요청할 수 있습니다.') },
    { icon: FileSearch, law: t('PIPA · Art. 3, 35 & 36', '개인정보 보호법 제3조·제35조·제36조'), rule: t('Minimum collection, purpose limitation, right to access and correct', '최소 수집·목적 제한, 열람·정정권'), flow: t('Only scheduling data is used, only for workload balance. “My data” lists every item, its purpose and source; people correct it themselves and can export it.', '일정 데이터만, 업무 분배 목적으로만 사용합니다. “내 데이터”에서 모든 항목·목적·출처를 보고 직접 정정하고 내려받을 수 있습니다.') },
    { icon: Bot, law: t('AI Basic Act (in force 22 Jan 2026)', '인공지능 기본법 (2026.1.22 시행)'), rule: t('Human oversight, explanation and user protection for high-impact AI', '고영향 AI의 사람 개입·설명·이용자 보호'), flow: t('AI only drafts and explains; ranking is deterministic rules and the final decision is a person’s. AI output is labelled, and only metadata of AI calls is logged.', 'AI는 초안 작성과 설명만 합니다. 순위는 결정적 규칙이, 최종 결정은 사람이 합니다. AI 결과는 표시되고, AI 호출은 메타데이터만 기록합니다.') },
    { icon: EyeOff, law: t('Workers’ Participation Act · Art. 20(1)14', '근로자참여법 제20조 제1항 제14호'), rule: t('Worker-monitoring equipment needs labor–management consultation', '근로자 감시 설비 설치는 노사협의회 협의 사항'), flow: t('Flow does no activity monitoring: no keystrokes, screen time or location. It reads calendars and skills that people can see and correct.', 'Flow는 활동 감시를 하지 않습니다. 키 입력·화면 시간·위치를 수집하지 않고, 본인이 보고 고칠 수 있는 일정과 스킬만 씁니다.') },
  ]
  return <section className="panel korean-law" id="about-law">
    <PanelTitle icon={Landmark} title={t('Built for Korean law', '한국 법을 지키는 설계')} subtitle={t('Each rule, and the product behaviour that answers it', '법 조항과, 그에 답하는 Flow의 동작')} />
    <div className="panel-body">
      <ol className="law-grid">{rows.map(({ icon: Icon, law, rule, flow }) => <li key={law} className="law-card">
        <span className="law-icon"><Icon size={17} aria-hidden="true" /></span>
        <div><strong className="law-name">{law}</strong><p className="law-rule">{rule}</p><p className="law-flow"><ShieldCheck size={13} aria-hidden="true" />{flow}</p></div>
      </li>)}</ol>
      <p className="law-note">{t('A summary of design principles, not legal advice. Teams adopting Flow should confirm their own obligations (for example labor–management consultation and the latest enforcement decrees) with HR and legal counsel.', '설계 원칙 요약이며 법률 자문이 아닙니다. 도입하는 조직은 노사협의, 최신 시행령 등 자체 의무를 노무·법률 담당자와 확인해야 합니다.')}</p>
    </div>
  </section>
}
