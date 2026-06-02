# 이음로그 결정 기록

## 2026-05-31

### Native student app and separate staff web

- 학생 입력은 Expo Router SDK 54 앱으로 만든다.
- 상담자·관리자는 넓은 정보 밀도를 위해 별도 React 웹을 사용한다.
- Expo Go Android 실기기 확인을 첫 완료 조건으로 둔다.

### Root replacement

- 기존 월별 플래너와 ASCII 영상 실험은 새 제품 도메인과 관련이 없어 루트에서 제거했다.
- React와 TypeScript 경험은 유지하되 npm workspaces 모노레포로 재구성했다.

### Privacy boundary

- 실제 학생 자료는 외부 AI로 보내지 않는다.
- 합성 자료에만 선택적으로 OpenAI OCR·STT를 사용한다.
- 실제 자료 외부 처리는 ZDR, 법률 검토, 동의 절차가 완료된 별도 결정 이후에만 연다.

### Durable processing status

- 화면은 분석 완료까지 막지 않는다.
- `processing_jobs`에 상태를 저장하고 완료된 결과부터 반영한다.
- Edge Function 제한을 넘는 부하는 별도 워커로 이전한다.

### Deletion lifecycle

- 학생 삭제 요청은 즉시 화면에서 숨긴다.
- 기본 7일 동안 복구 가능하며 이후 원본 파일과 사건 데이터를 제거한다.
- 원본 파일 제거가 성공한 뒤 구조화 데이터를 삭제한다.
- 기존 사건 감사 흔적은 제거하고 기관 범위의 삭제 행위와 시각만 남긴다.

### Database-enforced privacy boundary

- 학생이 생성하는 사건은 DB 정책에서 `synthetic=false`로 고정한다.
- 제출 이후 학생 수정은 화면 상태뿐 아니라 DB 트리거에서도 차단한다.
- FactBlock, 관계, 증거 메타데이터는 학생이 직접 수정하지 못한다.

### Connected demo fallback

- 공개 환경변수가 있으면 학생 앱과 직원 웹은 Supabase 연결 모드를 사용한다.
- 환경변수가 없으면 UI 검토를 위한 합성 데모 모드로 실행한다.
- 화면은 Supabase를 직접 호출하지 않고 `StudentApiClient`, `WebApiClient`를 통과한다.
- 모바일 파일 처리 상태는 사건 범위 Realtime 알림 뒤 REST로 다시 읽고, 네트워크 복구와 소켓 지연을 위해 짧은 polling fallback도 유지한다.

### Printable counselor summary

- 브라우저 인쇄용 요약은 현재 선택한 화면 탭과 분리한다.
- PDF에는 익명 식별자, FactBlock, 증거 목록, 확인 필요 항목만 포함한다.
- 상담자 내부 메모와 법률 판단 문구는 PDF에서 제외한다.

### Atomic administrative assignment

- 상담자 직접 가져오기와 관리자 배정은 별도 RPC로 분리한다.
- 관리자 재배정은 기존 활성 배정을 해제하고 새 배정을 기록하는 한 트랜잭션으로 처리한다.
- 기관 관리자는 자기 기관 사건과 자기 기관 상담자만 연결할 수 있다.

### Signed evidence preview

- 상담자 원본 미리보기와 다운로드는 짧은 수명의 Storage 서명 URL을 사용한다.
- 이미지·PDF·음성·영상은 브라우저 안에서 미리보고 일반 문서는 다운로드로 확인한다.

### Server-enforced upload policy

- 학생 제출 잠금은 메모뿐 아니라 새 증거 업로드 URL 발급에도 적용한다.
- Edge Function이 파일 크기와 선언 유형을 먼저 검사하고 DB 트리거가 기관별 파일 수·크기 한도를 다시 강제한다.
- DB 트리거는 사건 행을 잠가 동시 업로드 URL 요청이 파일 수 한도를 우회하지 못하게 한다.
- 모바일은 `expo-audio`로 길이를 읽을 수 있는 음성만 길이 메타데이터를 보낸다.
- 길이를 확인할 수 없거나 `15분`, `25MB` 기준을 넘는 음성은 외부 STT 대신 상담자 직접 확인으로 남긴다.
- 업로드 파일 확인을 위해 마이크 권한은 요청하지 않는다.

### FactBlock submission integrity

- `process-case`가 현재 메모의 SHA-256 해시를 사건에 기록한다.
- 메모가 바뀌면 DB 트리거가 분석 해시를 지워 기존 FactBlock 제출을 막는다.
- 제출은 `submit_case_record()` 트랜잭션 RPC에서 FactBlock 확인, 사건 잠금, 감사 로그를 한 번에 기록한다.
- 모바일도 FactBlock이 없거나 메모 수정 뒤 재분석이 필요하면 제출 버튼을 비활성화한다.

### Assigned counselor workflow

- 상담자는 활성 배정된 사건만 변경할 수 있다.
- 상담자가 사건을 가져오거나 관리자가 배정하면 `assigned`, 상담자가 검토 시작을 누르면 `in_review`, 검토 완료를 누르면 `completed`로 전이한다.
- 기관 관리자는 자기 기관의 학생·상담자 계정을 활성·비활성 전환할 수 있고 비활성 학생은 익명 ID 로그인이 차단된다.

### Direct REST least privilege

- 학생 프로필 조회는 본인으로 제한한다.
- 프로필 쓰기는 `admin-users`, 배정 쓰기는 `claim_case()`와 `assign_case()`, 직원 사건 상태 변경은 `staff-case-action` 경로만 사용한다.
- 직접 REST로 역할 승격, 배정 INSERT, 직원 사건 상태 PATCH, 학생 FactBlock-증거 연결 편집을 할 수 없도록 RLS 쓰기 정책을 닫는다.

### Institution lifecycle audit

- 플랫폼 기관 화면은 생성, 이름·지역 수정, 보관 처리, 재활성화를 제공한다.
- 기관 생성·수정·보관 처리는 감사 로그에 기록한다.

### Realtime with polling fallback

- 학생 앱은 `evidence_assets` Postgres Changes를 사건 범위로 구독한다.
- Realtime 알림은 화면 상태를 직접 덮어쓰지 않고 REST 재조회 신호로 사용한다.
- 앱 재개, 네트워크 복구, 소켓 지연에 대비해 짧은 polling을 fallback으로 유지한다.

### Retention purge worker

- 삭제 요청 복구 기간과 기관 보관 기간 만료는 `cases_ready_for_purge()`에서 함께 계산한다.
- 두 경로 모두 원본 Storage 제거가 성공한 뒤 구조화 데이터를 지운다.
- 감사 로그에는 기관 범위의 `case.purged` 또는 `case.retention_purged` 완료 기록 하나만 남긴다.
- `cases_ready_for_purge()`는 사건 행 잠금과 `purge_started_at` lease로 후보를 예약한다. 겹친 cron은 같은 사건을 처리하지 않고 중단된 lease는 `10분` 뒤 회수한다.
- Storage 제거 뒤 `finalize_case_purge()`가 사건·증거 감사 흔적 제거, 사건 삭제, 최소 감사 로그 생성을 한 트랜잭션으로 확정한다.

### Edge Function method boundary

- 각 Edge Function은 `OPTIONS` 외에 필요한 HTTP 메서드만 선언한다.
- 예상 밖 메서드는 인증이나 JSON 처리 전에 공통 `405` 응답으로 거절한다.
- 관리자 다중 동작 함수도 허용 목록을 두어 알 수 없는 메서드가 생성 동작으로 흘러가지 않게 한다.

### Expo Router monorepo bundling

- 모바일은 `babel-preset-expo`와 `expo/metro-config`를 명시한다.
- SDK 54 모노레포의 Metro·native 모듈 해석을 맞추기 위해 `autolinkingModuleResolution`을 활성화한다.
- npm이 `expo-router`를 모바일 워크스페이스 아래에만 둘 경우 Router Babel 자동 감지가 빗나갈 수 있으므로 SDK 54 preset의 Router 변환 플러그인을 Babel 설정에 명시한다.
- 웹의 React semver 범위와 호이스팅된 optional peer가 Expo 기준보다 높은 버전을 선택하지 않도록 웹·모바일 버전, 루트 툴링 `devDependencies`, npm `overrides`를 `react@19.1.0`으로 정확히 맞춘다.
- Android Metro export를 실기기 검증 전 로컬 통과 조건으로 둔다.

### Expo toolchain audit follow-up

- 현재 `npm audit`의 moderate 경고 14건은 Expo SDK 54 툴체인 전이 의존성에 연결된다.
- 자동 수정은 `expo@56.0.8`, `expo-router@56.2.8` 메이저 업그레이드를 요구한다.
- SDK 54 Expo Go 실기기 검증을 완료한 뒤 별도 업그레이드 작업에서 호환성을 다시 검증한다.

### Deployment preparation boundary

- Android 로컬 연결 스크립트는 LAN URL과 publishable key만 모바일 `.env.local`에 기록한다. 구형 CLI에서는 anon key로 fallback한다.
- hosted Supabase 기본 API 키는 자동 주입값을 우선 사용하고 로컬 개발에서는 modern key를 우선 선택하되 legacy key 환경변수를 fallback으로 허용한다.
- hosted custom secret 파일은 OpenAI 설정과 cron secret만 포함하며 git에서 무시한다.
- 배포 스크립트는 placeholder secret 또는 `synthetic_only`가 아닌 외부 AI 모드를 발견하면 실행하지 않는다.
- 재시도와 purge 예약은 Vault에 secret을 넣고 `pg_cron + pg_net`으로 Edge Function을 호출한다.

### Memo length and staff token renewal

- 학생 사건 메모는 모바일과 Postgres에서 함께 `1000자`로 제한한다.
- 상담자·관리자 웹의 API 계층은 토큰 만료 30초 전 refresh token을 사용한다.
- 동시에 여러 조회가 시작되어도 하나의 refresh 요청을 공유해 토큰 회전을 안정적으로 처리한다.
- 학생 앱도 polling과 Realtime 갱신이 겹칠 수 있으므로 동일하게 하나의 refresh 요청을 공유한다.

### Data-driven counselor relation map

- 상담자 관계도 연결선과 설명은 합성 화면 장식이 아니라 사건별 `RelationEdge`를 기준으로 렌더링한다.
- 상담자 사이드바 검색은 사건 코드와 익명 식별자 필터로 동작하게 유지한다.

### Local OpenAI stub boundary

- OpenAI 호출의 기본 endpoint는 공식 API로 고정한다.
- 로컬 Edge 단위 테스트만 서버 전용 `OPENAI_API_BASE_URL`을 주입해 합성 이미지 vision `input_image`, 합성 PDF `input_file`, 합성 음성 STT 요청·응답을 검증한다.
- hosted deploy secret 템플릿에는 endpoint override를 넣지 않는다.

### Defensive SecureStore draft parsing

- 학생 텍스트 초안은 한국어 UTF-8 바이트 크기를 기준으로 나눈 작은 청크로 기기 SecureStore에만 저장한다.
- 초안 복구 시 메모 길이, 현재 단계, 갱신 시각, 청크 개수를 검증한다.
- 손상되거나 불완전한 청크는 복구를 포기하고 삭제해 앱 진입을 유지한다.

### Windows CI alignment

- 저장소의 readiness와 로컬 Supabase 검증 스크립트는 Windows PowerShell을 사용한다.
- GitHub Actions 검증 runner도 `windows-latest`로 맞춰 로컬과 CI의 실행 계약을 일치시킨다.
- hosted smoke의 서명 다운로드 응답은 Windows PowerShell 버전에 따라 문자열 또는 바이트 배열일 수 있으므로 UTF-8 텍스트로 정규화한 뒤 비교한다.

### Best-effort device draft cleanup

- SecureStore 초안은 작성 복구를 돕지만 서버 사건 상태의 원장이 아니다.
- 자동 저장·복구 실패는 화면 진입을 중단하지 않는다.
- 서버 제출이 성공하면 기기 청크 삭제 실패와 무관하게 제출 완료 상태를 표시한다.

### Explicit private Storage verification

- 증거 원본은 private `case-evidence` bucket에 둔다.
- 통합 테스트는 익명 직접 객체 URL이 거절되는지 먼저 확인하고 권한 기반 서명 URL 성공을 별도로 확인한다.

### Active identity includes institution state

- 직원과 학생의 접근 가능 여부는 프로필 활성 상태와 기관 활성 상태를 함께 본다.
- 비활성화나 기관 보관 이전에 발급된 JWT가 남아 있어도 RLS와 서비스 키 기반 Edge Function에서 다시 활성 상태를 확인한다.
- 플랫폼 관리자는 기관 수명주기 운영을 위해 별도 전역 역할로 유지한다.
- 보관 기관에는 새 사용자 계정을 발급하지 않는다.

### Evidence retry cap verification

- 증거 처리 자동 재시도는 누적 시도 횟수가 `3` 미만인 실패 작업만 대상으로 한다.
- 통합 테스트는 2회차 재처리 성공뿐 아니라 `attempts=3` 작업이 다시 접수되지 않는 상태도 검증한다.

### Structured evidence is server-managed

- 상담자 웹은 FactBlock·사람·관계·증거·질문을 조회하지만 직접 REST로 변경하지 않는다.
- 구조화 결과와 증거 메타데이터는 서비스 역할 처리 경로에서만 변경한다.
- 학생 질문 수정은 본인 사건의 검토 단계 답변 필드로 제한한다.
- 메모 기반 재분석은 학생 본인 단계에만 열어 상담자가 학생 확인 전 구조화 결과를 덮어쓰지 못하게 한다.
- 삭제 예약 상태는 일반 재개방 작업으로 변경하지 않는다.

### Staff web rejects stale inactive sessions

- 직원 이메일 인증 성공만으로 웹 작업 공간을 열지 않는다.
- snapshot 구성 시 활성 프로필과 활성 기관을 확인하고 실패하면 로컬 직원 세션을 제거한다.
- 플랫폼 사용자 발급 UI에는 활성 기관만 선택지로 노출한다.

### Hosted demo bootstrap stays isolated

- `supabase db push`는 로컬 `seed.sql`을 hosted 프로젝트에 자동 적용하지 않으므로 합성 시연 bootstrap을 별도 명령으로 둔다.
- bootstrap은 격리된 시연 프로젝트에서 명시적 확인 플래그가 있을 때만 실행한다. 운영 데이터 프로젝트에는 적용하지 않는다.
- hosted 시연 비밀번호는 git 무시 파일에서 주입하고 공개 저장소의 로컬 기본 비밀번호를 치환한다.
- 합성 seed는 안정적인 ID와 `on conflict` 경계를 사용해 재실행 가능하게 유지한다.
- 고정 Auth 사용자는 `on conflict do update`로 비밀번호 해시를 갱신해 hosted 시연 비밀번호 교체 뒤 bootstrap 재실행이 회전 작업도 수행하게 한다.
- hosted smoke 검증은 공개 클라이언트 권한만 사용해 로그인, RLS, private Storage, 처리 접수, 삭제 예약 경계를 확인한다.

### Workspace dev options reach child CLIs

- 루트 `dev:mobile`과 `dev:web`은 npm workspace 명령 뒤에 `--` 전달 경계를 둔다.
- Android 실기기 준비에서 `--lan`, `--clear` 옵션이 중간 npm 명령에 소비되지 않고 Expo CLI까지 도달하게 한다.
- 웹 시연 실행에서도 `--host` 같은 Vite 옵션이 중간 npm 명령에 소비되지 않게 한다.
- Expo CLI가 자동 생성하는 `expo-env.d.ts`는 모바일 전용 `.gitignore`에 두고 소스로 관리하지 않는다.
- `verify:mobile:lan`은 공개 env 두 항목만 허용하고 LAN Supabase health와 Metro status를 확인한 뒤 Expo Go URL을 출력한다.

### Connected staff web local automation

- 직원 웹의 Supabase 연결 모드는 수동 환경 파일 복사 대신 `configure:web:local`로 재현한다.
- 설정 파일에는 로컬 Supabase URL과 publishable key만 기록하고 secret key, service role key, cron secret을 넣지 않는다. 구형 CLI에서는 anon key로 fallback한다.
- 반복 실행은 명시적 인자가 없으면 로컬 CLI status의 `PUBLISHABLE_KEY`, `ANON_KEY` 순으로 공개 키를 선택한다.
- `verify:web:local`은 공개 env 허용 목록, Supabase Auth health, Vite 진입 HTML을 검사한다.

### Android physical-device evidence record

- LAN readiness 통과와 Android Expo Go 상호작용 완료를 같은 것으로 취급하지 않는다.
- 실기기 검증은 기기·Expo Go 버전과 단계별 결과를 `docs/ANDROID_EXPO_GO_TEST_RECORD.md`에 남긴다.
- 제출 잠금뿐 아니라 상담자 재개방 뒤 학생 수정 가능 여부도 수동 흐름에서 확인한다.

### Student locked-case recovery

- 학생이 앱을 다시 열어도 최신 제출 사건을 새 초안으로 덮어쓰지 않고 잠금 화면으로 복원한다.
- 잠금 화면은 상담자 재개방 확인과 명시적인 새 기록 작성을 분리한다.
- SecureStore 복구 메모가 서버보다 최신이면 기존 FactBlock을 화면에서도 제출할 수 없게 하고 재분석을 요구한다.
- 서버와 동일한 메모의 SecureStore snapshot은 작성 단계 복구에 사용한다.
- 서버와 다른 메모의 snapshot은 `updatedAt`이 더 최신일 때만 복원한다. 오래된 기기 초안은 최신 서버 메모를 덮어쓰지 않게 정리한다.

### Discard incomplete evidence upload

- Storage PUT 전송 실패가 서버의 `queued` 메타데이터를 영구 잔류시키지 않게 `discard-evidence-upload` 경로를 둔다.
- 서버는 학생 소유, 편집 가능한 사건, `queued`, 처리 작업 부재를 증거 행 잠금 안에서 확인한 뒤 메타데이터를 먼저 숨기고 부분 객체와 예약을 제거한다.
- Storage 제거가 실패하면 숨김 예약을 취소한다. 처리 접수와 정리는 같은 증거 행 잠금을 사용해 이미 시작된 작업을 정리하지 않는다.
- 삭제된 예약의 파일 이름이나 내용은 감사 로그에 복제하지 않고 정리 행위와 증거 ID만 남긴다.

### Idempotent evidence processing reservation

- 동일한 증거 처리 요청이 네트워크 재시도나 사용자 중복 입력으로 반복되어도 `reserve_evidence_processing()`이 하나의 durable 작업만 만든다.
- 기존 작업이 있으면 같은 작업을 반환하고 워커를 다시 시작하지 않는다.
- 업로드 정리 예약과 처리 접수는 같은 증거 행을 잠가 먼저 확정된 작업만 진행한다.

### Recover interrupted evidence jobs

- `retry-failed-jobs`는 명시적으로 실패한 작업과 `10분` 넘게 멈춘 `queued`·`processing` 작업을 함께 회수한다.
- `reserve_retryable_evidence_jobs()`는 `for update skip locked`로 후보를 예약해 cron이 겹쳐도 같은 작업을 중복 실행하지 않는다.
- 자동 재시도는 기존처럼 최대 `3회`에서 멈춘다.

### Submission waits for evidence processing

- 학생은 증거 등록 직후 다음 단계로 이동할 수 있지만 `queued` 또는 `processing` 증거가 남아 있으면 제출하지 않는다.
- 모바일 확인 화면과 `submit_case_record()`가 같은 조건을 강제한다.
- 실패 또는 상담자 직접 확인 상태는 숨기지 않고 제출 기록에 남겨 상담자가 원본과 상태를 확인하게 한다.

### Internal worker RPCs stay private

- 처리 접수, 재시도 예약, 업로드 정리 시작·취소·완료, purge claim·해제·완료 RPC는 `PUBLIC`, `anon`, `authenticated` 실행 권한을 회수한다.
- 학생 JWT는 RPC를 직접 호출하지 못하며 학생 소유와 기관 활성 상태를 확인하는 Edge Function만 `service_role`로 호출한다.
- 통합 검증은 학생 JWT의 직접 RPC 우회를 거절하는지 확인한다.

### Evidence map renders stored links only

- 연결 웹 snapshot은 `fact_block_evidence`를 조회해 `FactBlock.evidenceIds`를 복원한다.
- 증거맵은 저장된 연결의 FactBlock 순번만 표시한다. 연결이 없는 증거는 `연결 확인`으로 남기며 배열 위치를 진술 번호처럼 사용하지 않는다.
- 상담자 화면의 선택 사건 코드와 소속 기관은 고정 문구가 아니라 현재 snapshot에서 렌더링한다.
- 검토 시작·재개방·완료 버튼은 현재 상담자에게 활성 배정된 사건에만 노출한다.

### Student confirms destructive deletion request

- 학생 삭제 요청은 즉시 숨김과 `7일` 뒤 원본 제거 영향을 설명하는 확인창을 거친다.
- 확인 뒤 요청 중에는 버튼을 잠가 중복 호출을 막는다.
- 다중 파일 선택은 파일별 업로드 실패를 격리해 한 파일 실패가 나머지 파일 등록을 중단하지 않게 한다.

### Role-scoped retention controls

- 기관 보관 정책 입력은 활성 기관이 정해진 기관 관리자 화면에만 노출한다.
- 플랫폼 관리자는 기관 수명주기를 운영하지만 대상 기관 선택 UI가 없는 상태에서는 보관 정책을 저장하지 않는다.
- 연결 snapshot은 로그인 사용자의 기관 ID와 일치하는 `institution_settings` 행만 화면 상태로 사용한다.

### Mobile action feedback stays local to the active step

- FactBlock 후보가 없거나 메모 재분석이 필요한 동안 분석 단계의 다음 버튼을 잠근다.
- 분석 실행 중에는 재분석 버튼을, 제출 실행 중에는 제출 버튼을 잠가 연속 탭이 중복 요청으로 이어지지 않게 한다.
- 공용 기본 버튼의 확장 스타일은 하단 단계 내비게이션에서만 적용한다. 로그인 카드와 제출 완료 화면의 버튼은 세로 공간을 임의로 채우지 않는다.

### Question answer drafts survive background refresh

- 질문 입력은 제어형 로컬 초안으로 즉시 화면에 반영한다.
- polling으로 서버 질문 목록을 다시 읽어도 같은 질문의 작성 중 답변은 보존하고 새 질문만 서버 답변으로 초기화한다.
- 입력 종료 시 연결 서버에 답변을 저장한다. 저장 오류가 발생해도 학생이 입력한 문장을 화면에서 지우지 않고 재시도를 안내한다.
- 질문 카드 안에 저장 중·저장 완료·실패 상태를 표시하고, 실패 상태에는 명시적인 다시 시도 버튼을 제공한다.
- 입력 변경과 저장 시작마다 질문별 저장 요청 버전을 올린다. 늦게 끝난 이전 요청의 성공·실패가 최신 문장의 저장 상태를 덮어쓰지 않게 한다.
- 메모 재분석을 시작하면 이전 질문 초안을 비워 새 FactBlock 질문에 오래된 답변을 재사용하지 않는다.

### Readiness accepts Windows checkout line endings

- Windows GitHub Actions checkout은 텍스트 파일을 `CRLF`로 materialize할 수 있다.
- 줄 전체를 검사하는 PowerShell 정규식은 선택적인 `\r`을 허용해 로컬 `LF`와 CI `CRLF`를 같은 계약으로 처리한다.
- CI에서만 발생하는 readiness 실패는 분리 Git worktree의 clean checkout으로 재현한다.

### Pin local Supabase CLI and prefer modern API keys

- Supabase CLI는 루트 devDependency의 정확한 버전으로 고정한다. CLI 버전이 달라지면 DB 초기 스키마와 Realtime·Storage 이미지가 함께 달라질 수 있다.
- 로컬 공개 env 생성과 통합 검증은 `PUBLISHABLE_KEY`를 먼저 사용하고 구형 CLI에서만 `ANON_KEY`로 fallback한다.
- 서버 권한 검증은 `SECRET_KEY`를 먼저 사용하고 구형 CLI에서만 `SERVICE_ROLE_KEY`로 fallback한다.
- `db reset` 뒤 기존 서비스 컨테이너와 새 DB 스키마가 섞여 Realtime subscription 등록이 실패하면 `npm.cmd run supabase:stop`, `npm.cmd run supabase:start`로 전체 로컬 스택을 다시 구성한다.
- `verify:local`은 `db reset` 직후 Auth와 Edge HTTP readiness를 기다리고 학생 로그인 Edge 호출을 제한된 횟수로 재시도한다. 컨테이너 내부 DNS가 안정화되는 짧은 구간을 제품 실패로 오인하지 않게 한다.
