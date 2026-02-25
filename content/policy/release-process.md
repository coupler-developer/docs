# 배포 태그/릴리즈 프로세스

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

### 3단계 (자동 검증)

- docs release 워크플로우에서 통합 버전 메타데이터를 검증한다.
- 참조한 레포/태그/커밋이 실제 존재하지 않으면 release를 실패 처리한다.
- 누락 없는 버전 스냅샷만 배포 기록으로 남긴다.

## 태그 규칙

- 태그 이름: `vMAJOR.MINOR.PATCH` (예: `v1.2.0`, `v1.2.1`)
- 태그는 **annotated tag**만 사용: `git tag -a ...`
- 원칙: **Production 배포가 끝나고 검증까지 완료된 커밋**에 태그를 찍는다.

## 버전 올리는 기준 (SemVer)

- `MAJOR`: 호환 깨짐(Breaking change)
- `MINOR`: 기능 추가(하위 호환 유지)
- `PATCH`: 버그 수정/핫픽스(하위 호환 유지)

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

- 레포/플랫폼별 배포 가이드를 따른다.
- 배포 후 아래를 확인한다.
  - API: `GET /health` 200 확인, 에러 로그 확인(최소 10-30분)
  - Admin: 로그인, 핵심 화면 1-2개(예: 심사/회원관리) 진입 및 주요 액션 1회 확인

### 3) 태그 생성 및 push (배포 완료 후)

- 반드시 `main` 브랜치(배포 검증 완료 커밋)에서 태그를 생성한다.

```bash
# 예: v1.2.1 릴리즈
git tag -a v1.2.1 -m "Release v1.2.1"
git push origin v1.2.1
```

검증:

```bash
git show v1.2.1
git ls-remote --tags origin v1.2.1
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

### 1) 태그 생성 및 push

```bash
git checkout main
git pull --ff-only
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### 2) 자동 릴리즈 확인

- GitHub Actions에서 `Release Docs` 워크플로우 성공 여부를 확인한다.
- GitHub Releases에서 동일 태그(`v1.0.0`)가 생성됐는지 확인한다.

### 3) 통합 버전 기록 (2단계부터 적용)

- `docs/content/releases/vX.Y.Z.md` 문서를 생성해 아래를 기록한다.
- 각 레포 반영 버전
- `coupler-mobile-app`: `vX.Y.Z` 또는 commit SHA
- `coupler-api`: `vX.Y.Z` 또는 commit SHA
- `coupler-admin-web`: `vX.Y.Z` 또는 commit SHA
- 릴리즈 검증 결과(핵심 시나리오, 롤백 기준)
- release 노트에서 위 문서를 링크한다.

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

## 자주 하는 실수 체크

- 태그를 `main`이 아닌 다른 브랜치/커밋에 찍음
- 태그를 만들고 `git push origin <tag>`를 안 해서 원격에 없음
- lightweight tag(`git tag v1.2.1`)로 찍어서 메타데이터(작성자/메시지) 추적이 약해짐
