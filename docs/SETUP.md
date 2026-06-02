# 로컬 실행과 배포 준비

## 1. 프런트 시연

Supabase 연결 없이 합성 데이터 웹을 먼저 확인할 수 있다.

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev:web -- --host 127.0.0.1
```

모바일은 Expo Go가 설치된 Android 기기를 같은 네트워크에 연결한 뒤 실행한다.

```powershell
npx.cmd expo export --platform android --clear
npm.cmd run configure:mobile:lan
npm.cmd run dev:mobile -- --lan --clear
npm.cmd run verify:mobile:lan
```

`configure:mobile:lan`은 Android 실기기에서 접근 가능한 개발 PC의 LAN 주소와 로컬 publishable key만 `apps/mobile/.env.local`에 기록한다. 구형 CLI에서는 anon key로 fallback한다. 필요하면 `npm.cmd run configure:mobile:lan -- -Preview`로 파일을 쓰지 않고 대상 URL을 확인한다. secret key와 service role key는 앱에 넣지 않는다.

루트 `dev:mobile` 명령은 마지막 `--` 뒤의 Expo CLI 옵션을 모바일 워크스페이스까지 전달한다.
`verify:mobile:lan`은 공개 env에 URL과 공개 API key만 있는지 확인하고 LAN Supabase와 Metro 응답을 검사한 뒤 Expo Go에 입력할 `exp://` URL을 출력한다.

- 웹 공개 환경변수: `apps/web/.env.example`을 참고한 `apps/web/.env.local`
- 모바일 공개 환경변수: `apps/mobile/.env.example`을 참고한 `apps/mobile/.env.local`
- Edge Function 로컬 secrets: `supabase/functions/.env`

공개 환경변수 파일에는 URL과 publishable key 또는 legacy anon key만 넣는다. secret key, service role key, cron secret은 모바일·웹 환경변수 파일에 넣지 않는다.

직원 웹을 로컬 Supabase 연결 모드로 확인할 때는 수동 복사 대신 공개 env 설정 스크립트를 사용할 수 있다.

```powershell
npm.cmd run configure:web:local
npm.cmd run dev:web -- --host 127.0.0.1 --port 5175
npm.cmd run verify:web:local -- -WebUrl http://127.0.0.1:5175
npm.cmd run verify:web:ui-local -- -WebUrl http://127.0.0.1:5175
```

`configure:web:local`은 로컬 URL과 publishable key만 `apps/web/.env.local`에 기록한다. 구형 CLI에서는 anon key로 fallback한다. `verify:web:local`은 공개 env 허용 목록, Supabase Auth health, Vite 진입 HTML을 검사한다. `verify:web:ui-local`은 headless Chrome으로 상담자·기관 관리자·플랫폼 관리자 seed 로그인을 수행하고 증거맵 연결, 보관 정책, 역할별 메뉴를 검사한다. 기관 관리자 정책 화면은 `390px` viewport도 확인한다. 결과 이미지는 `C:\tmp\ieumlog-web-ui-smoke`에 남고 실패 시 마지막 화면은 `web-ui-failure.png`로 남는다.

## 2. 로컬 Supabase

Docker Desktop을 시작하고 `.env.example`을 참고해 `supabase/functions/.env`를 만든다. 이 파일은 git에서 무시되며 값은 터미널 로그나 커밋에 남기지 않는다.

```powershell
npm.cmd run supabase:start
npm.cmd run supabase:reset
npx.cmd supabase functions serve --env-file supabase/functions/.env
```

합성 계정의 로컬 비밀번호는 모두 `demo1234`이다.

루트 devDependency에 고정된 Supabase CLI를 사용한다. 공개 앱 설정은 CLI의 `PUBLISHABLE_KEY`를 우선 사용하고 구형 CLI에서만 `ANON_KEY`로 fallback한다. 서버 검증은 `SECRET_KEY`를 우선 사용하고 구형 `SERVICE_ROLE_KEY`를 fallback으로 허용한다.

`db reset` 뒤 Realtime 구독이 `SUBSCRIBED` 이후 갱신되지 않으면 기존 서비스 컨테이너와 새 DB 스키마가 섞였는지 의심한다. 다음 명령으로 전체 로컬 스택을 다시 구성한다.

```powershell
npm.cmd run supabase:stop
npm.cmd run supabase:start
```

로컬 스택이 실행 중일 때 DB reset, RLS, Storage, Edge Function 경계를 한 번에 재검증할 수 있다.

```powershell
npm.cmd run verify:deploy
npm.cmd run verify:local
npm.cmd run verify:mobile
```

`npm.cmd run test`는 도메인 규칙뿐 아니라 SecureStore UTF-8 초안 청크와 합성 OpenAI OCR·STT stub 요청도 함께 검증한다. Hosted Supabase 배포 secret에는 `OPENAI_API_BASE_URL`을 넣지 않는다.

| 역할 | 로그인 |
| --- | --- |
| 플랫폼 관리자 | `platform@ieumlog.demo` |
| 기관 관리자 | `admin@wee.demo` |
| 상담자 | `counselor@wee.demo` |
| 학생 | `WEE-24-0510` |

## 3. Supabase 프로젝트

1. Supabase 프로젝트를 만든다.
2. `supabase/functions/.env.deploy.example`을 참고해 무시 대상 `supabase/functions/.env.deploy`를 만든다.
3. cron secret을 무작위 값으로 바꾸고 `EXTERNAL_AI_MODE=synthetic_only`를 유지한다.
4. `npm.cmd run deploy:supabase -- -ProjectRef yourprojectref1234567`로 DB와 Edge Functions를 배포한다.
5. 격리된 합성 시연 프로젝트라면 `supabase/.env.hosted.example`을 무시 대상 `supabase/.env.hosted`로 복사하고 URL, anon key, 12자 이상의 별도 임의 시연 비밀번호를 채운다.
6. 격리된 합성 시연 프로젝트에서만 `npm.cmd run bootstrap:hosted-demo -- -ProjectRef yourprojectref1234567 -ConfirmSyntheticDemo`를 실행한다. 운영 데이터 프로젝트에는 실행하지 않는다.
7. `npm.cmd run verify:hosted`로 학생·상담자 로그인, RLS, private Storage 서명 URL, 문서 처리, 삭제 예약, cron secret 부재 차단을 확인한다.
8. `supabase/cron.example.sql` placeholder를 교체하고 hosted SQL editor에서 한 번 실행한다.
9. anon URL과 key는 웹·모바일 공개 환경변수에 등록한다.

Hosted Supabase는 API 키를 Edge Functions에 자동 주입한다. custom deploy secret 파일에는 `OPENAI_API_KEY`, 모델 설정, `EXTERNAL_AI_MODE`, cron secret만 둔다.

`bootstrap:hosted-demo`는 공개 저장소의 로컬 `demo1234`를 hosted 전용 임의 비밀번호로 치환한 임시 SQL을 적용한 뒤 즉시 삭제한다. 합성 seed는 재실행 가능하며, 다시 실행하면 기존 고정 가상 계정 비밀번호도 현재 환경 파일 값으로 회전한다. 이 경로는 시연 전용이다.

## 4. Vercel 웹

Vercel 연결 전 CLI 인증과 프로젝트를 먼저 확인한다. 현재 저장소에는 실제 연결값이 없으므로 자동 링크나 배포를 실행하지 않는다.

```powershell
vercel --version
vercel whoami
vercel link
vercel env pull apps/web/.env.local
```

Vercel 프로젝트 Root Directory는 `apps/web`, 빌드 명령은 `npm run build`, 출력 폴더는 `dist`로 설정한다.

## 5. Android 배포 준비

Expo Go 검증 후 preview 빌드를 만든다.

```powershell
npx.cmd eas login
npx.cmd eas build --platform android --profile preview
```

전체 수동 확인 순서는 [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)를 따르고, Android Expo Go 결과는 [ANDROID_EXPO_GO_TEST_RECORD.md](ANDROID_EXPO_GO_TEST_RECORD.md)에 기록한다.
