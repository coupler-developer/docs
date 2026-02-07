# 사용자 등록 플로우 (회원가입)

## 개요

사용자가 모바일 앱에서 회원가입하고, API에서 처리하며, 관리자 웹에서 심사하는 전체 통합 플로우

## 참여 시스템

- **coupler-mobile-app**: 사용자 인터페이스 및 입력
- **coupler-api**: 비즈니스 로직 및 데이터 처리
- **coupler-admin-web**: 회원 심사 및 관리

## 플로우 다이어그램

```mermaid
sequenceDiagram
    participant App as Mobile App
    participant API as coupler-api
    participant DB as MySQL
    participant Admin as Admin Web

    App->>API: POST /app/v1/auth/signup
    API->>DB: INSERT t_member
    API->>DB: INSERT t_member_pending
    API-->>App: { result_code: 0, result_data }
    App->>App: SignupReviewScreen 이동
    Admin->>API: GET /admin/member/pending/list
    API-->>Admin: 심사 대기 목록
    Admin->>API: POST /admin/member/pending/save
    API->>DB: UPDATE t_member (status, pending_status)
```

## 단계별 설명

### Step 1: 회원가입 화면 (Mobile App)

#### 관련 파일

- `coupler-mobile-app/src/screens/signup/SignupGeneralMemberScreen.js`
- `coupler-mobile-app/src/screens/signup/SignupGeneralMemberStep1.js` (기본정보)
- `coupler-mobile-app/src/screens/signup/SignupGeneralMemberStep2.js` (프로필)
- `coupler-mobile-app/src/screens/signup/SignupGeneralMemberStep3.js` (사진)

#### 입력 정보

```javascript
// GlobalState.me.basic_info (일부)
{
  email: string,
  password: string,
  name: string,
  phone: string,
  gender: string,        // 'M' | 'F'
  birth: string,         // YYYY-MM-DD
  nickname: string,
  job: string,
  location: string,
  // ... 기타 프로필 정보
}
```

### Step 2: API 요청 (Mobile App → API)

#### 요청

```http
POST /app/v1/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "pwd": "plainPassword",
  "name": "홍길동",
  "phone": "01012345678",
  "gender": "M",
  "birth": "1990-01-01",
  "nickname": "닉네임",
  "job": "개발자",
  "location": "서울",
  "manager_id": 123,
  "profile_image_paths": ["path1", "path2", "path3"],
  "user_auth": [],
  "auth": []
}
```

#### 관련 파일

- `coupler-api/controller/app/v1/auth.js` → `signup()`

> 위 요청 예시는 이해를 위한 축약본이며, 실제로는 더 많은 필드가 함께 전송된다.

### Step 3: 데이터 저장 (API → DB)

#### 처리 순서

1. 이메일 중복 체크 (`t_member`)
2. 비밀번호 해싱 (bcrypt)
3. 회원 정보 저장 (`t_member`)
4. 프로필 이미지 저장 (`t_member_profile_version`, `t_member_profile_image`)
5. pending_profile 생성 (`t_member_pending`)

#### 테이블

```sql
-- 회원 기본정보
-- (예시) 실제 테이블은 필수 컬럼이 더 많으며, 서버가 기본값을 보정한 뒤 저장한다.
INSERT INTO t_member (
  email, pwd, name, phone, gender, birth,
  nickname, job, location, status, pending_status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0);

-- 프로필 이미지 버전
INSERT INTO t_member_profile_version (member, version_no, create_date, status)
VALUES (?, 1, NOW(), 0);

-- 프로필 이미지
INSERT INTO t_member_profile_image (profile_version_id, image_index, image_url, status, create_date)
VALUES (?, ?, ?, 0, NOW());
```

#### 응답

```json
{
  "result_code": 0,
  "result_msg": "SUCCESS",
  "result_data": {
    "id": 12345,
    "email": "user@example.com",
    "pending_status": 0,
    "pending_stage": "basic_info"
  }
}
```

### Step 4: 심사 대기 (Mobile App)

회원가입 완료 후 `SignupReviewScreen`으로 이동하여 심사 대기 상태 표시

#### 상태값

- `user.status = 0` (PENDING)
- `pending_status = 0` (BASIC_INFO_REVIEW)
- `pending_stage = 'basic_info'` (DB 저장값이 아니라 API 응답에서 계산되어 내려오는 값)

### Step 5: 관리자 심사 (Admin Web)

#### 관련 파일

- `coupler-admin-web/src/pages/member/pending.js` (목록)
- `coupler-admin-web/src/pages/member/detail.js` (상세/심사)

#### 심사 API

```
POST /admin/member/pending/save
{
  "user": { ... },
  "pending": { ... },
  "auth": [ ... ],
  "manager": [ ... ],
  "pendingType": "semi-apply"
}
```

## 상태 흐름

상세한 상태 전이는 [회원 심사 FSM](../../architecture/member-review-fsm.md) 참조

```
회원가입 완료
    ↓
[회원 전] status=PENDING, pending_stage='basic_info'
    ↓ (기본정보 승인)
[일반회원] status=PENDING, pending_stage='required_auth'
    ↓ (서류 승인)
[준회원] status=NORMAL, pending_stage='intro'
    ↓ (소개글 승인)
[정회원] status=NORMAL, pending_stage='complete'
```

## 데이터 흐름

### Mobile → API

- **프로토콜**: HTTPS
- **인증**: 없음 (회원가입 시)
- **상태 관리**: MobX `GlobalState`

### API → Database

- **DB**: MySQL
- **ORM**: 직접 쿼리 (mysql2)
- **트랜잭션**: 필요 시 사용

### API → Admin Web

- **관리 API**: REST API with JWT
- **세션**: express-session

## 에러 처리

| result_code | 의미             | 처리                 |
| ----------- | ---------------- | -------------------- |
| 0           | 성공             | 심사대기 화면 이동   |
| 1           | 이미 가입된 회원 | 로그인 화면 이동     |
| -2          | 차단된 회원      | LoginFailScreen 이동 |
| 기타        | 서버 오류        | Toast 메시지 표시    |

## 관련 문서

- [회원 심사 FSM](../../architecture/member-review-fsm.md)
- [사용자 인증 플로우](../coupler-mobile-app/user-authentication-flow.md)
