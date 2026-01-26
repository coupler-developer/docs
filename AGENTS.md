# 🚀 Git Flow (태그 기반 버전)

## 🌿 기본 브랜치 구조

- **`main`** → 모든 기능/문서/버그 브랜치가 PR로 합쳐지는 단일 기준 브랜치 (배포 및 태깅)
- **`develop`** → 빈 껍데기처럼 유지하는 임시 실험 브랜치 (필요 시만 사용, main 병합 금지)
- **`feature/*` · `docs/*` · `fix/*`** → 작업 단위별 말단 브랜치

📌 별도의 `release/*`, `hotfix/*` 브랜치는 없습니다.

→ 모든 배포/패치는 **main에 병합한 뒤 태그(`v1.2.0`, `v1.2.1`)** 로 기록합니다.

---

## 🧩 간단한 흐름 요약

```text
 feature/*   docs/*    fix/*
     \          |        /
      \         |       /
       '------> main ------------------> (배포 + 태그)
                   ^
                 tag: v1.2.0 / v1.2.1

 develop (optional sandbox, not merged)
```

---

## 🔁 동작 원리 요약

| 단계        | 작업                              | 브랜치 흐름               | 결과              |
| ----------- | --------------------------------- | ------------------------- | ----------------- |
| ① 작업 생성 | 기능/문서/버그 단위로 브랜치 생성 | `main`에서 `feature/*` 등 | 개발 진행         |
| ② PR 생성   | 코드 리뷰 및 QA                   | `feature/* → main`        | 변경 승인         |
| ③ 병합/태그 | main 병합 후 버전 태그            | `main` + `tag v1.2.0`     | Release 표시      |
| ④ 긴급 수정 | 직접 수정 브랜치 생성 → main 병합 | `fix/* → main`            | `v1.2.x (Hotfix)` |

---

## 💡 이렇게 생각하면 쉬워요

- **브랜치는 작업 단위(기능/문서/버그)**,
- **태그는 main 배포 시점의 버전 기록.**

즉,

> “main에서 브랜치 파생 → 작업/PR → main으로 병합 → 태그로 버전 표시”

---

## 🧱 브랜치 이름 규칙

- 말단 브랜치는 **타입/담당자/주제** 형식으로 작성합니다.
  - `feature/박성빈/간편가입`
  - `docs/김민식/브랜치전략`
  - `fix/박성빈/핫픽스-로그인`

---

## 🧾 커밋 메시지 가이드

- [규칙](https://www.conventionalcommits.org/ko/v1.0.0/)
- 한글로 작성

### fix 브렌치의 경우

- 제목은 한 줄 요약(예: `fix: 회원가입 선호정보 예외 처리`)으로 작성합니다.
- 본문에는 반드시 **원인**과 **해결**을 명시합니다.

  ```markdown
  - 원인: GlobalState.setting.best_favor 로드 전 find() 결과가 undefined라 .name 접근 시 오류 발생
  - 해결: find() 결과가 없을 때 선택 안내 문구로 대체하고 널 가드 추가
  ```

- 여러 변경이 포함되면 항목별로 `원인:`/`해결:` 쌍을 나눠 적어 리뷰어가 흐름을 바로 파악할 수 있게 합니다.

### fix 브렌치가 아닌 경우

- 위 **원인/해결 본문 강제 규칙은 적용하지 않습니다**.
- 일반적인 [Conventional Commits] 규칙에 맞춰 제목만 작성하거나, 필요 시 간단한 본문을 추가합니다.

---

## 📦 레포지토리 요약

- **`coupler-admin-web`**: CRA 기반 어드민 프론트엔드. `npm start`(포트 8000)로 개발 서버를 띄우며 MobX 상태 관리와 Chart.js, DataTables 등을 활용해 운영 지표와 회원 관리 UI를 제공합니다.
- **`coupler-api`**: Express + MySQL 백엔드. `app.js` 진입점에서 REST API와 다국어(i18n)/Firebase Admin 연동을 제공하며, README에 정리된 다수의 cron 엔드포인트로 매칭·알림·정리 작업을 자동화합니다.
- **`coupler-mobile-app`**: React Native 클라이언트. CodePush 스크립트로 스테이징/프로덕션 배포를 지원하고 Agora, Notifee, Kakao 연동 등 다양한 네이티브 모듈을 포함합니다. README에 명시된 iOS/Android별 빌드 패치가 필요합니다.

## coupler-mobile-app to-be 아키텍처

### 폴더/네이밍 가이드

- 정의: 도메인 = `src/screens/` 최상위 기능 묶음(`auth`, `signup` 등, `shared` 제외), 화면 = 네비게이션 대상 `*Screen` 파일, Step = 화면 내부 플로우 단계 컴포넌트(`*Step*`).
- 이 변경은 반드시 승인을 받고만 진행한다. TypeScript 전환 전제: 신규/수정 파일은 `.ts/.tsx` 우선, 기존 `.js/.jsx`는 점진 전환한다.
- 구조: `src/screens/`에는 `shared/`와 도메인 폴더만 둔다. `src/screens/<도메인>/` 아래는 `<화면>Screen`과 동일 접두 파일(`<화면>*.ts`/`.js`), `shared/`만 허용한다. `<화면>/` 폴더는 만들지 않는다.
- 라우팅 대상: `src/screens/<도메인>/<화면>Screen` 또는 `src/screens/shared/<화면>Screen`만 허용한다.
- 화면 전용 코드는 같은 레벨 `src/screens/<도메인>/<화면>*.ts`/`.js`로 둔다(전역 화면은 `src/screens/shared/<화면>*.ts`/`.js`).
- Step 규칙: 화면 전용 Step은 `src/screens/<도메인>/<화면>Step*.ts`/`.tsx`에 둔다. 도메인 공용 Step은 `src/screens/<도메인>/shared/steps/`, 도메인 간 공용은 Step 대신 공용 컴포넌트로 승격한다. Step은 라우터 등록 금지, 화면 내부 단계는 `*Section`/`*Block`/`*Panel` 사용, `fragment`/`*Fragment*` 금지. 레거시 Step 라우트는 to-be 전환 시 제거/리네이밍 대상으로 보고 신규 추가는 금지한다.
- 승격 기준: 화면 전용 → 도메인 `shared` → 전역. 전역 UI는 `src/components/common/`, 전역 로직은 `src/api`/`src/stores`/`src/utils`/`src/constants`/`src/hooks`, 리소스는 `src/assets/`.
- 용어 기준: `common`은 전역 공용, `shared`는 도메인 내부 공용만 의미한다. `src/screens/shared/`는 라우팅 전용으로만 사용하고, 컴포넌트는 두지 않는다.
- 상수: 화면 전용은 `src/screens/<도메인>/<화면>Constants.ts`/`.js`, 도메인 공용은 `src/screens/<도메인>/shared/constants/`, 전역은 `src/constants/`.
- Card는 “화면 일부 재사용 블록”에만 사용하고, 화면 레이아웃을 포함하면 `*ScreenContent`/`*Panel`로 이름을 올린다.

### coupler-mobile-app 예시 폴더 구조 (to-be)

```text
src/
  api/                 # 전역 공용 통신, 외부 연동
  assets/              # 이미지, 폰트 등 리소스
  components/
    common/            # 전역 재사용 UI
  constants/           # 전역 상수
  hooks/               # 전역 공용 hooks
  navigation/          # 라우터/네비게이션 설정
  screens/
    shared/
      <화면>Screen.tsx
      <화면>Styles.ts
    <도메인>/
      <화면>Screen.tsx
      <화면>Step1.tsx
      <화면>Constants.ts
      shared/
        components/
        hooks/
        utils/
        constants/
        steps/
  stores/              # 전역 상태
  utils/               # 전역 유틸
```

### Navigation

- `navigation/` 아래에 Root Stack, Tab Navigator, 각 탭의 Stack Navigator를 함께 둔다.
- Root Stack은 인증 흐름(Auth)과 Main Tab을 분리해 관리한다.
- Tab은 메인 하단 탭(매칭/채팅/스퀘어/설정), 각 탭은 전용 Stack으로 상세 화면을 관리한다.
- 탭 루트 화면은 해당 탭 Stack의 루트로만 둔다(동일 화면을 RootStack에 중복 등록하지 않는다).
- 하단 탭이 필요한 화면은 Tab Navigator를 통해 진입한다(탭 지정 네비게이션).

## 회원가입 플로우 메모

- 기본정보 제출 → 기본정보 심사 대기(회원 전).
- 기본정보 승인 시: 일반회원(매칭 불가). 필수 인증서류 제출/심사 단계 진입.
- 인증서류 승인 시: 준회원(매칭 불가). 소개글 입력/심사 필요.
- 소개글 승인 시: 정회원(매칭 가능).

## ✅ 회원 심사 상태 머신 설계 (최종안)

### 용어/데이터 정의

- **회원 상태**: `user.status` (PENDING/NORMAL/HOLD/BLOCK/LEAVE)
- **회원 등급**: 심사 단계에 따라 표시되는 서비스 단계(회원 전/일반/준/정). `pending_stage`로 결정하며 `user.status`는 단계 유효성 검증에만 사용한다.
- **회원 등급 명칭 기준**: 회원 전/일반회원/준회원/정회원으로 통일하며, 정회원은 매칭 가능 상태만 의미한다.
- **반려/재심사 상태 등급 표기**: 정회원 프로필정보 변경 요청 심사 제외, `pending_stage` 기준으로 회원 전/일반/준 중 하나로 표기한다.
- **심사 상태**: `pending_status`
  - BASIC_INFO_REVIEW, EDIT_NEED, REAPPLY, REQUIRED_AUTH_REVIEW,
    INTRO_REVIEW, COMPLETE, REJECT
- **심사 단계 파생**
  - `pending_stage`는 `pending_status` + 심사 아이템 상태 + `user.status`로 계산하는 파생값
- **리스트 표시용 상태 타깃**: `pending_status_display_targets` (배열, 어드민 목록 상태 열 표시 전용)
  - 값은 `pending_stage` 값 중 BASIC_INFO/REQUIRED_AUTH/INTRO(`basic_info/required_auth/intro`)만 사용한다.
  - `pending_status_display_state=pending`이면 인증서류/소개글 심사 아이템 중 PENDING이 있는 타깃을 추가한다.
  - `pending_status_display_state=edit_need`이면 인증서류/소개글 심사 아이템 중 RETURN이 있는 타깃을 추가한다.
  - `pending_status_display_state=reapply`이면 인증서류/소개글 심사 아이템 중 REAPPLY가 있는 타깃을 추가한다.
  - 위 조건에 해당 타깃이 없으면 PENDING/REAPPLY/RETURN 전체 기준으로 타깃을 다시 계산한다.
  - 최종 타깃이 없으면 BASIC_INFO로 표기한다.
- **리스트 표시용 상태 결과**: `pending_status_display_state` (문자열, 어드민 목록 상태 열 표시 전용)
  - 값은 `pending`/`edit_need`/`reapply` 중 하나다.
  - `pending_status=EDIT_NEED/REAPPLY`이면 그대로 사용한다.
  - `pending_status=INTRO_REVIEW`일 때는 소개글 심사 아이템 상태로 판단한다.
- **심사 아이템 상태**
  - 프로필 심사(`t_member_pending`): PENDING/REAPPLY/RETURN/NORMAL
  - 인증서류(`t_member_auth`): PENDING/REAPPLY/RETURN/NORMAL
- **모바일 인증서류 아이템 상태(ITEM_PENDING_STATUS)**: WAIT(심사대기), RETURN(반려), RE_WAIT(재심사 요청), COMPLETE(승인), ADD(임시추가)
- **인증서류 아이템 상태 매핑(서버↔모바일)**:
  - `STATUS.PENDING` ↔ `ITEM_PENDING_STATUS.WAIT`
  - `STATUS.RETURN` ↔ `ITEM_PENDING_STATUS.RETURN`
  - `STATUS.REAPPLY` ↔ `ITEM_PENDING_STATUS.RE_WAIT`
  - `STATUS.NORMAL` ↔ `ITEM_PENDING_STATUS.COMPLETE`
- **소개글 카테고리**: `about_me`, `appeal_extra`, `intro`
  - `appeal_extra`는 비심사 항목으로 저장만 하며, 심사 단계/상태 계산에 포함하지 않는다.
- **기본정보 문제 없음**
  - 소개글 카테고리 제외, `instagram_id/youtube_id/sns_id` 제외
  - 해당 항목의 심사 아이템에 PENDING/REAPPLY/REJECT 없음
- **인증서류 문제 없음**
  - `manager_required_auth_types` 기준으로 PENDING/REAPPLY/REJECT 없음
  - 매니저 필수 인증 미설정은 **오류**로 처리(심사 진행 금지)
- **소개글 완료 조건**
  - `about_me/appeal_extra/intro` 값이 모두 존재
  - 소개글 카테고리의 심사 아이템에 PENDING/REAPPLY/REJECT 없음
- **심사 단계(`pending_stage`)**: BASIC_INFO / REQUIRED_AUTH / INTRO / PROFILE_CHANGE / COMPLETE
- **프로필정보 변경 요청 심사 구분**: 프로필정보 변경 요청은 `pending_stage=PROFILE_CHANGE`로만 구분하며, `pending_status`는 BASIC_INFO_REVIEW/EDIT_NEED/REAPPLY를 그대로 사용한다.
- **프로필정보 변경 심사 상태 범위**: PROFILE_CHANGE에는 REJECT/COMPLETE를 사용하지 않는다.
- **프로필정보 변경 심사 대상**: 소개글을 제외한 기본정보 항목만 심사하며, 매칭은 유지한다.
- **단계/상태 역할 분리**: 단계 판별은 `pending_stage`로만 하며, `pending_status`는 해당 단계의 심사 상태(심사중/반려/재심사/완료/거절)만 의미한다.
- **불일치 금지**: 서버가 `pending_stage`를 계산하며, `pending_stage`와 `pending_status` 조합이 허용되지 않으면 오류로 처리한다.
- **허용 조합(불변)**:
  - `user.status=PENDING` + `pending_stage=BASIC_INFO` → `pending_status=BASIC_INFO_REVIEW/EDIT_NEED/REAPPLY/REJECT`
  - `user.status=PENDING` + `pending_stage=REQUIRED_AUTH` → `pending_status=REQUIRED_AUTH_REVIEW/EDIT_NEED/REAPPLY`
  - `user.status=NORMAL` + `pending_stage=INTRO` → `pending_status=INTRO_REVIEW/EDIT_NEED/REAPPLY`
  - `user.status=NORMAL` + `pending_stage=PROFILE_CHANGE` → `pending_status=BASIC_INFO_REVIEW/EDIT_NEED/REAPPLY`
  - `user.status=NORMAL` + `pending_stage=COMPLETE` → `pending_status=COMPLETE`
- **회원 등급(표기)**
  - **회원 전**: `status=PENDING` + `pending_stage=BASIC_INFO`
  - **일반회원(매칭 불가)**: `status=PENDING` + `pending_stage=REQUIRED_AUTH`
  - **준회원(매칭 불가)**: `status=NORMAL` + `pending_stage=INTRO`
  - **정회원(매칭 가능)**: `status=NORMAL` + `pending_stage=COMPLETE`
  - **정회원(매칭 가능 유지, 프로필정보 변경 요청 심사 중)**: `status=NORMAL` + `pending_stage=PROFILE_CHANGE`

### 승급 조건 및 제출 가능 범위

- **일반회원**: 기본정보 심사 승인 후에만 **준회원 승급(인증서류 제출) 화면**을 볼 수 있다.
- **준회원/정회원**: 인증서류/소개글 제출 가능(반려 시 재제출).

### 상수 값 기준

- 필드명은 `user.status`, `pending_status`, `pending_stage` 그대로 유지한다.
- 변경/정비 대상은 **필드명이 아니라 상수 값 정의와 의미**다.
- 상수명은 레거시 명칭이 포함되어도 **현재 단계 기준 의미**로 해석한다.

#### 상수명 정의

- **`user.status`(회원 상태)**: `USER_STATUS.*` 사용
  - `USER_STATUS.PENDING`(심사중)
  - `USER_STATUS.NORMAL`(정상)
  - `USER_STATUS.HOLD`(홀딩)
  - `USER_STATUS.BLOCK`(차단)
  - `USER_STATUS.LEAVE`(탈퇴)
- **`pending_status`(심사 상태)**: `PENDING_STATUS.*` 사용
  - `PENDING_STATUS.BASIC_INFO_REVIEW`(회원 전 기본정보 심사중)
  - `PENDING_STATUS.EDIT_NEED`(심사반려·수정필요)
  - `PENDING_STATUS.REAPPLY`(심사반려·재심사요청)
  - `PENDING_STATUS.REQUIRED_AUTH_REVIEW`(일반회원 인증서류 심사 단계)
  - `PENDING_STATUS.INTRO_REVIEW`(준회원 소개글 심사 단계, 매칭 불가)
  - `PENDING_STATUS.COMPLETE`(정회원·매칭가능)
  - `PENDING_STATUS.REJECT`(심사거절, 최초 심사 전용)
- **`pending_stage`(심사 단계)**: `PENDING_STAGE.*` 사용
  - `PENDING_STAGE.BASIC_INFO`(회원 전 기본정보 심사 단계)
  - `PENDING_STAGE.REQUIRED_AUTH`(일반회원 인증서류 심사 단계)
  - `PENDING_STAGE.INTRO`(준회원 소개글 심사 단계)
  - `PENDING_STAGE.PROFILE_CHANGE`(정회원 프로필정보 변경 요청 심사 단계)
  - `PENDING_STAGE.COMPLETE`(정회원 완료)
- **심사 아이템 상태(`STATUS`)**: `STATUS.*` 사용
  - `STATUS.PENDING`(심사대기)
  - `STATUS.REAPPLY`(재심사요청)
  - `STATUS.RETURN`(심사반려)
  - `STATUS.NORMAL`(승인완료)

### 단일 소스 오브 트루스

- 서버가 `pending_stage`를 계산해 내려주고,
  모바일은 이를 그대로 화면에 매핑한다.
- 클라이언트/어드민은 **상태 계산 로직을 중복 구현하지 않는다**.
- 예외: **모바일 심사 거절 마스킹은 표시만 변경**하며, 상태 계산은 서버 값 유지
- 어드민/모바일 표기에 필요한 **심사 항목별 상태(인증서류 제출 여부, intro pending 상태 포함)**는 서버가 계산해 내려준다.

### 심사 단계 계산 우선순위

- `pending_status`가 EDIT_NEED/REAPPLY일 때:
  1. 인증서류에 PENDING/REAPPLY/REJECT가 있으면 `REQUIRED_AUTH`
  2. 소개글 카테고리에 PENDING/REAPPLY/REJECT가 있으면 `INTRO`
  3. 그 외는 `user.status=NORMAL`이면 `PROFILE_CHANGE`, 그 외는 `BASIC_INFO`
- `pending_status`가 REQUIRED_AUTH_REVIEW → `REQUIRED_AUTH`
- `pending_status`가 INTRO_REVIEW → `INTRO`
- `pending_status`가 BASIC_INFO_REVIEW일 때:
  - `user.status=NORMAL` → `PROFILE_CHANGE`
  - 그 외 → `BASIC_INFO`
- `pending_status`가 REJECT → `BASIC_INFO` (최초 심사 거절 전용)
- `pending_status`가 COMPLETE → `COMPLETE`

### 심사 상태 표기 규칙

- 심사중/반려/재심사/거절 표기는 심사 항목(`기본정보/인증서류/소개글`)을 포함한다(완료는 예외).
- 프로필정보 변경 요청 심사는 별도 표기로 구분한다.
- 어드민 메뉴는 `EDIT_NEED/REAPPLY`를 **심사 항목 반려**로 묶고, 디테일 표기는 **반려/재심사 요청**으로 구분한다.
- 어드민 디테일 상태 표기는 **여러 심사 항목이 동시에 반려/재심사일 때 복수 항목으로 표시**한다(예: 인증서류 반려, 소개글 반려).
- **정회원 프로필정보 변경 요청 심사중**: `status=NORMAL` + `pending_stage=PROFILE_CHANGE` + `pending_status=BASIC_INFO_REVIEW`
- **정회원 프로필정보 변경 요청 심사 반려**: `status=NORMAL` + `pending_stage=PROFILE_CHANGE` + `pending_status=EDIT_NEED`
- **정회원 프로필정보 변경 요청 재심사 요청**: `status=NORMAL` + `pending_stage=PROFILE_CHANGE` + `pending_status=REAPPLY`
- **프로필정보 변경 요청 심사 표기 기준**: `pending_status` 값은 기존 기본정보 심사 값(BASIC_INFO_REVIEW/EDIT_NEED/REAPPLY)을 그대로 사용하며, 표기는 `pending_stage=PROFILE_CHANGE`로 구분한다.
- **회원 전 기본정보 심사 거절**: `pending_status=REJECT` (PENDING 회원 전용)
- **심사 반려**: `pending_status=EDIT_NEED` + `pending_stage` (정회원 프로필정보 변경 요청 심사 제외)
  - BASIC_INFO: 회원 전 기본정보 심사 반려
  - REQUIRED_AUTH: 일반회원 인증서류 심사 반려
  - INTRO: 준회원 소개글 심사 반려
- **재심사 요청**: `pending_status=REAPPLY` + `pending_stage` (정회원 프로필정보 변경 요청 심사 제외)
  - BASIC_INFO: 회원 전 기본정보 재심사 요청
  - REQUIRED_AUTH: 일반회원 인증서류 재심사 요청
  - INTRO: 준회원 소개글 재심사 요청
- **심사중**:
  - `status=PENDING` + `pending_status=BASIC_INFO_REVIEW`(회원 전 기본정보 심사중)
  - `status=PENDING` + `pending_status=REQUIRED_AUTH_REVIEW`(일반회원 인증서류 심사중)
  - `status=NORMAL` + `pending_status=INTRO_REVIEW`(준회원 소개글 심사중)
- **완료**: `pending_status=COMPLETE`

### 제출/반려/재심사 정의

- **제출**은 별도 상태가 아니라, 단계별 `pending_status`를 **대기 상태로 전환**하는 액션
  - 기본정보 제출 → `BASIC_INFO_REVIEW`
  - 인증서류 제출 → `REQUIRED_AUTH_REVIEW` 유지 + auth pending 생성/갱신
  - 소개글 제출 → `INTRO_REVIEW` (intro 카테고리 pending 생성)
- **반려** → `EDIT_NEED`
- **재심사 요청** → `REAPPLY`
  - 심사 아이템 상태는 `STATUS.REAPPLY`로 표시하며, 모바일 인증서류는 `ITEM_PENDING_STATUS.RE_WAIT`로 표시한다.
- **완료** → `COMPLETE`
- **심사 거절** → `REJECT` (PENDING 회원 전용, 반려와 구분)
  > `REQUIRED_AUTH_REVIEW`는 기본정보 승인 완료 후 진입하며, 인증서류 제출 여부는 auth pending 유무로 구분한다.

> 인증서류/소개글 단계는 `pending_status`만으로 신청/반려/재심사 구분이 어려우므로
> 해당 단계 아이템 상태로 판단한다(인증서류는 auth pending, 소개글은 intro pending).
> 이 규칙은 서버 계산 기준이며, 어드민/모바일은 서버가 계산한 값을 그대로 사용한다.
> 인증서류 단계 화면 분기:
> - 아이템 상태가 RETURN이면 재제출 화면(`MatchingAuthRequestScreen`)
> - 아이템 상태가 RE_WAIT이면 심사중 화면(`LockPanel` 유지)

### 관리자 심사 적용 규칙 (핵심 전이)

#### 1) PENDING 회원

- `pending_status == REQUIRED_AUTH_REVIEW` (인증서류 심사 단계)
  - 소개글 카테고리는 **인증서류 심사 판단에서 제외**
  - 인증서류 반려 있음 → `EDIT_NEED`
  - 인증서류 승인 완료 + 기본정보 문제 없음 → `INTRO_REVIEW`
    - 이때 `user.status`는 NORMAL로 전환
  - 그 외 → `REQUIRED_AUTH_REVIEW` 유지
- 그 외 (회원 전 기본정보 심사 단계)
  - 기본정보 정상 + 인증 정상 → `REQUIRED_AUTH_REVIEW`
  - 하나라도 문제 → `EDIT_NEED`

#### 2) NORMAL 회원

- **COMPLETE 승격 조건**
  - 기본정보 문제 없음(소개글 제외)
  - 인증서류 문제 없음
  - 소개글 완료 조건 충족
  - 위 조건 모두 만족 시 `COMPLETE`
- **소개글 미작성/심사 중**
  - 기본정보 문제 없음 + 인증서류 문제 없음 + 소개글 완료 조건 미충족
  - → `INTRO_REVIEW`
- **문제 존재**
  - 기본정보/인증서류 문제 또는 반려 존재 → `EDIT_NEED`

### 필수 시나리오 보장

- **인증서류 반려 + 소개글 미작성** → `REQUIRED_AUTH` (인증서류 재제출)
- **인증서류 반려/심사중이 있으면 소개글 상태와 무관하게 `REQUIRED_AUTH` 우선**
- **인증서류 통과 + 소개글 반려/미작성** → `INTRO` (LockPanel)
- **인증서류/소개글 모두 통과** → `COMPLETE` (매칭 가능)

### 자동로그인/네비게이션 매핑

- `pending_stage == BASIC_INFO` → 회원 전 기본정보 화면(가입 심사 전용)
- 그 외(`REQUIRED_AUTH/INTRO/PROFILE_CHANGE/COMPLETE`) → **Main/MatchingTab 진입(승급 심사 플로우는 매칭탭 유지)**
- **Main/MatchingTab 진입 후 하단 탭 이동은 심사 상태와 무관하게 항상 허용한다.**
- MatchingTab 내부 화면 분기:
  - `REQUIRED_AUTH` → `MatchingAuthRequestScreen` 또는 `LockPanel`(심사중)
  - `INTRO` → `LockPanel`
  - `PROFILE_CHANGE/COMPLETE` → 매칭 탭 정상 이용(프로필 변경 심사 중에도 활동 제한 없음)

### 모바일 심사 거절 표시 정책

- 모바일은 **심사 거절(`pending_status == REJECT`)만 심사중 화면으로 마스킹**한다.
- `EDIT_NEED/REAPPLY`는 기존 재심사/수정 흐름을 유지한다.
- 어드민/DB에는 거절 상태를 그대로 유지한다(모바일만 표시 마스킹).

### 반려 화면 매핑

- **회원 전 기본정보 심사 거절 표기**: `pending_status=REJECT` (PENDING 회원 전용)
- **정회원 프로필정보 변경 요청 심사 반려**: `status=NORMAL` + `pending_stage=PROFILE_CHANGE` + `pending_status=EDIT_NEED`
- **정회원 프로필정보 변경 요청 재심사 요청**: `status=NORMAL` + `pending_stage=PROFILE_CHANGE` + `pending_status=REAPPLY`
- **심사 반려 표기**: `pending_status=EDIT_NEED`이며 `pending_stage` 기준으로 명칭 표기(정회원 프로필정보 변경 요청 심사 제외)
  - BASIC_INFO: 회원 전 기본정보 심사 반려
  - REQUIRED_AUTH: 일반회원 인증서류 심사 반려
  - INTRO: 준회원 소개글 심사 반려
- **재심사 요청 표기**: `pending_status=REAPPLY`이며 `pending_stage` 기준으로 명칭 표기(정회원 프로필정보 변경 요청 심사 제외)
  - BASIC_INFO: 회원 전 기본정보 재심사 요청
  - REQUIRED_AUTH: 일반회원 인증서류 재심사 요청
  - INTRO: 준회원 소개글 재심사 요청
- **기본정보 반려**(`pending_stage=BASIC_INFO`) → `SignupReviewScreen`
- **인증서류 반려**(`pending_stage=REQUIRED_AUTH`) → `MatchingAuthRequestScreen`
- **소개글 반려**(`pending_stage=INTRO`) → `LockPanel`
- **기본정보 재심사 요청**(`pending_stage=BASIC_INFO`) → `SignupReviewScreen`
- **인증서류 재심사 요청**(`pending_stage=REQUIRED_AUTH`):
  - 아이템 상태 RETURN → `MatchingAuthRequestScreen`
  - 아이템 상태 RE_WAIT → `LockPanel`(심사중 유지)
- **소개글 재심사 요청**(`pending_stage=INTRO`) → `LockPanel`

### 심사 제출 UI 플로우

- **기본/소셜/소개글 수정 화면 진입**
  - 경로: `설정 > 프로필 수정` 또는 `프로필 최종 검토하기`에서 진입
  - 심사 중이어도 **최종 검토 경로(FULL_MEMBER_REVIEW)** 에서는 진입 허용
- **프로필 최종 검토하기**
  - 수정 화면에서 미리보기로 이동만 한다(심사 제출 아님)
- **매니저에게 심사 요청하기**
  - `ProfilePreviewScreen`의 버튼으로만 제출한다
  - 제출은 `editInfo`로 수행한다(변경된 항목만 pending_profile 갱신)
  - `user.status == PENDING` 또는 `pending_status == REQUIRED_AUTH_REVIEW`여도 제출을 막지 않는다
- **인증서류 제출**
  - `addAuth`로 제출하며, 심사중이어도 제출 가능해야 한다

### 매칭 API 차단 기준

- `user.status == PENDING` → 차단
- `pending_status == REQUIRED_AUTH_REVIEW` → 차단
- `pending_status == INTRO_REVIEW` → 차단
- `pending_status == EDIT_NEED/REAPPLY` 이면서 `pending_stage`가 REQUIRED_AUTH/INTRO → 차단
- `pending_stage == PROFILE_CHANGE` → 차단하지 않음(매칭 허용 유지)

### 어드민 리스트 분류 기준

#### 어드민 메뉴(to-be)

- 일반회원 승급 심사 신청
- 일반회원 합격자
- 준회원 승급 심사 신청
- 준회원 합격자
- 정회원 승급 심사 신청
- 정회원(매칭 가능)
- 전체 회원
- 심사 항목 반려(반려 항목 재심사)
- 프로필정보 변경 요청(정회원)
- 심사 거절된 회원
- 탈퇴/불량/휴면 회원
- 초대순위

#### 일반회원 승급 심사(기본정보)

- **일반회원 승급 심사 신청**: `status=PENDING` + `pending_stage=BASIC_INFO` + `pending_status=BASIC_INFO_REVIEW`
- **심사 항목 반려(기본정보)**: `status=PENDING` + `pending_stage=BASIC_INFO` + `pending_status=EDIT_NEED/REAPPLY`

#### 일반회원 합격자/준회원 승급 심사(인증서류)

- **일반회원 합격자(인증서류 미제출)**: `status=PENDING` + `pending_stage=REQUIRED_AUTH` + `pending_status=REQUIRED_AUTH_REVIEW` + 인증서류 제출 없음
- **준회원 승급 심사 신청**: `status=PENDING` + `pending_stage=REQUIRED_AUTH` + `pending_status=REQUIRED_AUTH_REVIEW` + 인증서류 제출 있음
- **심사 항목 반려(인증서류)**: `pending_stage=REQUIRED_AUTH` + `pending_status=EDIT_NEED/REAPPLY`

#### 준회원 합격자/정회원 승급 심사(소개글)

- **준회원 합격자(소개글 미제출)**: `status=NORMAL` + `pending_stage=INTRO` + `pending_status=INTRO_REVIEW` + intro pending 없음
- **정회원 승급 심사 신청**: `status=NORMAL` + `pending_stage=INTRO` + intro pending 상태=PENDING
- **심사 항목 반려(소개글)**: `status=NORMAL` + `pending_stage=INTRO` + intro pending 상태=REJECT/REAPPLY

#### 정회원(매칭 가능)

- **정회원(매칭 가능)**: `status=NORMAL` + `pending_stage=COMPLETE` + `pending_status=COMPLETE`

#### 심사 항목 반려(반려 항목 재심사)

- **메뉴 집계 기준**: 기본정보 반려(`status=PENDING` + `pending_stage=BASIC_INFO` + `pending_status=EDIT_NEED/REAPPLY`), 인증서류 반려(`pending_stage=REQUIRED_AUTH` + `pending_status=EDIT_NEED/REAPPLY`), 소개글 반려(`status=NORMAL` + `pending_stage=INTRO` + intro pending 상태=REJECT/REAPPLY)이며 디테일 표기는 `pending_status`로 반려/재심사 요청을 구분한다.

#### 프로필정보 변경 요청(정회원)

- `status=NORMAL` + `pending_stage=PROFILE_CHANGE` + `pending_status=BASIC_INFO_REVIEW/EDIT_NEED/REAPPLY`

#### 심사 거절된 회원

- `status=PENDING` + `pending_status=REJECT`

#### 탈퇴/불량/휴면 회원

- `status=LEAVE/BLOCK/HOLD`

## 주의할점

- 필수 코드만 추가
- 플랫폼 고려: android, ios일 때 레이아웃
- 프로젝트 일관성, 확장성 고려
- 추측 금지, 코드 및 링크로 근거 제시
- 기존 기능 삭제 금지
- 조용한 실패 금지: 로딩/검증/저장 실패는 사용자에게 명시적으로 알리고 로그/에러코드를 남긴다
- 불필요한 가드 금지: 정책상 불가능한 경로는 가드로 숨기지 말고 데이터/흐름 보증으로 해결한다
- 정책 의도는 코드에서 바로 드러나게 변수명/함수명/구조로 명시한다
- 주석 최소화: 코드로 의도가 충분히 드러나면 주석 금지, 불가피한 경우에만 1줄 주석 허용
- 한국어 사용, 영어단어는 알파뱃으로 표시
- 코드, 파일엔 명시적이며 직관적인 명칭 사용할 것
- lint 고려할 것
- verbose한 문법 지양

---

## 🧪 테스트 코드 전략 (레포별)

### coupler-admin-web (CRA)

- 러너: `react-scripts test` 사용 (`coupler-admin-web/package.json`).
- 위치/규칙: `src/**/*.test.jsx` 또는 `src/**/__tests__`로 시작.
- 우선순위:
  1. `src/helper` 등 순수 로직 단위 테스트
  2. `src/pages` 스모크 렌더링 테스트
  3. MobX 스토어 상태 변경 테스트
- 외부 통신: axios mock 또는 MSW 도입 고려(현재 의존성 없음).
- Chart.js / DataTables: “렌더링 성공 + 주요 props 처리” 수준의 얕은 테스트부터 시작.

### coupler-api (Express)

- 러너: `jest` 사용 (`coupler-api/package.json`).
- 우선순위:
  1. `lib/*.js` 유틸 단위 테스트
  2. `controller`/`routes` 통합 테스트(요청/응답 검증)
- 외부 통신 테스트 필요 시 `supertest` 도입 고려(현재 의존성 없음).
- 외부 연동(Firebase/SMS/메일): mock 처리로 실서비스 호출 차단.
- DB 전략: 테스트용 데이터셋/트랜잭션 롤백/테이블 정리 중 하나를 고정하여 일관성 유지.

### coupler-mobile-app (React Native)

- 러너: `jest` + `preset: react-native` 사용 (`coupler-mobile-app/jest.config.js`).
- 위치/규칙: `__tests__` 또는 `src/**/__tests__`로 시작.
- 우선순위:
  1. `src/screens/**/steps` 등 핵심 화면 스모크 렌더링
  2. 조건부 UI/상태 변화 테스트
- 상호작용 테스트 필요 시 `@testing-library/react-native` 도입 고려(현재 의존성 없음).
- 네이티브 모듈(AsyncStorage, Reanimated 등)은 Jest mock/셋업 파일로 분리 구성.

---

## 🔧 CI 전략

- 모든 CI는 `pull_request` 이벤트만 트리거한다.

## 기타 현재 ritzy -> coupler로 전체적인 개명필요

- 기존있는 코드까지 다바꾸기에는 변경많으므로 일단 변경분에 대해서만 항상 앞으로 명칭 coupler로 고정
