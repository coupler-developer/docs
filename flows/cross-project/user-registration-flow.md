# 사용자 등록 및 인증 통합 플로우

## 개요
사용자가 모바일 앱에서 회원가입하고, API에서 처리하며, 관리자 웹에서 관리하는 전체 통합 플로우

## 참여 시스템
- **Mobile App**: 사용자 인터페이스 및 입력
- **API**: 비즈니스 로직 및 데이터 처리
- **Admin Web**: 사용자 관리 및 모니터링

## 플로우 다이어그램

```
[Mobile App] ---> [API] ---> [Database]
     ^              |
     |              v
     +--------[Admin Web]
```

## 단계별 설명

### Step 1: 사용자 회원가입 (Mobile App)

#### Mobile App 동작
1. 사용자가 회원가입 화면 접근
2. 필수 정보 입력:
   - 이메일
   - 비밀번호
   - 이름
   - 전화번호 (선택)
3. 약관 동의 체크
4. 회원가입 버튼 클릭

#### API 요청
```
POST /api/v1/users/register
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "name": "홍길동",
  "phone": "010-1234-5678",
  "agreedToTerms": true
}
```

### Step 2: 계정 생성 (API)

#### API 처리
1. 입력 데이터 유효성 검증
   - 이메일 형식 확인
   - 비밀번호 강도 확인
   - 중복 이메일 체크

2. 비밀번호 해싱 (bcrypt)

3. 데이터베이스에 사용자 저장
   ```sql
   INSERT INTO users (email, password_hash, name, phone, created_at)
   VALUES (?, ?, ?, ?, NOW())
   ```

4. 환영 이메일 발송 (비동기)

5. 응답 반환
   ```json
   {
     "success": true,
     "data": {
       "userId": "user-456",
       "email": "newuser@example.com",
       "name": "홍길동"
     }
   }
   ```

### Step 3: 자동 로그인 (Mobile App)

1. 회원가입 성공 응답 수신
2. 자동으로 로그인 API 호출
3. 토큰 저장 및 홈 화면 이동

### Step 4: 관리자 모니터링 (Admin Web)

#### Admin Web 기능
1. 실시간 신규 가입자 알림
   - 웹소켓을 통한 실시간 업데이트
   - 대시보드에 신규 사용자 표시

2. 사용자 정보 확인
   - 가입 일시
   - 기본 정보
   - 활동 로그

3. 계정 관리
   - 계정 활성화/비활성화
   - 권한 설정
   - 의심 계정 검토

## 데이터 흐름

### 1. Mobile → API
- **프로토콜**: HTTPS
- **인증**: 없음 (회원가입 시)
- **데이터 형식**: JSON

### 2. API → Database
- **연결**: PostgreSQL/MySQL 연결 풀
- **트랜잭션**: ACID 보장
- **데이터**: 암호화된 민감 정보

### 3. API → Admin Web
- **실시간 알림**: WebSocket
- **관리 API**: REST API with JWT
- **데이터**: 필터링된 사용자 정보

## 에러 처리

### Mobile App
- **네트워크 오류**: "네트워크 연결을 확인해주세요"
- **중복 이메일**: "이미 사용 중인 이메일입니다"
- **유효성 검사 실패**: 각 필드별 구체적 메시지

### API
- **400 Bad Request**: 잘못된 입력 데이터
- **409 Conflict**: 중복 이메일
- **500 Internal Server Error**: 서버 오류 (로그 기록)

### Admin Web
- **연결 오류**: 재연결 시도
- **권한 오류**: 관리자 권한 확인 메시지

## 보안 고려사항

1. **비밀번호 보안**
   - 최소 8자, 대소문자/숫자/특수문자 포함
   - bcrypt 해싱 (cost factor: 12)
   - 평문 비밀번호는 로그에 기록하지 않음

2. **이메일 인증** (선택적)
   - 회원가입 후 이메일 인증 링크 발송
   - 인증 완료 전까지 제한된 기능만 사용

3. **Rate Limiting**
   - IP당 분당 5회 회원가입 시도 제한
   - 의심스러운 활동 자동 차단

4. **데이터 암호화**
   - 전송 중: TLS 1.3
   - 저장 시: 민감 정보 AES-256 암호화

## 성능 최적화

- 비동기 이메일 발송 (메시지 큐 사용)
- 데이터베이스 인덱스: email 컬럼
- 캐싱: 중복 이메일 체크 결과 (짧은 TTL)

## 관련 문서

- [사용자 인증 플로우 (Mobile)](/flows/coupler-mobile-app/user-authentication-flow.md)
- 인증/인가 API (문서 작성 예정)
- 사용자 관리 (Admin) (문서 작성 예정)
