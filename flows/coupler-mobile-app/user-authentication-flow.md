# 사용자 인증 플로우 (User Authentication Flow)

## 개요
사용자가 모바일 앱에서 로그인하고 인증 토큰을 받는 전체 플로우

## 단계

### 1. 사용자 입력
- 사용자가 이메일/비밀번호 입력
- 유효성 검사 (클라이언트 측)

### 2. API 요청
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "********"
}
```

### 3. API 응답
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "name": "홍길동"
    }
  }
}
```

### 4. 토큰 저장
- AccessToken: SecureStorage에 저장
- RefreshToken: SecureStorage에 저장
- 사용자 정보: Redux/MobX 스토어에 저장

### 5. 자동 로그인
- 앱 재시작 시 저장된 토큰 확인
- 토큰 유효성 검증
- 만료 시 RefreshToken으로 갱신

## 관련 컴포넌트

### Mobile App
- `screens/LoginScreen.tsx`
- `components/LoginForm.tsx`
- `services/AuthService.ts`
- `stores/AuthStore.ts`

### API
- `controllers/AuthController.ts`
- `services/AuthService.ts`
- `middlewares/authMiddleware.ts`

## API 연동

- `POST /api/v1/auth/login` - 로그인
- `POST /api/v1/auth/refresh` - 토큰 갱신
- `POST /api/v1/auth/logout` - 로그아웃

## 주의사항

1. **보안**
   - 비밀번호는 평문으로 저장하지 않음
   - HTTPS 사용 필수
   - 토큰은 SecureStorage에만 저장

2. **에러 처리**
   - 네트워크 오류 시 재시도 로직
   - 잘못된 인증 정보 시 명확한 에러 메시지
   - 토큰 만료 시 자동 갱신

3. **UX**
   - 로딩 인디케이터 표시
   - 에러 메시지는 사용자 친화적으로
   - 자동 로그인 옵션 제공
