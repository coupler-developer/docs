# Git 동기화/Rebase 실행 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- `pull/rebase` 기준 혼용으로 인한 상태 오판(`latest` 오해)을 방지한다.
- 3개 레포(`coupler-api`, `coupler-mobile-app`, `coupler-admin-web`)를 같은 기준으로 안전하게 최신화한다.
- 히스토리 왜곡(merge commit 유입, conflict marker 잔존) 없이 선형 히스토리를 유지한다.

## 적용 범위

- 워크스페이스 내 코드 레포 3종
    - `coupler-api`
    - `coupler-mobile-app`
    - `coupler-admin-web`

## 기준 선택 규칙 (필수)

- **요청이 "main 기준 최신화"면 기준은 무조건 `origin/main`**
- **요청이 "현재 브랜치 최신화"면 기준은 `origin/<현재브랜치>`**
- 한 작업 단위에서 기준을 섞지 않는다.
    - 금지: 같은 작업 중 일부 레포는 `origin/main`, 일부 레포는 `origin/<feature>`

## 실행 전 점검 (레포별 필수)

1. 현재 브랜치 확인
2. 워킹트리 clean 확인
3. 원격 최신 반영

```bash
git rev-parse --abbrev-ref HEAD
git status --short
git fetch origin --prune
```

## 표준 실행 절차

### A) main 기준 최신화

```bash
git rebase origin/main
```

### B) 현재 브랜치 기준 최신화

```bash
git pull --rebase origin <현재브랜치명>
```

## 충돌 처리 규칙

1. 충돌 파일 수정
2. conflict marker(`<<<<<<<`, `=======`, `>>>>>>>`) 제거 확인
3. 스테이징 후 rebase 계속

```bash
git add <파일>
GIT_EDITOR=true git rebase --continue
```

- `nano`/terminfo 문제로 에디터가 열리지 않으면 `GIT_EDITOR=true`를 사용한다.
- 임의 `merge`로 우회하지 않는다.

## 완료 판정 (레포별 필수)

```bash
git rev-list --left-right --count HEAD...origin/main
git rev-list --count --merges origin/main..HEAD
```

- `HEAD...origin/main` 결과가 `N  0`이어야 한다 (`behind=0`).
- `origin/main..HEAD`의 merge commit 수는 `0`이어야 한다.

## 회귀 검증 (레포별 필수)

- `coupler-api`: `pnpm lint && pnpm typecheck && pnpm jest --runInBand`
- `coupler-mobile-app`: `npm run -s lint && npm run -s typecheck && npx jest --runInBand`
- `coupler-admin-web`: `npm run -s lint && CI=true npm run -s test:ci`

## 재발 방지 체크리스트

- [ ] "기준 브랜치"를 시작 전에 명시했다 (`origin/main` 또는 `origin/<현재브랜치>`)
- [ ] 3개 레포 모두 같은 기준으로 처리했다
- [ ] `behind=0`를 확인했다
- [ ] merge commit 유입이 없음을 확인했다
- [ ] 충돌 마커 잔존이 없다
- [ ] lint/typecheck/test 결과를 레포별로 확인했다
