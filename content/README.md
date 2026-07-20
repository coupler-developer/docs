# Coupler 개발 문서

> 이 문서는 docs 홈/환경 안내용이다. 작업 시작 규칙, 필독 문서, 세션 시작 절차의 단일 SoT는 [AGENTS.md](AGENTS.md)다.

## 문서 구조

| 폴더              | 용도                              | 예시                              |
| ----------------- | --------------------------------- | --------------------------------- |
| `architecture/`   | 상태, FSM, 시스템 구조 정의       | 회원 상태란 무엇인가              |
| `flows/`          | 동작 흐름, 시퀀스 다이어그램      | 회원가입 시 어떤 API를 호출하는가 |
| `policy/`         | 개발 정책, 컨벤션                 | 커밋 메시지 규칙                  |
| `releases/`       | 배포 범위와 실행 증빙 기록        | 특정 버전이 어떻게 배포됐는가     |
| `technical-debt/` | 우선순위 기반 미해결 기술 부채 관리 | 어떤 문제와 후속 조치가 남았는가  |
| `templates/`      | 신규 문서 작성용 표준 템플릿      | 정책·아키텍처 문서를 어떻게 시작하는가 |

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

   - 브랜치, 워크트리, PR을 만들기 전에 대상 레포의 기존 워크트리, 로컬·원격 브랜치, 열린 PR을 확인한다.
     리뷰나 상태 확인만 요청받았으면 새 작업을 만들지 않는다.
   - 같은 요청, 연관 PR·이슈, 도메인 또는 SoT를 다루는 적합한 기존 작업이 있으면 세션이 바뀌어도 해당
     브랜치·워크트리·PR에서 계속한다.
   - 기존 구조가 부적합해 대체 작업이 필요하면 관련 Git·리뷰 정책에 따라 근거와 이관·정리 계획을 먼저
     보고하고 사용자 승인을 받는다. 같은 범위의 활성 PR을 병렬로 유지하지 않는다.

   ## PR reviewer 요청 금지 게이트

   - 브랜치 push, PR 생성·업데이트, "PR 올려줘" 요청은 GitHub reviewer 요청·지정 권한을 포함하지 않는다.
   - 사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하기 전에는 `Request reviewer`를 실행하거나
     reviewer를 추가·재요청·교체·제거하지 않는다. 적합한 reviewer를 에이전트가 임의로 추정해서도 안 된다.
   - 기존 reviewer 상태의 read-only 확인은 허용하지만, 사용자 승인 없이 reviewer 상태를 변경하지 않는다.
   ```

5. IDE에서 워크스페이스 루트를 열고 작업한다(개별 레포 단독 오픈 금지).
6. 첫 작업 전에는 반드시 `docs/content/AGENTS.md`를 열고 Core 4 문서 선열람, 첫 응답 `ACK/EVIDENCE` 형식, 선열람 전 명령 실행 금지 규칙까지 확인한다.

## 문서 검증

1. Node 의존성 설치: `yarn install --frozen-lockfile`
2. Python 의존성 설치: `python3 -m pip install -r requirements.txt`
3. 문서 통합 검증: `yarn validate:docs`

- `yarn validate:docs-structure`는 메타데이터 형식, 역할-문서 종류 조합, 디렉터리 분류, 전환 추적 경계,
  독립 템플릿, `content/AGENTS.md` 인덱스, `mkdocs.yml` `nav` 정합성을 검증한다.
- `yarn validate:document-lifecycle`는 모든 nav·인덱스 대상 문서의 stable ID·active/retired 상태·routing 분류·필수 Gate,
  route target 역참조를 검증한다. 로컬에서는 사용 가능한 `origin/main`, PR에서는 base SHA, main 배포에서는
  push 이전 SHA의 registry와 비교해 문서·route ID 삭제, tombstone 변경, 무기록 rename과 책임 제거를 차단한다.
- `main` 유입 단계에서 이 검증을 강제하려면 GitHub 보호 설정에 `docs-structure`, `markdown-lint`,
  `build-docs`를 필수 status check로 지정하고 관리자 우회를 막아야 한다. 보호 설정이 없으면 직접 push는
  저장소에 들어갈 수 있고 main 배포 Gate가 이후 배포만 차단한다.
- `yarn validate:agent-workflow`는 새 세션의 Core 4 열람, 요청별 동작·종료 조건, 권한 경계,
  신호별 SoT·필수 Gate, 상태별 동작, 단계별 재고정, 완료 증빙, 검증 대상 절의 미인식 지시 부재와 workspace
  bootstrap 안전 게이트를 검증한다.
- 작업 실행 계약을 의도적으로 바꿀 때는 `content/AGENTS.md`, validator descriptor와 반대 조건 회귀 테스트를
  같은 변경 단위에서 동기화한다. 검증 대상 절에 descriptor에 없는 지시를 추가하면 검증은 실패한다.
- 문서 추가·이동·삭제 시 `document-lifecycle-registry.json`을 함께 갱신한다. 문서와 registry 항목을 동시에
  지워 이력을 없애지 않으며, 삭제 항목은 영구 tombstone으로 유지한다.
- 논리 데이터 모델의 상세 표를 바꿨다면 `yarn generate:logical-data-model`로 쉬운 그림과 catalog를 다시
  만든다.
- `yarn build:docs`는 내부적으로 `python3 -m mkdocs build --strict`를 실행한다.
- `yarn validate:docs`는 공통 정적 검증, Markdown lint, MkDocs strict build를 순서대로 실행한다.

## 모바일 에뮬레이터 주의사항 (iOS)

- iOS Simulator에서 소프트웨어 키보드가 내려가 있을 때는 입력 필드를 먼저 터치(클릭)해야 터치 이벤트 기반 포커스가 정상 동작한다.
- `Command + K`는 소프트웨어 키보드 표시/숨김 토글이다.
- 하드웨어 키보드 연결(`I/O > Keyboard > Connect Hardware Keyboard`)이 켜져 있으면 입력이 하드웨어 키보드 경로로 처리되어, 터치 이벤트 기반 동작(포커스/키보드 노출 트리거) 재현이 기대와 다를 수 있다.
- [Apple Simulator 문서](https://developer.apple.com/library/archive/documentation/IDEs/Conceptual/iOS_Simulator_Guide/InteractingwithiOSandwatchOS/InteractingwithiOSandwatchOS.html)
