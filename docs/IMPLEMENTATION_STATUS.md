# 구현 상태

최종 갱신: 2026-06-03

## 완료

- npm workspaces 모노레포 전환
- 객체 지향 도메인 모델, 접근 정책, 규칙 분석기, 사건별 관계도·증거 연결을 포함한 합성 seed
- 상담자 웹: 관계도, 타임라인, 증거맵, 파일 유형별 미리보기·다운로드, 질문, 메모, 익명 PDF 인쇄 요약
- 상담자 웹 고도화: SVG 정밀 관계도, 명확한 화살표 시작·끝점, 간접 관계 점선, 노드 드래그 위치 저장, 노드·간선 포커스 사건철 모달
- 상담자 웹 연결 모드: 직원 Auth, RLS 사건 조회, 대기 사건 가져오기, 검토 시작, 재개방, 완료, 내부 메모, 로컬·클라우드 서명 미리보기·다운로드
- 관리자 웹: 현황, 사용자, 배정, 보관 정책, 감사 로그, 기관 CRUD
- 관리자 웹 연결 모드: 학생·상담자·기관 관리자 발급, 학생·상담자 활성 제어, 원자적 사건 배정·재배정, 기관 생성·이름·지역 수정·보관·재활성화, 기관 보관 기간 변경
- 관리자·상담자 웹 인계 코드: 학생 앱 코드 입력으로 사건 확인, 상담자 제출 대기 사건 원자 가져오기, 관리자 배정 하이라이트
- 학생 Expo 앱: 익명 ID 로그인 시연, 단계형 작성, 파일 선택, 처리 상태 배지, 분석, 질문, FactBlock 확인, 제출 잠금
- 학생 Expo 연결 모드: Auth 세션 복구, 실제 사건 초안, 제출 사건 잠금 복원, 상담자 재개방 확인, 명시적 새 기록 작성, Storage 업로드, 처리 상태 Realtime 구독과 polling fallback, 질문 답변, 제출
- 학생 Expo 제출 완료 화면: 1회용 관리자 전달 코드 생성, 만료 시각 표시, 복사, 삭제 요청 뒤 생성 차단
- 학생 Expo 음성 정책: `expo-audio` 길이 확인, 플레이어 즉시 해제, 불필요한 마이크 권한 차단
- 학생 Expo SDK 54 monorepo 번들 설정: `babel-preset-expo`, SDK 54 Router 변환 플러그인, `expo/metro-config`, `autolinkingModuleResolution`, 웹·모바일 React와 루트 툴링·npm `overrides`의 `19.1.0` 정렬
- 학생 삭제 요청 UI: 즉시 숨김과 7일 purge 예약 RPC
- Expo `SecureStore` 기반 텍스트 초안 복구
- Supabase 마이그레이션: Auth profile, 기관, 사건, 증거, 질문, 작업, 감사 로그, RLS, Storage, `evidence_assets` Realtime publication
- Edge Functions: 학생 로그인, 사용자·기관 관리, 증거 URL, 원자적 불완전 업로드 예약 정리, 중복 접수를 병합하는 처리 작업 예약, 실패·중단 작업 원자 재접수와 최대 3회 상한, lease 기반 원자 삭제 purge, 명시적 HTTP 메서드 경계
- Edge Functions: 인계 코드 생성·redeem, 관계도 위치 저장, pepper 기반 코드 해시, 원자 redeem RPC
- 배포 준비 자동화: Android LAN env 생성, hosted Supabase DB·secret·Function 배포, readiness 검사, Vault 기반 cron 등록 템플릿
- 격리 hosted 합성 시연 자동화: 임의 비밀번호 주입 bootstrap, 재실행 가능한 seed, anon 범위 smoke 검증
- hosted private Storage smoke의 Windows PowerShell 문자열·UTF-8 바이트 배열 응답 호환
- 로컬 Supabase 연결 직원 웹 공개 env 생성과 Auth health·Vite HTML readiness 검사
- Android Expo Go 실기기 단계별 결과를 남기는 검증 기록 템플릿
- Vercel Vite 빌드·출력·SPA rewrite와 EAS Android APK·App Bundle 프로필

## 로컬 검증 완료

- Docker 기반 `npx supabase db reset`
- 합성 seed 관계도 노드 5개, 간선 4개, FactBlock-증거 연결 3개
- 합성 seed 두 번째 적용 뒤 질문·감사 로그·관계 데이터 중복 없음
- 합성 seed의 임시 hosted형 비밀번호 회전과 로컬 기본 비밀번호 복원 검증
- 학생 익명 ID 로그인과 Auth 세션 발급
- Edge Function별 예상 밖 HTTP 메서드 `405` 차단
- 학생 사건의 `evidence_assets` Realtime UPDATE 수신과 소켓 정리
- 기관 간 RLS 격리와 담당자 가져오기 충돌 차단
- 기관 관리자 원자 재배정, 이전 배정 해제, 기관 간 상담자 연결 차단
- 상담자 `assigned → in_review → completed`, 미배정 상담자 변경 차단, 비활성 학생 로그인 차단
- 제출 후 학생 업로드 차단, 파일 크기·유형 위조 차단, DB 기반 51번째 파일 경쟁 차단
- 부분 Storage PUT 뒤 접수 대기 업로드 숨김 예약, Storage 객체·메타데이터 제거, 최소 감사 로그
- 같은 증거 처리 접수 병합과 처리 예약 뒤 업로드 정리 차단
- 대기·처리 중 증거가 남은 사건의 모바일 제출 버튼과 DB 제출 RPC 차단
- 학생 JWT의 서비스 역할 전용 증거 예약·purge 후보 RPC 직접 호출 차단
- 학생 사건의 `synthetic=false` 강제와 제출 후 수정 잠금
- Storage 서명 URL 업로드·다운로드
- private Storage 원본 객체 URL의 익명 직접 접근 차단
- 비활성 상담자의 기존 JWT를 사용한 RLS 조회와 Edge Function 작업 차단
- 보관 기관 관리자 기존 JWT의 Edge Function 작업과 보관 기관 학생 로그인 차단
- 보관 기관 신규 사용자 발급 차단과 증거 처리 `3회` 재시도 상한 검증
- 동시 재시도 cron 병합과 `10분` 넘게 멈춘 처리 작업 회수
- 상담자 직접 REST 구조화 데이터 변조 차단과 학생 본인 검토 질문 답변 저장 검증
- 담당 상담자의 학생 메모 재분석 차단과 삭제 예약 사건의 일반 재개방 차단
- 합성 fallback 분석 작업의 접수, 완료, 시도 횟수 기록
- 규칙 기반 `process-case` FactBlock 후보와 누락 질문 생성
- 원자적 `submit-case` FactBlock 확인, 제출 잠금, 감사 기록
- 분석 메모 SHA-256 해시, 메모 수정 시 stale FactBlock 제출 차단, 재분석 후 제출
- 상담자 이메일 로그인, 기관 범위 사건 조회, 내부 메모 감사 기록, 학생 기록 재개방
- 서비스 역할 내부 상태 변경과 학생 전용 DB 보호 트리거의 분리
- 플랫폼 관리자 기관 생성·비활성화, 기관 관리자 발급, 기관 관리자 학생 발급, 보관 기간 변경
- 삭제 요청 즉시 숨김과 7일 purge 예약
- purge secret 경계, 원본 Storage 제거, 구조화 데이터 삭제, 최소 감사 기록 보존
- purge 중복 claim 차단, `10분` 지난 중단 lease 회수, 사건·증거 감사 흔적 트랜잭션 축소
- 기관별 보관 기간 만료 사건의 원본 Storage 제거, 구조화 데이터 삭제, 최소 감사 기록 보존
- 길이 미확인 음성의 외부 STT 차단과 상담자 직접 확인 전환
- 실제 학생 이미지의 외부 AI 차단과 실패 작업 secret 기반 재시도
- 학생 본인 외 프로필 조회, 직접 역할 승격, 배정 INSERT, 직원 상태 PATCH, 학생 FactBlock-증거 연결 편집 차단
- 플랫폼 기관 생성·수정·보관 처리와 감사 로그
- 도메인 테스트, TypeScript 검사, 웹 프로덕션 빌드, Expo 의존성 검사
- Android Metro export와 Hermes 번들 생성
- Expo Doctor `18/18` 검사 통과
- headless Chrome 역할 선택, 상담자 관계도·증거 미리보기, 플랫폼 관리자 현황·기관 관리 렌더와 탭 전환 확인
- 로컬 Supabase 연결 headless Chrome 상담자 이메일 Auth·RLS 데이터·인쇄 요약과 플랫폼 관리자 Auth·기관 화면 확인
- 배포 readiness 검사: Edge Function manifest·JWT 경계, 공개 env secret 차단, hosted secret 템플릿, EAS, Vercel, cron, Supabase 신규 키 호환성, private env git 경계

## 클라우드 연결 후 확인

- Expo SDK 56 업그레이드 호환성 검토와 `npm audit` moderate 14건 해소
- 실제 Supabase 프로젝트 secrets 등록
- OpenAI 키를 사용하는 합성 OCR·STT 실제 API 통합 테스트
- hosted SQL editor에서 실패 작업 재시도 cron과 삭제 purge cron 실제 등록
- Vercel 웹 연결과 EAS Android preview build
- Android Expo Go 실기기 흐름 검증

## 운영 전 차단 조건

- 실제 학생 자료 외부 AI 전송 금지
- ZDR 승인, 법률 검토, 보호자·기관 동의, 연령별 고지, 위험 상황 escalation 절차 필요
- 운영 규모의 장기 OCR·STT는 별도 durable worker 검토 필요

## 2026-06-01 후속 보완

- 학생 사건 메모 `1000자` 한도를 모바일 입력과 Postgres 제약에 함께 적용
- DB 메모 초과 입력 차단 통합 테스트 추가
- 상담자·관리자 웹의 만료 직전 세션 갱신과 동시 refresh 요청 공유 처리 추가
- 학생 앱의 polling·Realtime 동시 요청도 단일 refresh 요청을 공유하고 손상된 SecureStore 세션을 정리
- Supabase refresh token 재발급 뒤 갱신된 상담자 세션으로 웹 흐름 통합 검증
- 상담자 사건 검색 필터와 사건별 `RelationEdge` 기반 관계도 연결·설명 렌더링
- 합성 이미지 vision `input_image`, PDF `input_file`, 음성 STT 요청 형식과 stub 응답 반영, 실제 학생 자료 fetch 차단을 검증하는 Edge 단위 테스트
- hosted 배포 secret에 OpenAI endpoint override가 들어오면 거절하는 배포 경계
- PowerShell 기반 readiness를 실제 실행할 수 있도록 GitHub Actions runner를 `windows-latest`로 정렬하고 CI 계약 검사 추가
- SecureStore 자동 저장·복구·제출 후 정리를 서버 제출 상태와 분리한 모바일 best-effort 오류 경계
- SecureStore 초안의 UTF-8 바이트 청크 순수 직렬화 계층과 손상·누락·초과 데이터 방어 테스트
- 직원 웹 snapshot의 활성 프로필·기관 검사, 실패 시 로컬 세션 제거, 보관 기관 사용자 발급 선택지 제외
- `supabase db push`와 분리된 hosted 합성 demo bootstrap, 로컬 비밀번호 치환, private env 경계, hosted smoke 스크립트
- hosted 합성 bootstrap 재실행 시 고정 가상 Auth 계정 비밀번호 해시 회전
- Android Expo Go LAN 공개 env 생성 확인과 루트 `dev:mobile` Expo 옵션 전달 경계
- 루트 `dev:web`의 Vite 옵션 전달 경계
- Expo CLI 생성 `expo-env.d.ts`를 제외하는 모바일 전용 `.gitignore`
- 공개 env 허용 목록, LAN Supabase health, Metro status와 Expo Go URL을 확인하는 `verify:mobile:lan`
- 공개 env 허용 목록, 로컬 Supabase health, Vite HTML을 확인하는 `configure:web:local`, `verify:web:local`
- headless Chrome seed 로그인으로 상담자 FactBlock 증거 연결, 기관 관리자 보관 정책, 플랫폼 관리자 역할 메뉴를 검사하고 성공·실패 화면 이미지를 남기는 `verify:web:ui-local`
- 기관 관리자 보관 정책 입력의 grid 넘침 방지, 좁은 화면 한 열 배치, `390px` viewport 자동 검증
- 모바일 로그인·제출 완료 화면의 작은 화면 스크롤, 작성 화면 keyboard dismiss·회피, Android `resize` 키보드 레이아웃
- 민감 학생 기록을 위한 Android 앱 데이터 백업 비활성화
- Expo config readiness의 Android 백업·키보드 레이아웃·녹음·마이크 권한 비활성 계약
- EAS preview APK의 native manifest 패키지 ID·백업 비활성·키보드 resize·녹음 권한 부재를 검사하는 `verify:android:apk`
- 제출 사건 잠금 복원·재개방·새 기록 분기와 복구 초안 재분석 잠금을 분리한 모바일 상태 정책 테스트
- 동일 메모 단계 복구와 최신 기기 메모 복원을 유지하면서 오래된 SecureStore 메모의 서버 덮어쓰기를 막는 시간 비교 정책
- polling 갱신 중에도 작성 중 누락 질문 답변을 유지하고 사라진 질문 초안을 정리하는 모바일 로컬 답변 병합 정책
- 질문별 저장 상태와 카드 내 재시도 버튼, 늦게 완료된 이전 요청 결과를 무시하는 모바일 저장 버전 경계
- 미저장 질문의 단계 이동·제출 잠금, 실패 답변의 재시도·서버 값 복원, 서버 메모 PATCH와 SecureStore write·clear 순서를 보장하는 `MemoUpdateQueue`
- clean checkout readiness에서 `MemoUpdateQueue` 테스트 등록, API 큐 대기, 질문 잠금, SecureStore 큐, 동기 제출 ref, 키보드 완료 저장 계약 확인
- 업로드 정리와 처리 접수가 같은 증거 행 잠금을 공유하고 중복 처리 요청을 한 durable 작업으로 병합하는 DB 예약 경계
- 실패 작업과 `10분` 넘게 멈춘 `queued`·`processing` 작업을 `for update skip locked`로 회수하는 원자적 재시도 예약
- 대기·처리 중 증거가 남은 사건 제출을 모바일 정책과 DB RPC에서 함께 차단
- 내부 worker RPC의 `PUBLIC`·`anon`·`authenticated` 실행 권한 회수와 학생 JWT 직접 호출 우회 차단 검증
- purge claim·해제·완료 RPC와 `purge_started_at` lease를 사용한 동시 cron 병합 및 트랜잭션 완료
- Supabase CLI `2.103.0` 정확 버전 고정, 로컬 공개 `PUBLISHABLE_KEY` 우선 선택, 서버 `SECRET_KEY` 우선 선택과 legacy key fallback
- `db reset` 뒤 구형 Realtime 컨테이너가 남는 혼합 스택을 `supabase:stop`·`supabase:start`로 재구성하는 복구 절차
- `db reset` 직후 Auth·Edge readiness 대기와 Edge 내부 DNS 안정화 구간의 제한된 학생 로그인 재시도
- 고정 CLI 스택에서 Realtime subscription 등록, publishable key LAN·웹 공개 env 생성, purge lease 포함 전체 `verify:local` 재검증
- 연결 웹 snapshot의 `fact_block_evidence` 복원과 저장된 FactBlock 연결만 표시하는 증거맵
- 상담자 선택 사건 코드·소속 기관 동적 표시, 활성 배정 사건에 한정한 검토·재개방·완료 액션
- 원격 보관 정책 snapshot 갱신을 입력에 반영하는 관리자 폼 동기화
- 학생 삭제 요청 영향 확인창과 중복 요청 잠금, 다중 파일 업로드의 파일별 실패 격리
- 기관 관리자 전용 보관 정책 메뉴와 활성 기관 ID 기준 snapshot 선택
- 연결 없는 증거에 임의 진술 번호를 만들지 않는 웹 순수 유틸리티 테스트
- FactBlock 준비 전 분석 단계 이동 차단, 분석·제출 중 버튼 잠금, 하단 내비게이션 전용 기본 버튼 확장 스타일
- GitHub Windows clean checkout의 `CRLF`에서도 Expo 생성 타입 파일 ignore 계약을 통과하는 readiness 정규식
