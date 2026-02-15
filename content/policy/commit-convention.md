# 커밋 메시지 컨벤션

## 기본 규칙

- [Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/) 준수
- 한글로 작성
- 제목은 한 줄 요약 (50자 이내 권장)
- 본문은 타입별 템플릿 활용
- 템플릿 이용시 지나친 개행 주의
- 커밋 메시지에 `\n` 문자열(이스케이프 리터럴) 직접 입력 금지

## CLI 작성 규칙

- `git commit -m "...\n..."` 형태 사용 금지 (`\n`이 실제 줄바꿈이 아닌 문자열로 저장될 수 있음)
- 본문이 있는 커밋은 아래 두 방식 중 하나만 사용

```bash
# 권장 1) 에디터 열어서 직접 줄바꿈 입력
git commit

# 권장 2) -m을 여러 번 사용 (각 -m이 문단으로 들어감)
git commit -m "refactor: 한줄 요약" \
  -m "Changes:
- 항목 1
- 항목 2" \
  -m "Tests:
- not run: 사유"
```

- 커밋 직후 아래 명령으로 메시지 포맷 확인

```bash
git log -1 --pretty=%B
```

## Prefix

| Prefix      | 용도          |
| ----------- | ------------- |
| `feat:`     | 새로운 기능   |
| `fix:`      | 버그 수정     |
| `docs:`     | 문서 수정     |
| `refactor:` | 코드 리팩토링 |
| `test:`     | 테스트 코드   |
| `chore:`    | 빌드 설정 등  |

## 타입별 커밋 메시지 템플릿

### fix: 버그 수정

```text
fix: 한줄 요약

Background:
- (선택) 문제 발생 배경, 재현 조건

Cause:
- (필수) 근본 원인

Fix:
- (필수) 해결 방법

Impact:
- (선택) 영향 범위, 사이드 이펙트

Tests:
- (필수) 테스트 수행 여부
- not run: (사유)
```

**예시:**

```text
fix: 회원가입 선호정보 예외 처리

Cause:
- GlobalState.setting.best_favor 로드 전 find() 결과가 undefined
- .name 접근 시 TypeError 발생

Fix:
- find() 결과 널 가드 추가
- undefined일 때 선택 안내 문구로 대체

Tests:
- 수동 테스트 완료 (회원가입 플로우)
```

### feat: 새로운 기능

```text
feat: 한줄 요약

Background:
- (선택) 기능 추가 배경, 요구사항

Changes:
- (필수) 주요 변경 사항

Impact:
- (선택) 기존 기능 영향, 마이그레이션 필요 여부

Tests:
- (필수) 테스트 수행 여부
- not run: (사유)
```

**예시:**

```text
feat: 프로필 이미지 버전 관리 시스템

Background:
- 프로필 이미지 심사 이력 관리 필요
- 반려 시 개별 이미지 사유 표시 요구

Changes:
- t_member_profile_version 테이블 추가
- t_member_profile_image 테이블 추가
- API 응답에 profile_set_current/pending 추가

Impact:
- 기존 t_member.profile 컬럼 deprecated
- 앱 강제 업데이트 필요

Tests:
- 마이그레이션 스크립트 dry-run 완료
- API 단위 테스트 추가
```

### refactor: 코드 리팩토링

```text
refactor: 한줄 요약

Background:
- (선택) 리팩토링 배경, 기술 부채

Changes:
- (필수) 변경 내용

Rationale:
- (필수) 변경 이유, 개선 효과

Impact:
- (선택) 동작 변경 여부 (없어야 함)

Tests:
- (필수) 테스트 수행 여부
- not run: (사유)
```

**예시:**

```text
refactor: media_proxy 설정 플래그 제거

Background:
- 사용되지 않는 config 플래그로 코드 복잡도 증가

Changes:
- media_proxy_upload, media_proxy_download 플래그 제거
- 개발환경에서 항상 프록시 활성화

Rationale:
- 설정 단순화
- 로컬 개발 시 혼란 방지

Impact:
- 동작 변경 없음

Tests:
- 로컬 환경 업로드/조회 테스트 완료
```

### docs: 문서 수정

```text
docs: 한줄 요약

Changes:
- (필수) 변경 내용

Tests:
- not run: 문서 변경
```

**예시:**

```text
docs: 커밋 컨벤션 템플릿 추가

Changes:
- fix/feat/refactor/docs/test 타입별 템플릿 정의
- 예시 추가

Tests:
- not run: 문서 변경
```

### test: 테스트 코드

```text
test: 한줄 요약

Coverage:
- (필수) 테스트 대상, 시나리오

Changes:
- (필수) 추가/수정된 테스트

Tests:
- (필수) 테스트 실행 결과
```

**예시:**

```text
test: 프로필 이미지 업로드 API 테스트 추가

Coverage:
- POST /app/upload/image/profile
- 정상 업로드, 파일 누락, 잘못된 형식

Changes:
- tests/upload.test.js 추가

Tests:
- npm test 통과 (12/12)
```

### chore: 빌드/설정

```text
chore: 한줄 요약

Changes:
- (필수) 변경 내용

Tests:
- (필수) 빌드/배포 검증 여부
- not run: (사유)
```

**예시:**

```text
chore: Node.js 버전 업그레이드 (18 -> 20)

Changes:
- .nvmrc 업데이트
- package.json engines 수정
- CI 워크플로우 업데이트

Tests:
- npm install 정상
- npm run build 정상
```

## Tests 섹션 가이드

| 상황                 | 작성 예시                            |
| -------------------- | ------------------------------------ |
| 테스트 실행 완료     | `npm test 통과 (12/12)`              |
| 수동 테스트          | `수동 테스트 완료 (시나리오)`        |
| 테스트 미실행 (문서) | `not run: 문서 변경`                 |
| 테스트 미실행 (설정) | `not run: 설정 파일만 변경`          |
| 테스트 미실행 (CI)   | `not run: CI에서 검증 예정`          |
| 테스트 코드 없음     | `not run: 테스트 코드 미작성 (TODO)` |
