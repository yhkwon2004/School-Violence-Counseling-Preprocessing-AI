# 배포와 Android 실기기 체크리스트

## 1. 로컬 게이트

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify:deploy
npm.cmd run verify:mobile
npm.cmd run verify:local
```

`verify:mobile`은 Expo Doctor와 Android Metro export를 실행한다. `verify:local`은 Docker 기반 Supabase reset 뒤 RLS, private Storage 직접 접근 차단, 서명 URL, Edge Functions, Realtime, purge lease·회수·트랜잭션 완료를 검증한다.

로컬 Supabase에 연결한 직원 웹은 별도 Vite 포트에서 확인한다.

```powershell
npm.cmd run configure:web:local
npm.cmd run dev:web -- --host 127.0.0.1 --port 5175
npm.cmd run verify:web:local -- -WebUrl http://127.0.0.1:5175
npm.cmd run verify:web:ui-local -- -WebUrl http://127.0.0.1:5175
```

`verify:web:local`은 웹 공개 env에 URL과 publishable key 또는 legacy anon key만 있는지, Supabase Auth와 Vite HTML이 준비됐는지 확인한다. `verify:web:ui-local`은 실제 seed 로그인 화면에서 상담자 증거맵, 기관 관리자 보관 정책, 플랫폼 관리자 역할 메뉴를 검사한다. 기관 관리자 정책 화면은 데스크톱 카드 넘침과 `390px` viewport의 한 열 배치도 확인한다. 실패하면 `C:\tmp\ieumlog-web-ui-smoke\web-ui-failure.png`에 마지막 화면을 남긴다.

## 2. Android Expo Go

개발 PC와 Android 기기를 같은 네트워크에 연결하고 로컬 Supabase를 시작한다.

```powershell
npm.cmd run supabase:start
npm.cmd run configure:mobile:lan
npm.cmd run dev:mobile -- --lan --clear
npm.cmd run verify:mobile:lan
```

`configure:mobile:lan`은 개발 PC의 LAN IPv4와 로컬 publishable key만 `apps/mobile/.env.local`에 기록한다. 구형 CLI에서는 anon key로 fallback한다. secret key, service role key, cron secret은 앱에 넣지 않는다.
`verify:mobile:lan`은 공개 env, LAN Supabase health, Metro status를 검사하고 Expo Go에 입력할 `exp://` URL을 출력한다.

Expo Go에서 다음 흐름을 확인한다.

1. 익명 ID `WEE-24-0510`, 비밀번호 `demo1234`로 로그인한다.
2. 로그인 입력에 키보드를 열고 작은 화면에서도 시작 버튼까지 스크롤할 수 있는지 확인한다.
3. 사건 메모를 쓰고 키보드를 drag로 닫은 뒤 앱을 다시 열어 SecureStore 초안 복구를 확인한다. 제출 뒤 앱을 다시 열어 이전 write가 초안을 되살리지 않는지도 확인한다.
4. 이미지 또는 PDF를 올리고 즉시 다음 단계로 이동한다.
5. 처리 상태가 Realtime 또는 polling fallback으로 갱신되는지 확인한다.
6. 증거가 대기 또는 처리 중이면 확인 화면의 제출 버튼이 잠기는지 확인한다.
7. 누락 질문을 수정하는 동안 다음 이동이 잠기고, 저장 완료 뒤 풀리는지 확인한다. 저장 실패를 재현할 수 있다면 재시도와 변경 취소도 확인한다.
8. 질문 답변 저장과 새 FactBlock 확인 뒤 제출한다. 제출 연속 탭이 중복 요청을 만들지 않고 제출 뒤 메모 수정과 추가 업로드가 잠기는지 확인한다.
9. 제출 완료 화면에서 재개방 확인, 삭제 요청, 새 기록 작성, 처음 화면 버튼까지 스크롤로 도달할 수 있는지 확인한다.
10. 앱을 다시 열어 제출 사건 잠금 화면이 복원되는지 확인한다.
11. 상담자 웹 재개방 뒤 앱의 확인 버튼으로 수정 흐름에 돌아가는지 확인한다.
12. 잠금 화면에서 새 기록 작성을 명시적으로 선택할 수 있는지 확인한다.
13. 삭제 요청 확인창에서 취소하면 유지되고, 확인하면 사건이 즉시 숨겨지는지 확인한다.

결과는 [ANDROID_EXPO_GO_TEST_RECORD.md](ANDROID_EXPO_GO_TEST_RECORD.md)에 기기·Expo Go 버전과 함께 기록한다. 상담자 웹 재개방 뒤 학생 수정 가능 여부도 같은 기록에서 확인한다.

## 3. Hosted Supabase

`supabase/functions/.env.deploy.example`을 참고해 git에서 무시되는 `supabase/functions/.env.deploy`를 만든다. cron secret은 충분히 긴 무작위 값으로 교체하고 `EXTERNAL_AI_MODE=synthetic_only`를 유지한다.

```powershell
npm.cmd run deploy:supabase -- -ProjectRef yourprojectref1234567
```

배포 스크립트는 프로젝트 연결, DB push, custom secret 등록, Edge Function 배포를 순서대로 실행한다. hosted Supabase가 자동 제공하는 API 키는 deploy secret 파일에 중복 등록하지 않는다.

격리된 합성 시연 프로젝트라면 `supabase/.env.hosted.example`을 `supabase/.env.hosted`로 복사하고 URL, anon key, 12자 이상의 별도 임의 비밀번호를 채운 뒤 다음 명령을 실행한다. 운영 데이터 프로젝트에는 이 bootstrap을 실행하지 않는다.

```powershell
npm.cmd run bootstrap:hosted-demo -- -ProjectRef yourprojectref1234567 -ConfirmSyntheticDemo
npm.cmd run verify:hosted
```

`verify:hosted`는 anon key 범위에서 학생·상담자 로그인, RLS, private Storage 서명 업로드·다운로드, 부분 업로드 정리, 중복 처리 접수 병합, 문서 manual review 처리, 삭제 예약, cron secret 부재 거절을 확인한다.
시연 비밀번호를 변경했다면 같은 bootstrap 명령을 다시 실행한다. 고정 가상 Auth 계정 비밀번호 해시도 현재 `supabase/.env.hosted` 값으로 회전한다.

Edge Function 배포 뒤 `supabase/cron.example.sql`의 placeholder 세 개를 교체하고 hosted SQL editor에서 한 번 실행한다. 템플릿은 Vault에 URL과 cron secret을 저장하고 다음 작업을 등록한다.

| 작업 | 주기 |
| --- | --- |
| `ieumlog-retry-failed-jobs` | 5분마다 |
| `ieumlog-purge-deleted` | 매일 03:17 UTC |

## 4. Vercel 웹

Vercel 프로젝트 Root Directory를 `apps/web`으로 지정하고 다음 공개 환경변수만 등록한다.

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

`apps/web/vercel.json`은 Vite 빌드, `dist` 출력, SPA rewrite를 선언한다.

## 5. EAS Android Preview

Expo 로그인 뒤 내부 배포 APK를 만든다.

```powershell
npx.cmd eas login
npx.cmd eas build --platform android --profile preview
```

내려받은 preview APK의 native manifest를 Android SDK Build Tools `26.0.2+`의 `aapt2`로 확인한다.

```powershell
npm.cmd run verify:android:apk -- -ApkPath C:\path\to\ieumlog-preview.apk
```

검증기는 패키지 ID `kr.ieumlog.student`, 앱 데이터 백업 비활성, 키보드 `adjustResize`, `android.permission.RECORD_AUDIO` 부재를 확인한다. Android SDK가 기본 위치에 없다면 `-Aapt2Path C:\path\to\aapt2.exe`를 함께 전달한다.

스토어 제출용 production 프로필은 Android App Bundle을 생성한다.

## 6. 운영 전 차단 조건

- 실제 학생 자료의 외부 AI 전송 금지
- ZDR 승인과 법률 검토 완료
- 보호자·기관 동의, 연령별 고지, 위험 상황 escalation 절차 완료
- 운영 규모 장기 OCR·STT용 별도 durable worker 검토
