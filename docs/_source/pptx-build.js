// Builds Flow_발표자료.pptx: 17 Korean slides, real screenshots, native shapes, speaker notes.
const path = require('path')
const fs = require('fs')
const pptxgen = require('pptxgenjs')
const { applyTheme } = require('./apply_theme.js')

const OUT = process.argv[2]
const SHOTS = process.argv[3]
const img = (name) => path.join(SHOTS, name + '.png')

const THEME = {
  name: 'Flow',
  headFontFace: 'Malgun Gothic',
  bodyFontFace: 'Malgun Gothic',
  colors: {
    dk1: '17122B', lt1: 'FFFFFF', dk2: '1D1233', lt2: 'F4F3F9',
    accent1: '4655D4', accent2: 'B9ADFF', accent3: '0F8A6B', accent4: 'C27C06', accent5: 'DC4C55', accent6: '6E6A85',
    hlink: '4655D4', folHlink: '6E6A85',
  },
}
// Hex-only options (lines, shadows) read from THEME so they stay in step with it.
const HEX = { line: 'E2DFEE', lineAccent: 'B8BEF3', body: '4A4760', muted: '6E6A85', onDark2: 'C9C1EA', deep: '1D1233', accent: '4655D4', lilac: 'B9ADFF', green: '0F8A6B', soft: 'E9EBFC', card: 'FBFAFE', panel: '2A1D52', pillLine: '4A3A80', greenSoft: 'DFF3EC' }

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.333 x 7.5 in
pres.title = 'Flow 소개 발표'
pres.author = 'Flow'
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
const C = pres.SchemeColor
const W = 13.333, H = 7.5, M = 0.6

const shadow = () => ({ type: 'outer', color: '1D1233', opacity: 0.12, blur: 10, offset: 3, angle: 90 })

// ---------- Layouts ----------
const num = { x: W - 1.1, y: H - 0.5, w: 0.6, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' }
pres.defineSlideMaster({
  title: 'COVER_DARK', background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'eyebrow', type: 'body', x: M, y: 1.75, w: 6.2, h: 0.4, fontSize: 13, bold: true, color: C.accent2, margin: 0, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.2, w: 6.2, h: 1.9, fontSize: 40, bold: true, color: C.background1, valign: 'top', margin: 0, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M, y: 3.75, w: 6.0, h: 1.0, fontSize: 17, color: C.background2, valign: 'top', margin: 0, align: 'left' }, text: '' } },
  ],
})
pres.defineSlideMaster({
  title: 'CLOSE_DARK', background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'eyebrow', type: 'body', x: M + 0.3, y: 1.6, w: 9, h: 0.4, fontSize: 13, bold: true, color: C.accent2, margin: 0, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: M + 0.3, y: 2.05, w: 11, h: 2.0, fontSize: 48, bold: true, color: C.background1, valign: 'top', margin: 0, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M + 0.3, y: 4.2, w: 11, h: 0.6, fontSize: 18, color: C.background2, margin: 0, align: 'left' }, text: '' } },
  ],
})
const contentLayout = (title, bg) => pres.defineSlideMaster({
  title, background: { color: bg },
  objects: [
    { placeholder: { options: { name: 'eyebrow', type: 'body', x: M, y: 0.5, w: 10, h: 0.35, fontSize: 12, bold: true, color: C.accent1, margin: 0, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.88, w: 12.1, h: 0.75, fontSize: 30, bold: true, color: C.text1, valign: 'top', margin: 0, align: 'left' }, text: '' } },
  ],
  slideNumber: num,
})
contentLayout('CONTENT', C.background1)
contentLayout('CONTENT_TINT', C.background2)
const shotLayout = (title, bg) => pres.defineSlideMaster({
  title, background: { color: bg },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 1.95, w: 3.85, h: 1.35, fontSize: 26, bold: true, color: C.text1, valign: 'top', margin: 0, align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M, y: 3.4, w: 3.85, h: 3.2, fontSize: 14, color: C.text1, valign: 'top', margin: 0, align: 'left' }, text: '' } },
  ],
  slideNumber: num,
})
shotLayout('SHOT', C.background1)
shotLayout('SHOT_TINT', C.background2)

// ---------- Helpers ----------
const text = (slide, t, o) => slide.addText(t, { isTextBox: true, margin: 0, fontFace: undefined, ...o })
const card = (slide, x, y, w, h, o = {}) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x, y, w, h, rectRadius: 0.12, fill: { color: o.fill || C.background1 }, line: { color: o.line || HEX.line, width: 1 }, shadow: o.shadow === false ? undefined : shadow(), objectName: o.name,
})
const pill = (slide, x, y, label, o = {}) => {
  const w = o.w || 0.3 + label.length * 0.17
  slide.addText(label, { isTextBox: true, x, y, w, h: 0.36, shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.18, fill: { color: o.fill || HEX.soft }, color: o.color || C.accent1, fontSize: 12, bold: true, align: 'center', valign: 'middle', margin: 0, objectName: o.name })
  return w
}
const hline = (slide, x1, y, x2, color, o = {}) => slide.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y, w: Math.abs(x2 - x1), h: 0, flipH: x2 < x1, line: { color, width: o.width || 2, dashType: o.dash, endArrowType: o.arrow ? 'triangle' : undefined } })
const vline = (slide, x, y1, y2, color, o = {}) => slide.addShape(pres.shapes.LINE, { x, y: Math.min(y1, y2), w: 0, h: Math.abs(y2 - y1), flipV: y2 < y1, line: { color, width: o.width || 2, dashType: o.dash, endArrowType: o.arrow ? 'triangle' : undefined } })

// Screenshot slide: tag pill, title, paragraph + 3 bullets on the left; framed screenshot on the right.
function shotSlide({ layout, section, tag, tagNew, title, lead, bullets, image, alt, notes }) {
  const s = pres.addSlide({ masterName: layout, sectionTitle: section })
  pill(s, M, 1.45, tag, tagNew ? { fill: HEX.greenSoft, color: C.accent3, name: 'tag' } : { name: 'tag' })
  s.addText(title, { placeholder: 'title' })
  s.addText([
    { text: lead, options: { color: C.text1, paraSpaceAfter: 12, breakLine: true } },
    ...bullets.map((b, i) => ({ text: b, options: { bullet: { indent: 16 }, color: C.accent6, paraSpaceAfter: 6, breakLine: i < bullets.length - 1 ? true : undefined } })),
  ], { placeholder: 'body' })
  const fx = 4.85, fy = 1.1, fw = 7.9, fh = fw / 1.6 + 0.24
  card(s, fx, fy, fw, fh, { name: 'screenshot-frame' })
  s.addImage({ path: img(image), x: fx + 0.12, y: fy + 0.12, w: fw - 0.24, h: (fw - 0.24) / 1.6, altText: alt, objectName: 'screenshot' })
  s.addNotes(notes)
  return s
}

// ---------- 1 · Cover ----------
pres.addSection({ title: '문제와 접근' })
{
  const s = pres.addSlide({ masterName: 'COVER_DARK', sectionTitle: '문제와 접근' })
  s.addText('FLOW · 공정한 긴급 업무 배정 도우미', { placeholder: 'eyebrow' })
  s.addText('긴급 업무를,\n할 수 있는 사람에게', { placeholder: 'title' })
  s.addText('스킬, 실제 캘린더, 공정한 분배를 함께 보고 리드가 근거와 함께 결정합니다.', { placeholder: 'body' })

  // Relay motif: the three workflow lanes (lead · Flow · member) with the task handed along them
  const lx = 8.15, lw = 4.58, lh = 0.62, ly = [1.75, 2.62, 3.49]
  const lanes = [['팀 리드', 9.75, C.accent2], ['Flow', 10.75, C.accent1], ['팀원', 12.05, C.accent3]]
  lanes.forEach(([label, dotX, color], i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: lx, y: ly[i], w: lw, h: lh, rectRadius: lh / 2, fill: { color: HEX.panel }, line: { color: HEX.pillLine, width: 1 }, objectName: 'relay-lane-' + (i + 1) })
    text(s, label, { x: lx + 0.3, y: ly[i], w: 1.2, h: lh, fontSize: 12, color: C.background2, valign: 'middle', objectName: 'relay-label-' + (i + 1) })
    s.addShape(pres.shapes.OVAL, { x: dotX - 0.3, y: ly[i] + lh / 2 - 0.3, w: 0.6, h: 0.6, fill: { color, transparency: 75 }, line: { color, width: 0, transparency: 100 }, objectName: 'relay-glow-' + (i + 1) })
    s.addShape(pres.shapes.OVAL, { x: dotX - 0.15, y: ly[i] + lh / 2 - 0.15, w: 0.3, h: 0.3, fill: { color }, line: { color, width: 0 }, objectName: 'relay-dot-' + (i + 1) })
  })
  // hand-offs between lanes
  const hand = (x1, y1, x2, y2) => s.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: HEX.lilac, width: 1.5, dashType: 'dash', endArrowType: 'triangle' }, objectName: 'relay-handoff' })
  hand(9.95, ly[0] + lh / 2 + 0.12, 10.55, ly[1] + lh / 2 - 0.12)
  hand(10.95, ly[1] + lh / 2 + 0.12, 11.85, ly[2] + lh / 2 - 0.12)

  // Three facts a judge can take in at a glance
  const facts = [['1,000명', '직원 명단 연동'], ['주 52시간', '근무 한도 항상 준수'], ['6단계', '요청부터 기록까지']]
  facts.forEach(([n, label], i) => {
    const x = M + i * 2.55
    text(s, n, { x, y: 5.15, w: 2.4, h: 0.5, fontSize: 24, bold: true, color: C.background1, objectName: 'fact-' + (i + 1) })
    text(s, label, { x, y: 5.65, w: 2.4, h: 0.3, fontSize: 12, color: C.background2, objectName: 'fact-label-' + (i + 1) })
  })
  text(s, '2026년 11월 · 실제 작동 서비스 (합성 데모 데이터)', { x: lx, y: 5.6, w: lw, h: 0.35, fontSize: 12, color: C.background2, align: 'right', objectName: 'meta' })
  s.addNotes('Flow는 긴급 업무를 누구에게 맡길지 정하는 도구입니다. 오늘 보여드릴 화면은 모두 실제로 작동하는 앱에서 캡처했고, 데이터는 합성 데모 데이터입니다.')
}

// ---------- 2 · Problem ----------
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '문제와 접근' })
  s.addText('문제', { placeholder: 'eyebrow' })
  s.addText('긴급 업무는 늘 같은 사람에게 몰립니다', { placeholder: 'title' })
  const items = [
    ['01', '기억에 의존한 배정', '“이거 잘하는 사람”에게 다시 맡깁니다. 스킬이 확인된 다른 팀원은 보이지 않습니다.'],
    ['02', '캘린더는 나중에', '회의와 기존 업무로 조각난 일정 위에 4시간짜리 일이 얹힙니다. 마감 직전에야 알게 됩니다.'],
    ['03', '공정성은 기록되지 않음', '누가 최근 30일 동안 긴급 업무를 몇 건 맡았는지 아무도 모릅니다.'],
  ]
  const cw = (W - 2 * M - 2 * 0.35) / 3
  items.forEach(([n, h, b], i) => {
    const x = M + i * (cw + 0.35), y = 2.05
    card(s, x, y, cw, 3.4, { fill: HEX.card, name: 'problem-' + n })
    text(s, n, { x: x + 0.35, y: y + 0.35, w: 1.5, h: 0.8, fontSize: 40, bold: true, color: C.accent1 })
    text(s, h, { x: x + 0.35, y: y + 1.3, w: cw - 0.7, h: 0.5, fontSize: 19, bold: true, color: C.text1 })
    text(s, b, { x: x + 0.35, y: y + 1.85, w: cw - 0.7, h: 1.3, fontSize: 14, color: HEX.body, valign: 'top', lineSpacingMultiple: 1.25 })
  })
  // Stat callout from the demo data
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.85, w: W - 2 * M, h: 0.85, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: C.background2, width: 0 }, objectName: 'stat-band' })
  text(s, [{ text: '5건', options: { bold: true, color: C.accent5, fontSize: 22 } }, { text: '   한 명이 30일간 맡은 긴급 업무 (데모 데이터)      ', options: { color: HEX.body, fontSize: 14 } }, { text: '53 / 100', options: { bold: true, color: C.accent5, fontSize: 22 } }, { text: '   팀 공정성 지수', options: { color: HEX.body, fontSize: 14 } }], { x: M + 0.35, y: 5.85, w: W - 2 * M - 0.7, h: 0.85, valign: 'middle' })
  s.addNotes('세 가지 문제가 반복됩니다. 익숙한 사람에게 다시 맡기고, 캘린더는 확인하지 않고, 공정성은 아무도 기록하지 않습니다. 데모 데이터의 대시보드도 바로 이 상태를 보여줍니다. 한 명이 30일간 긴급 업무 5건, 공정성 지수 53입니다.')
}

// ---------- 3 · How ----------
{
  const s = pres.addSlide({ masterName: 'CONTENT_TINT', sectionTitle: '문제와 접근' })
  s.addText('Flow의 방식', { placeholder: 'eyebrow' })
  s.addText('요청 한 줄에서 근거 있는 배정까지, 3단계', { placeholder: 'title' })
  const steps = [
    ['1 · 요청', '메시지를 붙여넣기', '한국어나 영어 요청을 붙여넣으면 AI가 스킬, 마감, 예상 시간을 초안으로 만듭니다.'],
    ['2 · 비교', '후보를 나란히', '스케줄러가 실제 캘린더의 빈 시간, 주 52시간 한도, 최근 긴급 업무 수로 후보를 정렬합니다.'],
    ['3 · 승인', '리드가 결정', '리드가 승인하면 작업 블록이 캘린더에 예약되고 기록이 남습니다.'],
  ]
  const gap = 0.8, cw = (W - 2 * M - 2 * gap) / 3
  steps.forEach(([k, h, b], i) => {
    const x = M + i * (cw + gap), y = 2.0, hl = i === 2
    card(s, x, y, cw, 2.9, { fill: hl ? HEX.soft : C.background1, line: hl ? HEX.lineAccent : HEX.line, name: 'step-' + (i + 1) })
    text(s, k, { x: x + 0.35, y: y + 0.35, w: cw - 0.7, h: 0.35, fontSize: 13, bold: true, color: C.accent1 })
    text(s, h, { x: x + 0.35, y: y + 0.8, w: cw - 0.7, h: 0.5, fontSize: 20, bold: true, color: C.text1 })
    text(s, b, { x: x + 0.35, y: y + 1.4, w: cw - 0.7, h: 1.3, fontSize: 14, color: HEX.body, valign: 'top', lineSpacingMultiple: 1.25 })
    if (i < 2) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + cw + 0.17, y: y + 1.25, w: 0.46, h: 0.4, fill: { color: C.accent2 }, line: { color: C.accent2, width: 0 }, objectName: 'arrow-' + (i + 1) })
  })
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.35, w: W - 2 * M, h: 0.95, rectRadius: 0.14, fill: { color: C.text2 }, line: { color: C.text2, width: 0 }, objectName: 'principle' })
  text(s, 'AI는 초안을 쓰고 이유를 설명할 뿐, 결정하지 않습니다. 순위는 규칙 기반 스케줄러가 계산합니다.', { x: M + 0.45, y: 5.35, w: W - 2 * M - 0.9, h: 0.95, fontSize: 17, bold: true, color: C.background1, valign: 'middle' })
  s.addNotes('흐름은 세 단계입니다. 요청을 붙여넣고, 후보를 비교하고, 리드가 승인합니다. 중요한 원칙은 AI가 결정하지 않는다는 것입니다. AI는 초안 작성과 설명만 맡고, 순위는 투명한 규칙으로 계산됩니다.')
}

// ---------- 4 · Workflow swimlane ----------
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '문제와 접근' })
  s.addText('업무 흐름', { placeholder: 'eyebrow' })
  s.addText('요청부터 기록까지, 누가 무엇을 하는가', { placeholder: 'title' })
  const x0 = M, laneW = W - 2 * M, laneH = 1.5, gapL = 0.14, y0 = 1.95
  const lanes = [['팀 리드', '판단 · 결정', HEX.card], ['Flow', 'AI · 스케줄러', 'EEF0FD'], ['팀원', '확인 · 피드백', HEX.card]]
  const laneY = (i) => y0 + i * (laneH + gapL)
  lanes.forEach(([name, sub, fill], i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x0, y: laneY(i), w: laneW, h: laneH, rectRadius: 0.16, fill: { color: fill }, line: { color: i === 1 ? 'C9CEF6' : HEX.line, width: 1 }, objectName: 'lane-' + (i + 1) })
    text(s, name, { x: x0 + 0.25, y: laneY(i) + 0.45, w: 1.35, h: 0.35, fontSize: 16, bold: true, color: C.text1 })
    text(s, sub, { x: x0 + 0.25, y: laneY(i) + 0.82, w: 1.4, h: 0.3, fontSize: 11, color: C.accent6 })
    vline(s, x0 + 1.7, laneY(i) + 0.2, laneY(i) + laneH - 0.2, i === 1 ? 'C9CEF6' : HEX.line, { width: 1 })
  })
  const cw = 1.55, ch = 1.22, cx0 = x0 + 1.95, step = (laneW - 1.95 - 0.2 - cw) / 5
  const cards = [
    [0, '01', '요청 접수', '메신저 요청을\n그대로 붙여넣기', 'plain'],
    [1, '02 · AI', '업무 초안', '스킬 · 마감 ·\n예상 시간 추출', 'ai'],
    [1, '03 · 규칙', '후보 정렬', '캘린더 · 52시간\n공정성 기준', 'ai'],
    [0, '04 · 결정', '리드 승인', '근거를 확인하고\n사람이 결정', 'decide'],
    [1, '05', '예약 · 기록', '캘린더 예약,\n승인 이력 저장', 'ai'],
    [2, '06', '확인 · 검토', '내 배정 확인,\n검토 요청 가능', 'plain'],
  ]
  const pos = cards.map(([lane], i) => ({ x: cx0 + i * step, y: laneY(lane) + (laneH - ch) / 2 }))
  const mid = (i) => pos[i].y + ch / 2
  // Connectors first so cards paint over their ends
  const A = HEX.lineAccent.replace('B8BEF3', '7C86E3')
  const elbow = (a, b) => { const xm = pos[a].x + cw + (pos[b].x - pos[a].x - cw) / 2; hline(s, pos[a].x + cw, mid(a), xm, A); vline(s, xm, mid(a), mid(b), A); hline(s, xm, mid(b), pos[b].x, A, { arrow: true }) }
  elbow(0, 1); hline(s, pos[1].x + cw, mid(1), pos[2].x, A, { arrow: true }); elbow(2, 3); elbow(3, 4); elbow(4, 5)
  // Feedback loop: from card 06 back up to card 04
  const loopX = pos[3].x + cw / 2
  hline(s, pos[5].x, mid(5) + 0.25, loopX, HEX.green, { dash: 'dash' })
  vline(s, loopX, mid(5) + 0.25, pos[3].y + ch, HEX.green, { dash: 'dash', arrow: true })
  text(s, '검토 요청 시 리드가 재검토', { x: loopX + 0.12, y: mid(5) - 0.15, w: 2.6, h: 0.3, fontSize: 11, bold: true, color: C.accent3 })
  cards.forEach(([, k, t, d, kind], i) => {
    const dark = kind === 'decide'
    card(s, pos[i].x, pos[i].y, cw, ch, { fill: dark ? C.text2 : C.background1, line: dark ? HEX.deep : kind === 'ai' ? HEX.lineAccent : HEX.line, name: 'wf-card-' + (i + 1) })
    text(s, k, { x: pos[i].x + 0.14, y: pos[i].y + 0.1, w: cw - 0.28, h: 0.25, fontSize: 10.5, bold: true, color: dark ? C.accent2 : C.accent1 })
    text(s, t, { x: pos[i].x + 0.14, y: pos[i].y + 0.35, w: cw - 0.28, h: 0.3, fontSize: 13, bold: true, color: dark ? C.background1 : C.text1 })
    text(s, d, { x: pos[i].x + 0.14, y: pos[i].y + 0.67, w: cw - 0.28, h: 0.48, fontSize: 10, color: dark ? C.background2 : HEX.body, valign: 'top' })
  })
  s.addNotes('전체 업무 흐름입니다. 위 줄은 팀 리드, 가운데 줄은 Flow, 아래 줄은 팀원입니다. 리드가 요청을 붙여넣으면 AI가 초안을 만들고, 규칙 기반 스케줄러가 캘린더, 주 52시간, 공정성 기준으로 후보를 정렬합니다. 네 번째 단계, 승인은 반드시 사람이 합니다. 승인되면 캘린더에 예약되고 기록이 남습니다. 팀원은 자기 배정을 확인하고, 문제가 있으면 검토를 요청해 다시 리드에게 돌아갑니다. 초록 점선이 그 피드백 흐름입니다.')
}

// ---------- 5–8 · Lead's day ----------
pres.addSection({ title: '리드의 하루' })
shotSlide({ layout: 'SHOT', section: '리드의 하루', tag: '리드 · 대시보드', title: '아침에 한눈에 보는\n팀 상태', lead: '오늘 집중 가능한 시간, 긴급 업무 부담, 일정 충돌을 첫 화면에서 확인합니다.', bullets: ['공정성 지수: 긴급 업무가 몇 명에게 쏠렸는지', '향후 5일 팀 가용 시간 히트맵', '“4시간 긴급 데모”로 바로 시연'], image: 'dashboard', alt: '대시보드: 공정성 지수 53, 팀 가용 시간 히트맵, 긴급 업무 부담', notes: '대시보드입니다. 오른쪽 위 공정성 지수 53은 긴급 업무가 소수에게 몰려 있다는 뜻입니다. 가운데 히트맵은 팀원별로 향후 5일 동안 2시간 이상 연속으로 집중할 수 있는 시간을 보여줍니다.' })
shotSlide({ layout: 'SHOT_TINT', section: '리드의 하루', tag: '1단계 · 긴급 업무 요청', title: '메시지가 바로\n업무 초안이 됩니다', lead: '요청 메시지에서 AI가 우선순위, 마감, 예상 시간, 필수 스킬을 뽑아냅니다.', bullets: ['예상 시간은 범위로: 180–240분', '모호한 점은 질문으로 남김', '리드가 모든 항목을 직접 수정'], image: 'request-draft', alt: '업무 초안: 대시보드 필터 오류 수정, 긴급, 마감 11월 24일 15:00, React·TypeScript L4 이상', notes: '“대시보드 필터 오류 수정” 요청입니다. AI가 긴급, 마감 11월 24일 오후 3시, 예상 3~4시간, React와 TypeScript 레벨 4 이상이라는 초안을 만들었습니다. 위쪽에는 AI가 확인이 필요하다고 표시한 질문이 있습니다. 초안일 뿐이고, 리드가 확인하고 고칩니다.' })
shotSlide({ layout: 'SHOT', section: '리드의 하루', tag: '2단계 · 후보 비교', title: '누가, 언제, 무리 없이\n할 수 있나', lead: '후보마다 스킬, 마감 전 실제 가용 시간, 배정 후 영향, 이번 주 근무 시간을 보여줍니다.', bullets: ['새 업무가 들어갈 캘린더 위치 미리 보기', '주 40시간 · 52시간 한도 대비 근무량', '마감을 넘기면 경고'], image: 'compare-selected', alt: '비교 화면: 새 4시간 업무 미리 보기, 30분만 가능하다는 경고, 이번 주 16시간 / 52시간', notes: '후보를 선택하면 새 4시간 업무가 그 사람의 캘린더 어디에 들어가는지 빨간 줄무늬로 보여줍니다. 이 후보는 마감 전에 30분밖에 여유가 없다는 경고가 뜹니다. 아래쪽 막대는 이번 주 근무 시간을 40시간, 52시간 한도와 비교합니다.' })
shotSlide({ layout: 'SHOT_TINT', section: '리드의 하루', tag: '3단계 · 승인 후 일정', title: '승인하면\n캘린더에 바로 예약', lead: '승인된 업무는 작업 블록으로 팀 캘린더에 들어가고, 모든 기기에서 같은 일정이 보입니다.', bullets: ['파란 블록이 Flow가 예약한 배정', '회의, 리뷰, 휴가 등 기존 일정 유지', '휴식과 예비 시간은 보호'], image: 'calendar', alt: '팀 캘린더: 11월 24일, 김민지에게 Fix dashboard filter 블록 두 개', notes: '승인 후의 팀 캘린더입니다. 김민지 님 줄의 파란 블록이 Flow가 예약한 작업 시간입니다. 기존 회의나 업무와 겹치지 않게 두 덩어리로 나뉘었습니다.' })

// ---------- 9–11 · People & privacy ----------
pres.addSection({ title: '팀원과 개인정보' })
shotSlide({ layout: 'SHOT', section: '팀원과 개인정보', tag: '팀원 목록', title: '팀원별 이번 주\n업무량과 스킬', lead: '리드는 팀원 한 명 한 명의 이번 주 근무량과 확인된 스킬 레벨을 한 표에서 봅니다.', bullets: ['근무량 막대: 정규 용량 대비 비율', '스킬 레벨 4 이상만 필터', '재직 · 부재 · 확인 필요 상태'], image: 'employees', alt: '팀원 목록: 8명, 직무, 상태, 이번 주 근무량, 주요 스킬', notes: '팀원 목록입니다. 예를 들어 김민지 님은 이번 주 66퍼센트, 34시간 30분 중 22시간 45분이 차 있습니다. 1,000명 규모의 명단 CSV를 불러와도 같은 화면으로 봅니다.' })
shotSlide({ layout: 'SHOT_TINT', section: '팀원과 개인정보', tag: '새 디자인 · 팀원 화면', tagNew: true, title: '팀원도 같은 정보를\n봅니다', lead: '배정받는 사람의 화면입니다. 내 근무량, 내 배정, 다음 일정을 첫 화면에서 확인합니다.', bullets: ['배정이 이상하면 바로 검토 요청', '“내 일정 말로 알려주기”로 일정 추가', '날짜별로 묶인 내 일정'], image: 'employee', alt: '팀원 화면: 김민지 프로필, 이번 주 66%, 배정 1건, 다음 일정, 최근 30일 긴급 1건', notes: '이번에 새로 디자인한 팀원 화면입니다. 배정받는 팀원도 리드와 같은 근거를 봅니다. 상단에서 이번 주 근무량, 배정 수, 다음 일정, 최근 30일 긴급 업무 수를 보여주고, 배정에 문제가 있으면 바로 검토를 요청할 수 있습니다.' })
shotSlide({ layout: 'SHOT', section: '팀원과 개인정보', tag: '개인정보', title: '무엇을, 왜 쓰는지\n모두 공개', lead: 'Flow가 가진 내 정보 전체와 사용 목적, 출처를 표로 보여주고 직접 정정할 수 있습니다.', bullets: ['AI 모델로 개인정보를 보내지 않음', '인사 평가 · 활동 감시에 사용하지 않음', 'JSON으로 내려받기'], image: 'employee-data', alt: '내 데이터 표: 항목, 값, 사용 목적, 출처와 스킬·근무 시간 수정 카드', notes: '개인정보 보호법을 생각하면 이 화면이 중요합니다. 팀원은 Flow가 자신에 대해 가진 모든 항목, 그 항목을 어디에 쓰는지, 출처가 어디인지 볼 수 있습니다. 스킬과 근무 시간은 본인이 직접 고칠 수 있습니다.' })

// ---------- 12–14 · Operations ----------
pres.addSection({ title: '운영' })
shotSlide({ layout: 'SHOT_TINT', section: '운영', tag: '리포트', title: '팀 업무량을\n숫자로', lead: '선택한 팀의 이번 주 업무량을 팀원별로 비교하고, 배정 시뮬레이션으로 다른 순서를 시험합니다.', bullets: ['팀원별 정규 용량 대비 비율', '이전 담당자 우선 방식과 비교', '합성 데이터로 안전하게 시뮬레이션'], image: 'workload', alt: '리포트: 팀원 8명의 이번 주 업무량 막대 그래프와 배정 시뮬레이션', notes: '리포트 화면은 팀 단위 업무량을 보여줍니다. 개인을 평가하는 화면이 아니라, 업무가 고르게 나뉘는지 확인하는 화면입니다.' })
shotSlide({ layout: 'SHOT', section: '운영', tag: '일정 점검', title: '문제가 생기기 전에\n알림', lead: '공유 캘린더 전체를 점검해 일정 중복, 마감 임박, 스킬 보유자 부족을 미리 찾아냅니다.', bullets: ['즉시 검토 · 주의 · 스킬 보유 단계', '항목마다 배정이나 프로필로 이동', '점검 기록 보관'], image: 'automation', alt: '일정 점검: 즉시 검토 0, 주의 1, 스킬 보유 11, 알림 피드', notes: '일정 점검은 캘린더 전체를 스캔합니다. 지금은 마감 전 여유가 1시간 이하인 배정 하나가 주의로 표시되어 있고, 특정 스킬을 가진 사람이 한 명뿐인 경우도 알려줍니다.' })
shotSlide({ layout: 'SHOT_TINT', section: '운영', tag: '배정 내역', title: '모든 결정에\n기록이 남습니다', lead: '누가, 언제, 어떤 근거로 배정했는지 남고 CSV나 캘린더 파일로 내보낼 수 있습니다.', bullets: ['확정 · 검토 필요 상태', '예약된 작업 시간 합계', 'CSV · 캘린더 다운로드'], image: 'worklog', alt: '배정 내역: 배정 2건, 확정 2건, 검토 필요 0건, 예약 시간 5시간', notes: '배정 내역입니다. 두 건이 확정되었고 예약된 작업 시간은 총 5시간입니다. 각 배정에는 승인, 검토 요청, 재배정 기록이 남아서 나중에 결정을 설명할 수 있습니다.' })

// ---------- 15 · Expert review ----------
pres.addSection({ title: '검토와 구조' })
{
  const s = pres.addSlide({ masterName: 'CONTENT_TINT', sectionTitle: '검토와 구조' })
  s.addText('모의 전문가 리뷰 · 반영 결과', { placeholder: 'eyebrow' })
  s.addText('네 명의 검토 의견을 화면에 반영했습니다', { placeholder: 'title' })
  const reviews = [
    ['제품 디자이너', '“랜딩 페이지가 문서처럼 읽히고, 가장 좋은 아트워크는 대시보드에만 있습니다.”', '아트워크를 넣은 랜딩 히어로, 2×2 테마 카드, 비교 화면 레이아웃 버그 수정'],
    ['UX 리서처', '“리드는 사람을 고르러 왔는데 후보가 아래에 있습니다. 결정이 먼저여야 합니다.”', '후보를 맨 위로, 선택 요약과 승인 버튼이 따라오는 결정 바'],
    ['HR 테크 자문 (한국 기업)', '“첫 질문은 ‘주 52시간을 지키나요?’입니다. 개인정보보호법 원칙도 보여야 합니다.”', '모든 후보에 40h · 52h 근무 미터, 최소 수집 · 목적 제한 · 열람·정정권 표시'],
    ['엔터프라이즈 SaaS 전략가', '“가치를 한 줄로: 먼저 답한 사람이 아니라 실제로 집중할 시간이 있는 사람.”', '랜딩 헤드라인 교체, “52h 법정 한도 · 항상 준수”를 핵심 지표로'],
  ]
  const gap = 0.25, cw = (W - 2 * M - 3 * gap) / 4, y = 1.95, ch = 3.7
  reviews.forEach(([who, q, done], i) => {
    const x = M + i * (cw + gap)
    card(s, x, y, cw, ch, { name: 'review-' + (i + 1) })
    text(s, who, { x: x + 0.25, y: y + 0.25, w: cw - 0.5, h: 0.35, fontSize: 13, bold: true, color: C.accent1 })
    text(s, q, { x: x + 0.25, y: y + 0.7, w: cw - 0.5, h: 1.45, fontSize: 13.5, color: C.text1, valign: 'top', lineSpacingMultiple: 1.2 })
    hline(s, x + 0.25, y + 2.25, x + cw - 0.25, HEX.line, { width: 1 })
    text(s, [{ text: '반영  ', options: { bold: true } }, { text: done }], { x: x + 0.25, y: y + 2.4, w: cw - 0.5, h: 1.15, fontSize: 12, color: C.accent3, valign: 'top', lineSpacingMultiple: 1.2 })
  })
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.9, w: W - 2 * M, h: 0.75, rectRadius: 0.12, fill: { color: C.text2 }, line: { color: C.text2, width: 0 }, objectName: 'next-steps' })
  text(s, [{ text: '다음 단계    ', options: { bold: true, color: C.accent2 } }, { text: '승인 후 10초 되돌리기 · 카카오워크 · 네이버웍스 · Slack 연동 · 리드와 팀원 로그인', options: { color: C.background1 } }], { x: M + 0.4, y: 5.9, w: W - 2 * M - 0.8, h: 0.75, fontSize: 15, valign: 'middle' })
  s.addNotes('이 화면들은 네 명의 관점으로 진행한 모의 전문가 리뷰를 거쳤습니다. 실제 외부 전문가가 아니라 역할을 나눠 진행한 검토입니다. 공통 결론은 결정 중심의 비교 화면, 눈에 보이는 52시간 미터, 아트워크와 준수 항목을 담은 랜딩 페이지, 레이아웃 버그 수정이었고 모두 반영했습니다. 승인 후 되돌리기, 메신저 연동, 로그인은 다음 단계입니다.')
}

// ---------- 16 · Korean law ----------
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '검토와 구조' })
  s.addText('한국 법 준수', { placeholder: 'eyebrow' })
  s.addText('한국 법을 지키도록 처음부터 설계했습니다', { placeholder: 'title' })
  const head = { bold: true, color: C.background1, fill: { color: C.text2 }, fontSize: 12.5, valign: 'middle' }
  const rows = [
    ['근로기준법 제50·53조', '주 40시간 + 연장 12시간 = 주 52시간 한도', '정규 근무 안에서만 예약, 모든 후보에 40h·52h 근무 미터'],
    ['근로기준법 제54조', '휴게: 4시간에 30분, 8시간에 1시간 이상', '휴식·예비 시간은 보호 블록, 업무 예약 안 함'],
    ['개인정보 보호법 제37조의2 (2024.3.15 시행)', '자동화된 결정 거부권 · 설명 요구권', '완전 자동 결정 없음: 리드 승인 필수, 배정 이유 공개, 검토 요청'],
    ['개인정보 보호법 제3·35·36조', '최소 수집 · 목적 제한 · 열람·정정권', '일정 데이터만 사용, “내 데이터”에서 열람·정정·내보내기'],
    ['인공지능 기본법 (2026.1.22 시행)', '고영향 AI의 사람 개입 · 설명 · 이용자 보호', 'AI는 초안·설명만, 순위는 규칙, 최종 결정은 사람'],
    ['근로자참여법 제20조 제1항 제14호', '근로자 감시 설비는 노사협의 사항', '활동 감시 없음: 키 입력·화면 시간·위치 미수집'],
  ]
  s.addTable([
    [{ text: '법 · 조항', options: head }, { text: '요구 사항', options: head }, { text: 'Flow의 설계', options: head }],
    ...rows.map((r, i) => r.map((cell, j) => ({ text: cell, options: { fontSize: 12.5, bold: j === 0, color: j === 2 ? C.accent3 : C.text1, fill: { color: i % 2 ? C.background2 : C.background1 }, valign: 'middle' } }))),
  ], { x: M, y: 1.95, w: W - 2 * M, colW: [3.4, 3.9, W - 2 * M - 7.3], rowH: 0.62, border: { type: 'solid', pt: 0.75, color: HEX.line }, margin: [4, 8, 4, 8], objectName: 'law-table' })
  text(s, '설계 원칙 요약이며 법률 자문이 아닙니다. 도입 시 노사협의와 최신 시행령을 노무·법률 담당자와 확인해야 합니다.', { x: M, y: 6.6, w: W - 2 * M, h: 0.35, fontSize: 11, color: C.accent6 })
  s.addNotes('Flow는 한국 법을 염두에 두고 설계했습니다. 근로기준법의 주 52시간과 휴게 규정은 스케줄러의 제약 조건입니다. 개인정보 보호법 제37조의2는 2024년 3월부터 완전히 자동화된 결정에 대한 거부권과 설명 요구권을 보장하는데, Flow는 모든 배정을 리드가 승인하고 이유를 공개하므로 완전 자동 결정이 아닙니다. 올해 1월 시행된 인공지능 기본법의 사람 개입 원칙과도 맞고, 근로자 감시 기능은 아예 없습니다. 다만 이것은 설계 원칙이며 법률 자문은 아닙니다.')
}

// ---------- 16 · Architecture ----------
{
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: '검토와 구조' })
  s.addText('구조', { placeholder: 'eyebrow' })
  s.addText('결정은 규칙으로, 설명은 AI로, 기록은 데이터베이스에', { placeholder: 'title' })
  const boxes = [
    ['브라우저 · React', '스케줄러가 여기서 실행', ['캘린더 빈 시간 계산', '가중 점수로 후보 정렬', '변경분만 서버로 동기화'], false],
    ['Flow API 서버 · Hono', '키는 서버에만 보관', ['AI 호출 (Groq): 초안 · 설명만', 'AI 사용 기록은 메타데이터만', '동시 저장 시 최신 버전 우선'], true],
    ['Supabase · Postgres', '공유 워크스페이스', ['팀원 1,000명 명단', '캘린더 블록 약 3,500개', '배정 · 승인 기록'], false],
  ]
  const gap = 0.7, cw = (W - 2 * M - 2 * gap) / 3, y = 2.0, ch = 3.2
  boxes.forEach(([k, h, items, hl], i) => {
    const x = M + i * (cw + gap)
    card(s, x, y, cw, ch, { fill: hl ? HEX.soft : HEX.card, line: hl ? HEX.lineAccent : HEX.line, name: 'arch-' + (i + 1) })
    text(s, k, { x: x + 0.35, y: y + 0.3, w: cw - 0.7, h: 0.35, fontSize: 13, bold: true, color: C.accent1 })
    text(s, h, { x: x + 0.35, y: y + 0.7, w: cw - 0.7, h: 0.45, fontSize: 19, bold: true, color: C.text1 })
    text(s, items.map((t, j) => ({ text: t, options: { bullet: { indent: 16 }, paraSpaceAfter: 6, breakLine: j < items.length - 1 ? true : undefined } })), { x: x + 0.35, y: y + 1.35, w: cw - 0.7, h: 1.6, fontSize: 14, color: HEX.body, valign: 'top' })
    if (i < 2) s.addShape(pres.shapes.LINE, { x: x + cw + 0.1, y: y + ch / 2, w: gap - 0.2, h: 0, line: { color: '7C86E3', width: 2.5, beginArrowType: 'triangle', endArrowType: 'triangle' }, objectName: 'link-' + (i + 1) })
  })
  text(s, '공개 역할(anon)은 테이블에 접근할 수 없고, 서버 역할만 읽고 씁니다. API 키는 브라우저로 전달되지 않습니다.', { x: M, y: 5.6, w: W - 2 * M, h: 0.4, fontSize: 13, color: C.accent6 })
  s.addNotes('구조는 세 부분입니다. 순위 계산은 브라우저의 규칙 기반 스케줄러가 하고, 서버는 AI 키를 보관하며 초안과 설명만 요청합니다. 데이터는 Supabase에 저장되어 여러 기기에서 같은 워크스페이스를 봅니다. 현재 데이터베이스에는 팀원 1,000명, 캘린더 블록 약 3,500개가 있습니다.')
}

// ---------- 17 · Close ----------
{
  const s = pres.addSlide({ masterName: 'CLOSE_DARK', sectionTitle: '검토와 구조' })
  s.addText('정리', { placeholder: 'eyebrow' })
  s.addText('결정은 사람이,\n근거는 Flow가', { placeholder: 'title' })
  s.addText('긴급 업무를 실제로 할 수 있는 사람에게, 공정하게, 기록과 함께.', { placeholder: 'body' })
  let x = M + 0.3
  for (const label of ['스킬 확인', '실제 캘린더', '주 52시간 준수', '공정한 순환', '개인정보 공개']) {
    const w = 0.5 + label.length * 0.2
    s.addText(label, { isTextBox: true, x, y: 5.15, w, h: 0.5, shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.25, fill: { color: HEX.panel }, line: { color: HEX.pillLine, width: 1 }, color: C.background1, fontSize: 14, align: 'center', valign: 'middle', margin: 0, objectName: 'pill-' + label })
    x += w + 0.2
  }
  s.addNotes('정리하면, Flow는 결정을 대신하지 않습니다. 리드가 더 나은 결정을 내리도록 근거를 보여주고, 팀원도 같은 근거를 봅니다. 질문 받겠습니다.')
}

pres.writeFile({ fileName: OUT }).then(async (file) => {
  await applyTheme(file, THEME)
  await koreanWordWrap(file)
  console.log('wrote', file)
})

// PowerPoint breaks Hangul between any two syllables by default; eaLnBrk="0" keeps words (어절) whole.
async function koreanWordWrap(file) {
  const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }))
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(n))) {
    let xml = await zip.file(name).async('string')
    xml = xml.replace(/<a:pPr(?![^>]*eaLnBrk)/g, '<a:pPr eaLnBrk="0"')/* Korean runs */.replace(/lang="en-US"/g, 'lang="ko-KR" altLang="en-US"').replace(/<a:p>(?!<a:pPr)/g, '<a:p><a:pPr eaLnBrk="0"/>')
    zip.file(name, xml)
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}
