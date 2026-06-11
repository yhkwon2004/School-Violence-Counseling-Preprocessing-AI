# 이음로그 (FACTLINE)

학교폭력 상담 전에 학생의 흩어진 진술과 증거를 상담 가능한 기록으로 정리하는 MVP입니다. AI는 사건을 판단하지 않고, 학생이 제공한 자료에서 확인 가능한 사실만 `FactBlock`으로 구조화합니다.

## 구성

- `apps/mobile`: 학생용 Expo Router 앱
- `apps/web`: 상담자·기관 관리자·플랫폼 관리자 웹과 `/student` 학생 웹
- `packages/domain`: 공통 객체 지향 도메인 계층과 규칙 기반 분석기
- `supabase`: Postgres, RLS, private Storage, Edge Functions, 합성 seed
- `docs`: 제품 설계, 구조, 결정 기록, 구현 상태

## 빠른 확인

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

웹은 Supabase 환경변수가 없을 때 합성 데이터 데모 모드로 실행됩니다. 공개 Supabase URL과 publishable key 또는 legacy anon key를 등록하면 학생 앱과 직원 웹 모두 실제 Auth, RLS, Storage 서명 URL, Edge Function 흐름을 사용합니다.

```powershell
npm.cmd run dev:web -- --host 127.0.0.1 --port 5173
npm.cmd run dev:mobile -- --lan
```

## 검증

```powershell
npm.cmd run verify:deploy
npm.cmd run verify:mobile
npm.cmd run configure:web:local
npm.cmd run verify:web:ui-local
```

격리된 hosted 합성 시연 프로젝트에는 `bootstrap:hosted-demo`와 `upload:synthetic:evidence`로 가상 계정과 합성 증거 원본을 준비합니다. 실제 학생 자료의 외부 AI 전송은 기본적으로 차단되어 있으며, `EXTERNAL_AI_MODE=synthetic_only`가 기본값입니다.

## 배포

루트 `vercel.json`은 `apps/web/dist`를 Vercel 정적 출력으로 사용합니다.

```powershell
npx.cmd vercel link --yes --project ieumlog-school-safety
npx.cmd vercel --prod
```

Android preview APK는 Expo/EAS 인증 뒤 아래 명령으로 생성합니다.

```powershell
npm.cmd run configure:mobile:hosted
npm.cmd run build:student:apk
```

자세한 절차는 [docs/SETUP.md](docs/SETUP.md)와 [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md)를 확인하세요.
