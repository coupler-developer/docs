# 로그 정책 (Logging Policy)

## 목적

개발 로그와 운영 로그를 명확히 분리하여 디버깅 효율성을 높이고, 운영 환경에서 불필요한 로그로 인한 성능 저하 및 보안 이슈를 방지한다.

---

## 기본 원칙

### 1. 환경 분리

#### Backend (coupler-api)

```javascript
// 개발 로그
if (process.env.NODE_ENV === "development") {
  console.log("[ModuleName] debug info:", data);
}

// 운영 로그 (에러, 경고만)
console.error("[ModuleName] error:", error);
console.warn("[ModuleName] warning:", message);
```

#### Frontend (coupler-mobile-app, coupler-admin-web)

```javascript
// 개발 로그
if (__DEV__) {
  console.log("[ComponentName] debug info:", data);
}

// 운영 로그 (에러만, 모니터링 시스템으로 전송)
console.error("[ComponentName] error:", error);
```

### 2. 로그 레벨 구분

| 레벨      | 용도                      | 개발 환경 | 운영 환경 |
| --------- | ------------------------- | --------- | --------- |
| **DEBUG** | 상세 디버깅 정보          | ✅        | ❌        |
| **INFO**  | 일반 정보성 로그          | ✅        | ⚠️ 최소화 |
| **WARN**  | 경고 (복구 가능한 이슈)   | ✅        | ✅        |
| **ERROR** | 에러 (복구 불가능한 이슈) | ✅        | ✅        |

---

## 로그 형식 규칙

### 로그 메시지 포맷

```text
[ModuleName] key: value
```

#### 가독성 원칙

- 태그는 대괄호 `[ModuleName]`로 시작
- 키-값 쌍은 콜론(`:`) 구분
- 여러 값은 쉼표로 구분하지 말고 별도 로그로 분리
- 객체/배열은 자동 포맷팅 활용 (JSON.stringify 지양)

#### 좋은 예

```javascript
// ✅ 명확하고 읽기 쉬운 형식
console.log("[uploadImages] directory:", directory);
console.log("[uploadImages] files count:", req.files.length);
console.log("[SignupScreen] payload.profile_image_paths:", images);
console.error("[auth.js] signup failed:", error.message);

// ✅ 여러 값은 별도 로그로 분리
if (__DEV__) {
  console.log("[Step3] nextList:", nextList);
  console.log("[Step3] filtered:", filtered);
  console.log("[Step3] gender:", gender);
}
```

#### 나쁜 예

```javascript
// ❌ 태그 없음
console.log("directory", directory);

// ❌ 불명확한 메시지
console.log("디버그:", data);

// ❌ 여러 값을 한 줄에 섞음 (가독성 저하)
console.log(
  "[Step3] nextList:",
  nextList,
  "filtered:",
  filtered,
  "gender:",
  gender,
);

// ❌ JSON.stringify 남용 (자동 포맷팅이 더 읽기 쉬움)
console.log("[Step3] data:", JSON.stringify(data));
```

### Convention

#### 모듈명 표기

- Backend 함수: `[functionName]` (예: `[uploadImages]`, `[signup]`)
- Frontend 컴포넌트: `[ComponentName]` (예: `[SignupScreen]`, `[Step3]`)
- 유틸리티/라이브러리: `[ModuleName]` (예: `[review-image]`, `[APIUtils]`)

#### 일관성 유지

- 같은 모듈 내에서는 동일한 태그 사용
- 키 이름은 변수명과 일치시키기
- 순서: 입력 파라미터 → 중간 결과 → 최종 결과

### 개발 로그 예시

#### Backend 예시

```javascript
exports.uploadImages = async (req, res) => {
  const directory = file.getDir("image", req.params.type);

  if (process.env.NODE_ENV === "development") {
    console.log("[uploadImages] directory:", directory);
    console.log("[uploadImages] files count:", req.files.length);
  }

  // 비즈니스 로직...
};
```

#### Frontend (Mobile/Web)

```javascript
const handleSubmit = () => {
  if (__DEV__) {
    console.log("[SignupScreen] submitting with data:", payload);
  }

  // API 호출...
};
```

### 운영 로그 예시

#### 에러만 기록 (항상 표시)

```javascript
try {
  await someOperation();
} catch (error) {
  console.error("[ModuleName] operation failed:", {
    message: error.message,
    stack: error.stack,
    context: relevantData, // 개인정보 제외
  });
}
```

---

## 금지 사항

### ❌ 개인정보/민감정보 로깅 금지

```javascript
// ❌ 절대 금지
console.log("User password:", user.pwd);
console.log("Card number:", payment.card_number);
console.log("User email:", user.email); // 개발 환경에서만 허용

// ✅ 허용
console.log("User ID:", user.id);
console.log("Payment status:", payment.status);
if (__DEV__) {
  console.log("User email (dev only):", user.email);
}
```

### ❌ 과도한 반복 로그 금지

```javascript
// ❌ 금지 (루프 내부)
for (let i = 0; i < 1000; i++) {
  console.log("Processing item:", i);
}

// ✅ 허용
if (__DEV__) {
  console.log("Processing items, count:", items.length);
}
// 처리 후 요약 로그
console.log("Processed items:", successCount, "success,", failCount, "failed");
```

### ❌ 무분별한 객체 로깅 금지

```javascript
// ❌ 금지 (너무 큰 객체)
console.log("Entire state:", GlobalState);

// ✅ 허용 (필요한 부분만)
if (__DEV__) {
  console.log("User profile images:", GlobalState.me.profile.profile_image_paths);
}
```

---

## 로그 색인 (Log Indexing)

### 주요 모듈별 로그 태그

#### Backend 로그 태그

```text
[auth.js]       - 인증 관련
[member.js]     - 회원 관리
[upload.js]     - 파일 업로드
[review-image]  - 이미지 심사
[APIUtils]      - API 유틸리티
```

#### Frontend 로그 태그

```text
[SignupScreen]          - 회원가입
[ProfilePreviewScreen]  - 프로필 미리보기
[MatchingTab]           - 매칭 탭
[APIUtils]              - API 호출
[GlobalState]           - 전역 상태
```

### 검색 팁

특정 모듈 로그만 필터링:

```bash
# Backend
NODE_ENV=development node app.js | grep '\[uploadImages\]'

# Frontend (Metro bundler)
# Cmd/Ctrl + F: [SignupScreen]
```

---

## 운영 환경 로그 관리

### Backend

- **에러 로그**: `console.error`로 기록, 필요 시 모니터링 시스템 연동
- **접근 로그**: Express 미들웨어 사용
- **비즈니스 로그**: 최소화, 필요 시 DB에 별도 저장

### Frontend

- **에러 로그**: `console.error`로 기록, 필요 시 모니터링 시스템 연동
- **console.log**: 번들에서 자동 제거 (Babel plugin 또는 Terser 설정)

---

## 체크리스트

로그 추가 시 다음을 확인:

- [ ] 개발 환경 조건 (`__DEV__` 또는 `NODE_ENV === 'development'`) 사용했는가?
- [ ] 로그 메시지에 모듈/컴포넌트명 포함했는가?
- [ ] 개인정보/민감정보가 포함되지 않았는가?
- [ ] 운영 환경에 필요한 로그인가? (에러/경고만 허용)
- [ ] 반복 로그가 아닌가? (루프 외부로 이동 또는 요약)

---

## 예외 상황

다음 경우에만 운영 환경에서 INFO 로그 허용:

1. **중요 비즈니스 이벤트**: 회원가입 완료, 결제 완료 등
2. **서버 시작/종료**: 서버 부팅, graceful shutdown
3. **스케줄러 실행**: Cron 작업 시작/종료 (성공/실패 결과만)

```javascript
// 허용되는 운영 INFO 로그 예시
console.log("[app.js] Server started on port:", PORT);
console.log("[cron.js] Daily cleanup completed:", { deleted: count });
console.log("[auth.js] User signup completed:", { userId, timestamp });
```
