# Android Expo Go 실기기 검증 기록

이 문서는 Android Expo Go 수동 검증 결과를 남기는 템플릿이다. 실제 학생 자료를 사용하지 않고 로컬 합성 seed만 사용한다.

## 실행 환경

| 항목 | 기록 |
| --- | --- |
| 검증 일시 | 자동 사전 확인: 2026-06-02, 실기기 수동 흐름: 미검증 |
| 검증자 | 미검증 |
| Android 기기·OS | 미검증 |
| Expo Go 버전 | 미검증 |
| 개발 PC LAN 주소 | 자동 확인: `172.30.1.87` |
| Expo Go URL | 자동 확인: `exp://172.30.1.87:8081` |
| 커밋 또는 작업트리 기준 | `cbcbe3a` |

## 사전 확인

```powershell
npm.cmd run supabase:start
npm.cmd run configure:mobile:lan
npm.cmd run dev:mobile -- --lan --clear
npm.cmd run verify:mobile:lan
```

`verify:mobile:lan`이 출력한 `expo_go_url`을 Android Expo Go에서 연다. 학생 계정은 합성 seed `WEE-24-0510`, 비밀번호 `demo1234`를 사용한다.

## 자동 사전 확인 결과

| 항목 | 결과 | 기록 |
| --- | --- | --- |
| Expo Doctor | 통과 | `18/18` |
| Android Metro export | 통과 | Hermes bundle `3.12 MB` |
| LAN Supabase Auth health | 통과 | `mobile_supabase_lan=ok` |
| Metro LAN status | 통과 | `expo_metro_lan=ok` |
| 공개 앱 키 경계 | 통과 | 로컬 `.env.local`은 `sb_publishable_` key를 사용하고 secret key를 포함하지 않음 |
| Android native config 사전 검사 | 통과 | Expo config 해석 결과 `allowBackup=false`, `softwareKeyboardLayoutMode=resize`, 녹음·마이크 권한 비활성 |

## 흐름 결과

| 단계 | 확인 내용 | 결과 | 관찰 기록 |
| --- | --- | --- | --- |
| 1 | 익명 ID와 비밀번호로 로그인, 키보드가 열린 작은 화면에서도 시작 버튼까지 스크롤 | 미검증 |  |
| 2 | 안전 안내 확인 뒤 사건 메모 작성, drag로 키보드 닫기 | 미검증 |  |
| 3 | 앱을 닫고 다시 열어 SecureStore 텍스트 초안·현재 단계 복구, 오래된 기기 초안의 서버 메모 덮어쓰기와 제출 뒤 초안 재생성 방지 | 미검증 |  |
| 4 | 이미지 또는 PDF 업로드 뒤 즉시 다음 단계 이동 | 미검증 |  |
| 5 | Realtime 또는 polling fallback으로 처리 상태 갱신 | 미검증 |  |
| 6 | 증거 대기·처리 중 확인 화면의 제출 버튼 잠금 | 미검증 |  |
| 7 | 누락 질문 답변 입력 즉시 표시, polling 중 입력 유지, 미저장 단계 이동 잠금, 실패 재시도·변경 취소와 FactBlock 후보 확인 | 미검증 |  |
| 8 | 분석 중 다음 이동·재분석 연속 탭 차단, 학생 확인 뒤 제출 중 버튼 잠금 | 미검증 |  |
| 9 | 제출 후 기록 잠금, 완료 화면의 재개방 확인·삭제 요청·새 기록 작성·처음 화면 버튼까지 세로 스크롤로 도달 | 미검증 |  |
| 10 | 앱을 다시 열어 제출 사건 잠금 화면 복원 | 미검증 |  |
| 11 | 상담자 웹 재개방 뒤 앱의 확인 버튼으로 학생 수정 가능 확인 | 미검증 |  |
| 12 | 잠금 화면에서 명시적으로 새 기록 작성 가능 확인 | 미검증 |  |
| 13 | 삭제 요청 영향 확인창에서 취소 후 유지, 확인 뒤 사건 즉시 숨김 | 미검증 |  |

## EAS Preview APK native 검증

Expo Go는 앱 JS 흐름을 확인하지만 EAS preview APK의 native manifest를 대신 증명하지 않는다. APK를 내려받은 뒤 다음 명령을 별도로 실행한다.

```powershell
npm.cmd run verify:android:apk -- -ApkPath C:\path\to\ieumlog-preview.apk
```

| 항목 | 결과 | 기록 |
| --- | --- | --- |
| Preview APK 경로 또는 EAS build URL | 미검증 |  |
| 패키지 ID `kr.ieumlog.student` | 미검증 |  |
| 앱 데이터 백업 비활성 | 미검증 |  |
| 키보드 `adjustResize` | 미검증 |  |
| `android.permission.RECORD_AUDIO` 부재 | 미검증 |  |

## 판정

- 전체 결과: `미검증`
- 재현이 필요한 문제:
- 비고:
