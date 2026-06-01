# 이음로그 (FACTLINE)

학교폭력 상담 전에 학생의 흩어진 진술과 증거를 상담 가능한 기록으로 정리하는 MVP입니다. AI는 사건을 판단하지 않고, 학생이 제공한 자료에서 확인 가능한 사실만 `FactBlock`으로 구조화합니다.

## 구성

- `apps/mobile`: 학생용 Expo Router 앱
- `apps/web`: 상담자·기관 관리자·플랫폼 관리자용 React 웹
- `packages/domain`: 공통 객체 지향 도메인 계층과 규칙 분석기
- `supabase`: 데이터베이스, RLS, Storage, Edge Functions, 합성 seed
- `docs`: 제품 설계, 구조, 결정 기록, 구현 상태

## 빠른 확인

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev:web
```

웹은 Supabase 환경변수가 없을 때 합성 데이터 데모 모드로 실행됩니다. 모바일은 Android 기기의 Expo Go를 우선 지원합니다.

공개 Supabase URL과 publishable key 또는 legacy anon key를 등록하면 학생 앱은 실제 익명 ID 로그인·초안·업로드·질문·제출·삭제 요청 흐름을 사용하고, 직원 웹은 이메일 로그인·RLS 조회·사건 검토·관리자 작업을 사용합니다.

Docker 기반 로컬 Supabase 스택이 실행 중이면 보안 경계까지 한 번에 검증할 수 있습니다.

```powershell
npm.cmd run verify:deploy
npm.cmd run verify:local
npm.cmd run verify:mobile
```

직원 웹을 로컬 Supabase 연결 모드로 확인할 때는 공개 환경변수를 생성한 뒤 별도 Vite 포트를 열고 상태를 검사합니다.

```powershell
npm.cmd run configure:web:local
npm.cmd run dev:web -- --host 127.0.0.1 --port 5175
npm.cmd run verify:web:local -- -WebUrl http://127.0.0.1:5175
npm.cmd run verify:web:ui-local -- -WebUrl http://127.0.0.1:5175
```

`npm.cmd run test`는 도메인 규칙, SecureStore 초안 청크, 합성 OpenAI OCR·STT stub 경계를 함께 검증합니다.

```powershell
npm.cmd run configure:mobile:lan
npm.cmd run dev:mobile -- --lan --clear
npm.cmd run verify:mobile:lan
```

클라우드 연결 전에는 [docs/SETUP.md](docs/SETUP.md)와 [docs/DEPLOYMENT_CHECKLIST.md](docs/DEPLOYMENT_CHECKLIST.md)를 먼저 읽으세요. 실제 학생 자료의 외부 AI 전송은 기본적으로 차단되어 있습니다.
Android Expo Go 수동 결과는 [docs/ANDROID_EXPO_GO_TEST_RECORD.md](docs/ANDROID_EXPO_GO_TEST_RECORD.md)에 기록합니다.

격리된 hosted 합성 시연 프로젝트에는 `npm.cmd run bootstrap:hosted-demo -- -ProjectRef yourprojectref1234567 -ConfirmSyntheticDemo`로 고정 가상 계정을 넣고, `npm.cmd run verify:hosted`로 로그인·RLS·private Storage 경계를 확인할 수 있습니다. 운영 데이터 프로젝트에는 합성 bootstrap을 실행하지 않습니다.
