# Git 브랜치 전략

## 목적
프로젝트 전반의 일관된 브랜치 관리 및 협업 효율성 향상

## 적용 범위
- coupler-mobile-app
- coupler-api
- coupler-admin-web

## 브랜치 종류

### main (또는 master)
- 배포 가능한 안정적인 코드
- 직접 커밋 금지, PR을 통해서만 병합

### develop
- 개발 중인 최신 코드
- 기능 개발의 기본 브랜치

### feature/*
- 새로운 기능 개발
- 네이밍: `feature/기능명` (예: `feature/user-login`)
- develop 브랜치에서 생성
- 개발 완료 후 develop으로 병합

### hotfix/*
- 긴급 버그 수정
- 네이밍: `hotfix/버그명` (예: `hotfix/login-error`)
- main 브랜치에서 생성
- 수정 완료 후 main과 develop 모두에 병합

### release/*
- 배포 준비
- 네이밍: `release/버전` (예: `release/v1.0.0`)
- develop 브랜치에서 생성
- 준비 완료 후 main과 develop에 병합

## 작업 플로우

1. 새로운 기능 개발 시작
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/새기능명
   ```

2. 개발 및 커밋
   ```bash
   git add .
   git commit -m "feat: 기능 설명"
   ```

3. PR 생성 및 코드 리뷰
   - GitHub에서 develop 브랜치로 PR 생성
   - 최소 1명 이상의 리뷰어 지정
   - 리뷰 승인 후 병합

## 커밋 메시지 규칙

- `feat:` 새로운 기능
- `fix:` 버그 수정
- `docs:` 문서 수정
- `style:` 코드 포맷팅
- `refactor:` 코드 리팩토링
- `test:` 테스트 코드
- `chore:` 빌드 설정 등

## 주의사항

- 브랜치 이름은 소문자와 하이픈 사용
- 작업 완료 후 병합된 브랜치는 삭제
- 정기적으로 develop 브랜치와 동기화
