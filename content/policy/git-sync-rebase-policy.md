# Git 동기화/Rebase 실행 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- `pull/rebase` 기준 혼용으로 인한 상태 오판(`latest` 오해)을 방지한다.
- 워크스페이스 Git 레포를 같은 기준으로 안전하게 최신화하고, 병합 완료된 작업 브랜치/워크트리를 남기지 않는다.
- 히스토리 왜곡(merge commit 유입, conflict marker 잔존) 없이 선형 히스토리를 유지한다.

## 적용 범위

- 워크스페이스 내 Git 레포
    - `docs`
    - `coupler-api`
    - `coupler-mobile-app`
    - `coupler-admin-web`
- "3개 레포"처럼 코드 레포 일괄 최신화 요청이면 `coupler-api`, `coupler-mobile-app`, `coupler-admin-web`를 기본 묶음으로 본다.
- "관련 워크트리와 브렌치 정리해줘"처럼 관련 정리 요청이면 실제 작업, PR, 브랜치, 워크트리와 연결된 모든 워크스페이스 Git 레포를 대상으로 한다.

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

## 관련 워크트리와 브랜치 정리 절차

사용자가 "관련 워크트리와 브렌치 정리해줘" 또는 같은 의미의 요청을 하면, 관련된 모든 레포에서 아래 순서를 수행한다.

### 1. 대상 식별

- 최근 작업 내용, PR, 브랜치명, `git worktree list --porcelain`, `git branch --list`를 근거로 관련 레포/워크트리/브랜치를 확정한다.
- `main`, `develop`처럼 상시 기준 브랜치나 보호 브랜치는 삭제 대상으로 잡지 않는다.

### 2. 원격 상태 갱신

```bash
git fetch origin --prune
```

### 3. PR 병합 확인

- 대상 브랜치의 PR이 `merged` 상태인지 확인한다.
- PR 병합 여부가 확인되지 않거나, 워크트리가 dirty 상태이거나, 대상 브랜치에 원격/PR에 없는 로컬 전용 커밋이 있으면 해당 대상은 삭제하지 않고 보고한다.

### 4. 원격 브랜치 정리 확인

- 병합 완료된 대상 원격 브랜치가 남아 있으면 삭제한다.

```bash
git push origin --delete <브랜치명>
git fetch origin --prune
git branch -r --list origin/<브랜치명>
```

- `origin/<브랜치명>`이 더 이상 조회되지 않아야 한다.

### 5. 로컬 워크트리 삭제

- 대상 워크트리가 clean 상태인지 확인한 뒤 삭제한다.

```bash
git -C <워크트리경로> status --short
git worktree remove <워크트리경로>
git worktree prune
git worktree list
```

- 삭제 후 대상 워크트리 경로가 `git worktree list`에 남아 있지 않아야 한다.

### 6. 로컬 브랜치 삭제

```bash
git branch -d <브랜치명>
git branch --list <브랜치명>
```

- `git branch -d`가 squash/rebase merge 이력 때문에 실패하더라도 PR 병합 완료와 로컬 전용 커밋 없음이 확인된 경우에만 `git branch -D <브랜치명>`로 삭제한다.
- 삭제 후 같은 이름의 로컬 브랜치가 남아 있지 않아야 한다.

### 7. main 최신화

- 삭제 작업 뒤 남은 현재 브랜치가 `main`이고 워킹트리가 clean이면 `main`을 fast-forward로 최신화한다.

```bash
git branch --show-current
git status --short
git pull --ff-only origin main
```

### 8. 최종 보고

- 레포별로 PR 병합 여부, 원격 브랜치 삭제 여부, 로컬 워크트리 삭제 여부, 로컬 브랜치 삭제 여부, `main` 최신화 결과를 함께 보고한다.

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

- 완료 판정의 기준 원격 브랜치는 시작 시 선택한 기준과 같아야 한다.
    - main 기준 최신화: `origin/main`
    - 현재 브랜치 기준 최신화: `origin/<현재브랜치명>`

```bash
git rev-list --left-right --count HEAD...<기준원격브랜치>
git rev-list --count --merges <기준원격브랜치>..HEAD
```

- `HEAD...<기준원격브랜치>` 결과가 `N  0`이어야 한다 (`behind=0`).
- `<기준원격브랜치>..HEAD`의 merge commit 수는 `0`이어야 한다.

## 회귀 검증 (레포별 필수)

- 회귀 검증 명령은 [테스트/CI 전략](testing-strategy.md)의 `공통 품질 게이트 (단일 SoT)`를 따른다.

## 재발 방지 체크리스트

- [ ] "기준 브랜치"를 시작 전에 명시했다 (`origin/main` 또는 `origin/<현재브랜치>`)
- [ ] 3개 레포 모두 같은 기준으로 처리했다
- [ ] `behind=0`를 확인했다
- [ ] merge commit 유입이 없음을 확인했다
- [ ] 충돌 마커 잔존이 없다
- [ ] 관련 워크트리/브랜치 정리 요청이면 PR 병합, 원격 브랜치 삭제, 로컬 워크트리 삭제, 로컬 브랜치 삭제, main 최신화 결과를 레포별로 확인했다
- [ ] [테스트/CI 전략](testing-strategy.md)의 공통 품질 게이트 결과를 레포별로 확인했다
