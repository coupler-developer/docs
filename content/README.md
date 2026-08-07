# Coupler 개발 문서

> 이 문서는 docs 홈/환경 안내용이다. 작업 시작 규칙, 필독 문서, 세션 시작 절차의 단일 SoT는 [AGENTS.md](AGENTS.md)다.

## 문서 구조

| 폴더              | 용도                              | 예시                              |
| ----------------- | --------------------------------- | --------------------------------- |
| `architecture/`   | 상태, FSM, 시스템 구조 정의       | 회원 상태란 무엇인가              |
| `flows/`          | 동작 흐름, 시퀀스 다이어그램      | 회원가입 시 어떤 API를 호출하는가 |
| `policy/`         | 개발 정책, 컨벤션                 | 커밋 메시지 규칙                  |
| `releases/`       | 릴리스 범위와 실행 증빙 기록      | 특정 버전이 어떻게 릴리스됐는가   |
| `technical-debt/` | 우선순위 기반 미해결 기술 부채 관리 | 어떤 문제와 후속 조치가 남았는가  |
| `templates/`      | 신규 문서 작성용 표준 템플릿      | 정책·아키텍처 문서를 어떻게 시작하는가 |

## 어디서 시작할까

| 하려는 일 | 시작 문서 | 다음 문서 |
| --- | --- | --- |
| 새 작업·리뷰·상태 확인 | [Workspace AGENTS](AGENTS.md) | 요청 신호에 연결된 policy와 architecture |
| 레포 책임과 연결 관계 파악 | [레포지토리 요약](architecture/repo-overview.md) | 각 레포 행의 도메인 문서 |
| 회원·심사·관리자 권한 | [회원 심사 시스템](architecture/member-review-system.md), [관리자 권한](architecture/admin-permission.md) | [회원 심사 정책](policy/member-review-policy.md), [보안/접근통제 정책](policy/security-access-control-policy.md) |
| 1:1 매칭·Key·일정 | [매칭 시스템](architecture/matching-system.md) | [매칭 운영 정책](policy/matching-ops-policy.md), [매칭 FSM](architecture/matching-fsm.md) |
| 그룹미팅·라운지·채팅 | [그룹미팅 시스템](architecture/group-meeting-system.md), [라운지 시스템](architecture/lounge-system.md), [채팅 시스템](architecture/chat-system.md) | 각 문서 상단의 충돌 시 우선 문서 |
| API 계약·논리 데이터 모델 | [API 공통 응답 계약](policy/api-response-contract-policy.md), [논리 데이터 모델 인덱스](architecture/logical-data-model-index.md) | [API 계약 패키지 정책](policy/api-client-contract-package-policy.md), [논리 데이터 모델 정책](policy/logical-data-model-policy.md) |
| 배포·릴리스 | [릴리스 프로세스](policy/release-process.md) | [운영 릴리스 실행 런북](flows/cross-project/production-deploy-command-runbook.md) |
| docs 작성·구조 변경 | [문서 거버넌스 정책](policy/document-governance-policy.md) | [GitHub의 `content/templates/`](https://github.com/coupler-developer/docs/tree/main/content/templates) |

첫 문서를 연 뒤에는 상단의 `충돌 시 우선 문서`와 `관련 문서`를 따라가며 판정 책임별 단일 SoT를 확인한다.

## 개발환경 구성

1. 공용 워크스페이스 폴더를 만든다.
2. Git 작업은 SSH를 기본으로 설정한 뒤, org에 있는 아래 4개 레포를 워크스페이스 하위
   폴더로 `git clone` 한다.

   ```bash
   gh auth login -h github.com -p ssh
   gh auth setup-git
   ssh -T git@github.com
   ```

   - coupler-api: `git@github.com:coupler-developer/coupler-api.git`
   - coupler-admin-web: `git@github.com:coupler-developer/coupler-admin-web.git`
   - coupler-mobile-app: `git@github.com:coupler-developer/coupler-mobile-app.git`
   - docs: `git@github.com:coupler-developer/docs.git`

3. GitHub Packages private npm package를 설치하는 repo에서는 개발자 개인 계정의
   user-level 인증을 설정한다. repo `.npmrc`에는 token 값이나 `${NODE_AUTH_TOKEN}`
   placeholder를 커밋하지 않는다.

   ```bash
   gh auth status -h github.com
   gh auth login -h github.com -p ssh
   gh auth refresh -h github.com -s read:packages
   npm config set --location=user @coupler-developer:registry https://npm.pkg.github.com
   npm config set --location=user //npm.pkg.github.com/:_authToken "$(gh auth token)"
   ```

   SSH는 Git clone/fetch/push 인증만 처리한다. `npm.pkg.github.com` package 설치에는
   별도의 `read:packages` npm registry 인증이 계속 필요하다.

   EC2 또는 배포 호스트에서 직접 `yarn install`을 실행하는 경우도 동일하다. GitHub
   Packages의 `Manage Actions access`는 GitHub Actions 전용 권한이며, SSH로 접속한
   `ubuntu`/`deploy`/`root` shell에는 적용되지 않는다. 설치를 실행하는 OS 사용자의
   user-level npm 설정에 registry와 `read:packages` token을 저장해야 한다.

4. 워크스페이스 루트에 `AGENTS.md`를 만들고 아래 내용을 넣는다. 이 파일은 새 세션이 docs의 전체 실행
   규칙에 도달하기 위한 최소 bootstrap과, 새 작업을 만들기 전에 적용할 안전 Gate만 유지한다.

   ```text
   # AGENTS (워크스페이스 전용)

   이 워크스페이스는 `docs/content/AGENTS.md`를 최우선으로 따른다.
   항상 워크스페이스 루트를 열고 작업한다.
   개별 레포지토리를 단독으로 열지 않는다.

   ## 기존 작업 우선 게이트

   - 리뷰·상태 확인은 사용자가 명시하거나 직전 요청에서 합의한 레포·ref·파일/변경 범위로 고정한다.
     `최종리뷰` 같은 짧은 후속 요청은 직전 범위를 상속하며, 상속할 범위가 없거나 새 지시만으로 대상을 확정할
     수 없으면 범위 밖 브랜치·워크트리·PR을 탐색하기 전에 사용자에게 확인한다.
   - 변경·브랜치·PR 작업에서 새 브랜치·워크트리·PR을 만들기 전에만 같은 범위의 기존 작업 후보를 확인한다.
   - 적합해 보이는 기존 작업 후보가 있어도 자동으로 전환하지 않는다. 후보와 연관 근거를 보고하고 사용자가
     계속할 작업을 확인할 때까지 기존 작업 전환과 새 작업 생성을 모두 중지한다.
     같은 범위의 활성 PR을 병렬로 유지하지 않는다.

   ## PR reviewer 요청 금지 게이트

   - 브랜치 push, PR 생성·업데이트, "PR 올려줘" 요청은 GitHub reviewer 요청·지정 권한을 포함하지 않는다.
   - 사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하기 전에는 `Request reviewer`를 실행하거나
     reviewer를 추가·재요청·교체·제거하지 않는다. 적합한 reviewer를 에이전트가 임의로 추정해서도 안 된다.
   - 기존 reviewer 상태의 read-only 확인은 허용하지만, 사용자 승인 없이 reviewer 상태를 변경하지 않는다.
   ```

5. IDE에서 워크스페이스 루트를 열고 작업한다(개별 레포 단독 오픈 금지).
6. 첫 작업 전에는 `docs/content/AGENTS.md`를 열고 `ACK: BOOT@YYYY-MM-DD`를 출력한 뒤 요청·단계별 필수 문서를 라우팅한다.

## 문서 검증

1. Node 의존성 설치: `yarn install --frozen-lockfile`
2. Python 의존성 설치: `python3 -m pip install -r requirements.txt`
3. 문서 통합 검증: `yarn verify`

- `yarn validate:docs-structure`는 메타데이터 형식, 역할-문서 종류 조합, 디렉터리 분류, 전환 추적 경계,
  독립 템플릿, `content/AGENTS.md` 인덱스, `mkdocs.yml` `nav` 정합성을 검증한다.
- `yarn validate:document-lifecycle`는 모든 nav·인덱스 대상 문서의 current stable ID·routing 분류·필수 Gate,
  route target 역참조와 retirement ledger의 삭제된 ID·경로 예약을 검증한다. 로컬에서는 사용 가능한
  `origin/main`, PR에서는 base SHA, main 배포에서는 push 이전 SHA와 비교해 무기록 삭제·rename, retirement
  변경과 ID·경로 재사용을 차단한다.
- `main` 유입 단계에서 이 검증을 강제하려면 GitHub 보호 설정에 `docs-structure`, `markdown-lint`,
  `build-docs`를 필수 status check로 지정하고 관리자 우회를 막아야 한다. 보호 설정이 없으면 직접 push는
  저장소에 들어갈 수 있고 main 배포 Gate가 이후 배포만 차단한다.
- `yarn validate:agent-workflow`는 새 세션 bootstrap, 요청 유형·권한·상태의 폐쇄형 구조, registry에서 파생한
  신호별 필수 문서와 workspace bootstrap 안전 Gate를 검증한다. 공용 workspace에서는 실제 workspace root
  `AGENTS.md`도 README의 bootstrap 계약과 비교한다.
- 작업 실행 계약을 바꿀 때는 `content/AGENTS.md`, lifecycle route와 구조 회귀 테스트를 같은 변경 단위에서
  동기화한다. 자유 문장의 의미와 간결성은 문서 안정성 평가에서 판정한다.
- 문서 추가·이동 시 `document-lifecycle-registry.json`을 함께 갱신한다. 삭제 시 current 항목을 제거하고
  `document-retirement-ledger.json`에 stable ID와 모든 과거 경로를 예약한다.
- 논리 데이터 모델의 상세 표를 바꿨다면 `yarn generate:logical-data-model`로 쉬운 그림과 catalog를 다시
  만든다.
- `yarn build:docs`는 내부적으로 `python3 -m mkdocs build --strict`를 실행한다.
- `yarn verify`는 `yarn validate:docs`를 통해 공통 정적 검증, Markdown lint, MkDocs strict build를 순서대로 실행한다.
