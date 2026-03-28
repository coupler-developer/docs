# 배포 태그/릴리즈 프로세스

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- Production 배포 단위를 `git tag`로 고정해, "무엇이 언제 배포됐는지"를 추적한다.
- 문제 발생 시 "어느 버전으로 롤백할지" 기준점을 만든다.
- GitHub Release로 변경점/주의사항을 한 곳에 모은다.

> 참고: `docs/site/`는 `mkdocs build`가 생성하는 정적 사이트 빌드 산출물이다. 커밋 대상이 아니라 `.gitignore`로 제외한다.

## 적용 범위

- `coupler-api`
- `coupler-admin-web`
- `coupler-mobile-app`
- `docs`

> 이 워크스페이스는 레포가 여러 개라서, **태그는 레포별로 따로** 만든다.

## 용어 정리

- 개발계(EC2): 서버에 접속해서 배포/검증하는 개발 환경
- 운영(Production): 실사용자 대상 환경
- NextPush `Staging`/`Production`: 서버 환경이 아니라 **모바일 OTA 배포 채널 이름**

## 현재 배포 대상(정리)

- 개발계(EC2) 배포 대상: `coupler-api`, `coupler-admin-web`
- 모바일 배포 대상: `coupler-mobile-app` (EC2 배포 없음, 스토어/OTA로 배포)
- 문서 배포 대상: `docs` (GitHub Pages + GitHub Release)

## 릴리즈 운영 모델 (단계별)

> 이 섹션은 과도기 운영 규칙이다. 3단계(자동 검증)까지 정착되면 1~2단계 설명은 제거하고, 최종 통합 릴리즈 규칙만 남긴다.

### 1단계 (현재)

- 문서 레포(`docs`) 단독으로 Release를 운영한다.
- `main` push는 문서 사이트 배포(MkDocs Pages), `v*.*.*` 태그 push는 Docs GitHub Release 생성으로 사용한다.
- 이 단계의 목적은 release 파이프라인 안정화다.

### 2단계 (확장)

- `docs` 버전을 워크스페이스 통합 버전으로 간주한다.
- 같은 버전(`vX.Y.Z`)에 대해 아래 3개 레포의 반영 기준점을 함께 기록한다.
- `coupler-mobile-app` 태그/커밋
- `coupler-api` 태그/커밋
- `coupler-admin-web` 태그/커밋
- 즉, 문서 릴리즈는 "문서만의 버전"이 아니라 "해당 시점 서비스 구성 버전"의 인덱스 역할을 한다.
- 메이저 릴리즈에서는 `docs`가 릴리즈 제어판 역할을 한다. 즉, `docs/content/releases/vX.Y.Z.md`를 `main`에 먼저 반영하고 `docs` 태그를 선행 push해 초기 Release Note를 생성할 수 있다.
- 단, 이 예외는 `docs`에만 적용한다. `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 태그는 여전히 실제 운영 배포와 검증 완료 후에만 생성한다.
- `docs` 선행 태그로 생성된 Release Note는 "초기 배포 계획 + 체크리스트" 상태로 간주한다. 실배포가 끝나면 GitHub Release 본문을 최종 상태로 갱신한다.

### 3단계 (자동 검증)

- docs release 워크플로우에서 통합 버전 메타데이터를 검증한다.
- 참조한 레포/태그/커밋이 실제 존재하지 않으면 release를 실패 처리한다.
- 누락 없는 버전 스냅샷만 배포 기록으로 남긴다.

## 태그 규칙

- 태그 이름: `vMAJOR.MINOR.PATCH` (예: `v1.2.0`, `v1.2.1`)
- 태그는 **annotated tag**만 사용: `git tag -a ...`
- 원칙: **Production 배포가 끝나고 검증까지 완료된 커밋**에 태그를 찍는다.
- 예외: `docs` 레포는 메이저 릴리즈 제어판을 먼저 열기 위해, `docs/content/releases/vX.Y.Z.md`가 `main`에 포함된 상태라면 서비스 배포 전에 태그를 선행 생성할 수 있다.

## 버전 올리는 기준 (SemVer)

- `MAJOR`: 호환 깨짐(Breaking change)
- `MINOR`: 기능 추가(하위 호환 유지)
- `PATCH`: 버그 수정/핫픽스(하위 호환 유지)

## 통합 메이저 릴리즈 실행 순서

대상: `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`, `docs`, 운영 `RDS`

### 0) 릴리즈 기록 문서 선반영

- `docs/content/releases/vX.Y.Z.md`를 먼저 작성하고 `main`에 병합한다.
- 문서에는 아래를 최소 포함한다.
    - 릴리즈 목표/범위
    - `RDS -> API/Admin EC2 -> Mobile -> RDS contract` 순서
    - 적용 대상 SQL/Gate
    - 서비스 레포 목표 태그 또는 목표 commit SHA
    - 검증 시나리오와 롤백 기준

### 1) docs 태그 push로 초기 Release Note 생성

- `docs` 레포에서만 아래 순서를 먼저 수행할 수 있다.

```bash
git checkout main
git pull --ff-only
TAG=v2.0.0
git tag -a "${TAG}" -m "Release ${TAG}"
git push origin "${TAG}"
```

- 이 단계의 목적은 GitHub Release를 "배포 제어판"으로 먼저 여는 것이다.
- 이 시점 Release Note 상태는 `planned` 또는 `in_progress`로 둔다.
- 서비스 레포 태그를 대신하는 행위가 아니다.

### 2) 운영 RDS 선반영

- 운영 `RDS` 반영은 워크스페이스 루트 `ritzy운영-coupler운영_마이그레이션_가이드/25_EXECUTION_PROCEDURE.md`와 [DB Migration Gate 정책](db-migration-gate-policy.md)을 단일 기준으로 따른다.
- 운영 절차는 `운영 dump baseline -> local full replay -> 개발계 검증 -> 운영계 반영 -> 운영계 postcheck` 순서를 고정한다.
- live DB에서는 `00_EXECUTION_ORDER.txt`의 주석 조건을 그대로 따른다.
- 특히 `44_drop_manager_detail_profile_master_columns_after_cutover.sql`, `45_drop_manager_detail_profile_preview_column_after_cutover.sql`는 서비스 cutover와 legacy read/write 0건 확인 전에는 실행 금지다.

### 3) API/Admin EC2 배포

- `coupler-api`, `coupler-admin-web`는 운영 `EC2`에 반영한다.
- 배포 전 [테스트/CI 전략](testing-strategy.md)의 공통 품질 게이트를 완료한다.
- API는 운영 반영 후 루트 응답, 핵심 app/admin API, 에러 로그를 확인한다.
- Admin은 운영 URL 로그인, 핵심 운영 화면 진입, 주요 액션 1회를 확인한다.

### 4) Mobile 배포

- `coupler-mobile-app`은 스토어 binary 배포와 OTA 배포를 분리한다.
- native 변경이 포함된 메이저 릴리즈는 스토어 binary(iOS/Android)를 먼저 배포한다.
- OTA는 스토어 배포 이후 JS-only 후속 수정에만 사용한다.
- 버전값은 Android `versionCode`/`versionName`, iOS `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION`를 함께 올린다.

### 5) 운영 안정화 확인 후 RDS contract/drop

- `DBM-GATE-400`이 적용되는 SQL은 아래를 모두 충족할 때만 실행한다.
    - API/Admin/Mobile 신계약 버전 운영 반영 완료
    - legacy read/write 0건 로그 확보
    - 운영 postcheck guard 통과
- 위 조건 미충족이면 contract/drop은 이번 릴리즈에서 제외하고 릴리즈 상태를 `완료`로 닫지 않는다.

### 6) 서비스 레포 태그 생성

- `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`는 실제 운영 배포와 검증이 완료된 커밋에 태그를 생성한다.
- 서비스 레포 태그는 `docs` 선행 태그와 별개이며, 예외 없이 post-deploy 원칙을 따른다.

### 7) docs Release Note 최종화

- 초기 생성된 `docs` GitHub Release 본문에 아래를 최종 반영한다.
    - 실제 반영 완료 시각
    - `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 최종 태그/SHA
    - 운영 `RDS` 적용 SQL/Gate/로그 경로
    - 검증 결과와 롤백 기준
- 초기 상태가 `planned` 또는 `in_progress`였다면, 모든 반영과 검증이 끝난 뒤 `released` 상태로 갱신한다.

## EC2 배포 (API/Admin)

대상: `coupler-api`, `coupler-admin-web`

> 참고: 현재 서비스 레포들의 GitHub Actions는 기본적으로 `pull_request`에서만 돌고, `tag push`로 자동 배포가 트리거되지 않는다.
> 따라서 이 문서의 태그/릴리즈는 “자동 배포 버튼”이 아니라 **배포 기록(감사 로그)과 롤백 기준점**을 만드는 목적이다.

### 1) 배포 커밋 확정 (main 고정)

```bash
git checkout main
git pull --ff-only
git status
```

- `git status`가 깨끗한지 확인한다.
- 배포 대상 PR이 모두 `main`에 병합됐는지 확인한다.

### 2) EC2 배포 수행

- 배포 전 기술 판정은 [엔지니어링 가드레일](engineering-guardrails.md)의 `No Findings 게이트`를 단일 기준으로 따른다.
- 리뷰 대상 범위에서 finding이 1건이라도 있으면 배포를 진행하지 않고, `원인 분석 -> 수정 -> 테스트/CI 전략의 공통 품질 게이트 및 필수 정책 검사 재검증 -> 재리뷰`를 `No Findings`까지 반복한다.
- 레포/플랫폼별 배포 가이드를 따른다.
- `coupler-api`와 `coupler-admin-web`의 운영 반영 방식은 다르다.
    - `coupler-api`: 프로세스 앱으로 배포하고 `pm2`로 관리한다.
    - `coupler-admin-web`: `yarn build` 결과물(`build/`)만 EC2에 업로드하고 `nginx`가 정적 서빙한다.
- `coupler-admin-web` 운영 배포 시 `react-scripts start`, `pm2 start ./node_modules/react-scripts/scripts/start.js`, CRA 개발 서버 기반 서빙을 금지한다.
- `coupler-admin-web`의 서버 준비, artifact 업로드, `nginx` 설정, `pm2 save`, 검증, 롤백 절차는 [Admin 운영 배포 런북](../flows/cross-project/admin-web-production-deploy-flow.md)을 단일 실행 기준으로 따른다.

- 배포 후 아래를 확인한다.
    - API: `GET /health` 200 확인, 에러 로그 확인(최소 10-30분)
    - Admin: 로그인, 핵심 화면 1-2개(예: 심사/회원관리) 진입 및 주요 액션 1회 확인
    - Admin: 브라우저 콘솔에 CRA 개발 서버 WebSocket(`:8000/ws`) 재연결 오류가 없는지 확인

### 3) 태그 생성 및 push (배포 완료 후)

- 반드시 `main` 브랜치(배포 검증 완료 커밋)에서 태그를 생성한다.

```bash
# 예: v1.2.1 릴리즈
TAG=v1.2.1
git tag -a "${TAG}" -m "Release ${TAG}"

# 태그 커밋이 origin/main 계보에 포함되는지 확인 (실패 시 중단)
TAG_COMMIT="$(git rev-list -n 1 "${TAG}")"
git merge-base --is-ancestor "${TAG_COMMIT}" origin/main

git push origin "${TAG}"
```

검증:

```bash
git show "${TAG}"
git ls-remote --tags origin "${TAG}"
```

### 4) GitHub Release 발행 (배포 노트 기록)

- GitHub UI에서 `v1.2.1` 태그 기준으로 Release를 생성한다.
- CLI를 쓸 경우(선택):

```bash
# 임시 파일 생성 후 업로드 (여러 줄 노트용)
cat > /tmp/release-notes-v1.2.1.md <<'EOF'
## Summary
- (한 줄) 이번 배포의 핵심
EOF

gh release create v1.2.1 --title "v1.2.1" --notes-file /tmp/release-notes-v1.2.1.md
```

## Docs 배포 (GitHub Pages + Tag Release)

대상: `docs`

- `main` 브랜치에 push되면 `deploy-docs.yml`로 GitHub Pages가 배포된다.
- `v*.*.*` 태그가 push되면 `release.yml`이 동작해 GitHub Release를 자동 생성한다.
- Release에는 `mkdocs build --strict` 결과물(`docs-site-vX.Y.Z.tar.gz`)이 첨부된다.
- Release 노트는 이전 기준점(이전 태그, 첫 릴리스면 초기 커밋) 대비 변경을 자동 생성한다.
- 자동 노트는 `사용자에게 보이는 변경`과 `내부 개선`으로 나뉜다.
- 태그 시점에 `content/releases/vX.Y.Z.md`가 포함돼 있으면 Release 노트에 해당 문서 링크가 자동 포함된다.
- `content/releases/vX.Y.Z.md`가 있으면 Release 노트 상단에 `목적`, `릴리스 상태`, `메인 흐름` 요약을 먼저 노출한다.
- 첫 릴리스처럼 이전 태그가 없으면 전체 문서 히스토리가 비교 범위에 포함될 수 있으므로, 실제 배포 판단은 `content/releases/vX.Y.Z.md`를 우선 기준으로 확인한다.

### 1) 통합 버전 기록 문서 준비 (2단계부터 적용)

- `docs/content/releases/vX.Y.Z.md` 문서를 먼저 작성하고 `main`에 반영한다.
- 메이저 릴리즈에서는 이 문서를 배포 전 체크리스트로 먼저 작성하고, `docs` 태그 push 후 생성된 Release Note의 기준 문서로 사용한다.
- 각 레포 반영 버전
- `coupler-mobile-app`: `vX.Y.Z` 또는 commit SHA
- `coupler-api`: `vX.Y.Z` 또는 commit SHA
- `coupler-admin-web`: `vX.Y.Z` 또는 commit SHA
- 릴리즈 검증 결과(핵심 시나리오, 롤백 기준)
- 이 문서가 태그 커밋에 포함되어야 릴리즈 기준점과 동일 스냅샷으로 추적할 수 있다.

### 2) 태그 생성 및 push

```bash
git checkout main
git pull --ff-only
TAG=v1.0.0
git tag -a "${TAG}" -m "Release ${TAG}"

# 태그 커밋이 origin/main 계보에 포함되는지 확인 (실패 시 중단)
TAG_COMMIT="$(git rev-list -n 1 "${TAG}")"
git merge-base --is-ancestor "${TAG_COMMIT}" origin/main

git push origin "${TAG}"
```

### 3) 자동 릴리즈 확인

- GitHub Actions에서 `Release Docs` 워크플로우 성공 여부를 확인한다.
- GitHub Releases에서 동일 태그(`v1.0.0`)가 생성됐는지 확인한다.
- Release 본문에 `content/releases/v1.0.0.md` 링크가 포함됐는지 확인한다(2단계부터).
- 메이저 릴리즈에서 `docs` 태그를 선행 push한 경우, 서비스 반영 완료 후 GitHub Release 본문을 수동으로 최종 상태로 갱신한다.

### 4) 예외 처리 (2단계부터)

- Release 본문에 통합 버전 기록 링크가 없으면 `release.yml`/스크립트 오류로 간주하고 수정 후 태그부터 다시 진행한다.

## 모바일 배포 (스토어/OTA)

대상: `coupler-mobile-app`

- 모바일은 EC2에 배포하지 않는다.
- 배포 단위는 "스토어 빌드" 또는 "NextPush OTA 배포"이다.
- NextPush의 `Staging`/`Production`은 서버 환경이 아니라 **OTA 배포 채널 이름**이다.

### 1) 배포 유형 선택

- 스토어 배포: 앱 바이너리(iOS/Android) 업데이트
- OTA 배포: NextPush(CodePush)로 JS 번들 업데이트

### 2) OTA 배포 (NextPush)

레포 스크립트:

```bash
# Android
yarn codepush-and-stag
yarn codepush-and-prod

# iOS
yarn codepush-ios-stag
yarn codepush-ios-prod
```

### 3) 태그/릴리즈 남기기

- OTA/스토어 배포가 끝나고 검증한 커밋에 태그를 찍는다.
- GitHub Release에는 "어느 채널에 배포했는지(NextPush Staging/Production)"와 "검증 시나리오"를 남긴다.

## 릴리즈 노트 템플릿

```markdown
## Summary
- (한 줄) 이번 배포의 핵심

## Changes
- PR/커밋 단위 변경점

## Deploy Notes
- 운영 반영 순서, 마이그레이션 유무, feature flag 등

## Verification
- 배포 후 확인한 시나리오/지표

## Rollback
- 롤백 기준 태그: vX.Y.Z
- 롤백 방법(레포/플랫폼별 한 줄)
```

## 레거시 DB 제거 릴리즈 체크리스트 (강제)

- 적용 대상: DB 마이그레이션에서 `contract(레거시 제거)`가 포함된 릴리즈
- 실행 순서: 아래 순서를 고정한다.

1. 의존성 0건 확인
2. 일정 기간 read/write 0건 모니터링
3. 1, 2를 충족한 뒤 레거시 DB `drop` 실행

- 근거 기록: PR/릴리즈 노트에 `DBM-GATE-400` 결과와 로그 경로를 함께 남긴다.
- fail-closed:
    - 1, 2 미충족이면 `drop` 실행 금지
    - 3 미완료면 릴리즈 상태를 `미완료`로 유지(릴리즈 완료 금지)

## 자주 하는 실수 체크

- 태그를 `main`이 아닌 다른 브랜치/커밋에 찍음
- 태그를 만들고 `git push origin <tag>`를 안 해서 원격에 없음
- lightweight tag(`git tag v1.2.1`)로 찍어서 메타데이터(작성자/메시지) 추적이 약해짐
