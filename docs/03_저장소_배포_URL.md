# 소스코드 저장소 URL · 배포 URL

| 항목 | URL | 상태 |
| --- | --- | --- |
| 소스코드 저장소 | https://github.com/gitone912/flow-main | push 완료 |
| 배포 URL | https://flow-main-rouge.vercel.app | 배포 완료 (Vercel) |
| 백엔드 API | https://crescent-hanky-doorbell.ngrok-free.dev | ngrok 터널 — 이 PC에서 API 서버와 ngrok이 실행 중일 때만 동작 |
| API 문서 (Swagger) | https://crescent-hanky-doorbell.ngrok-free.dev/api/docs | OpenAPI 3.1 · 원본 JSON: `/api/openapi.json` · 처음 접속 시 ngrok 안내 화면에서 “Visit Site” 클릭 |
| 발표 자료 (온라인) | https://claude.ai/artifact/BQ5VLC71umKZv9h33R81Mo | 비공개 — 공유 설정 필요 |
| 발표 가이드 (영어) | https://claude.ai/artifact/42RuwZXZJoKiv1wbSyJeP1 | 비공개 — 공유 설정 필요 |

## 저장소 올리기 (GitHub)

1. GitHub에서 새 저장소를 만들고 **Public**으로 설정합니다.
2. `.env`는 `.gitignore`에 포함되어 있어 키가 올라가지 않습니다. 커밋 전 `git status`로 한 번 더 확인하세요.
3. 커밋 후 `git remote add origin <저장소 주소>` → `git push -u origin main`.

## 배포하기

- 프론트엔드(Vite 빌드 `dist/`)와 API 서버(`npm start`, Hono)가 함께 필요합니다.
- 예: API 서버는 Render · Railway · Fly.io, 프론트엔드는 Vercel · Netlify. 프론트엔드에는 `VITE_API_BASE_URL`을 API 주소로, 서버에는 `CORS_ORIGINS`를 프론트엔드 주소로 설정합니다.
- 서버 환경 변수: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (키 없이도 규칙 기반 모드로 동작).
- 배포 후 시크릿 창에서 열어 로그인 없이 접속되는지 확인하세요.

## 현재 배포 구성

- 프론트엔드: Vercel (`vercel.json`, 빌드 시 `VITE_API_BASE_URL`=ngrok 주소)
- 백엔드: 로컬 PC의 Flow API(포트 3001) → ngrok 고정 도메인
- CORS: `.env`의 `CORS_ORIGINS=https://flow-main-rouge.vercel.app`
- 백엔드가 꺼져 있으면 사이트는 브라우저 저장 + 규칙 기반 모드로 계속 동작합니다.

### 백엔드 다시 켜기

```
npm run dev:server
ngrok http 3001
```
