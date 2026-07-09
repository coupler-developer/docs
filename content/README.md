# Coupler 개발 문서

> 이 문서는 docs 홈/환경 안내용이다. 작업 시작 규칙, 필독 문서, 세션 시작 절차의 단일 SoT는 [AGENTS.md](AGENTS.md)다.

## 문서 구조

| 폴더            | 용도                         | 예시                              |
| --------------- | ---------------------------- | --------------------------------- |
| `architecture/` | 상태, FSM, 시스템 구조 정의  | 회원 상태란 무엇인가              |
| `flows/`        | 동작 흐름, 시퀀스 다이어그램 | 회원가입 시 어떤 API를 호출하는가 |
| `policy/`       | 개발 정책, 컨벤션            | 커밋 메시지 규칙                  |
| `technical-debt/` | 기술 부채 관리               | 우선순위 기반 개선 과제 관리       |

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

4. 워크스페이스 루트에 `AGENTS.md`를 만들고 아래 내용을 넣는다.
5. IDE에서 워크스페이스 루트를 열고 작업한다(개별 레포 단독 오픈 금지).
6. 첫 작업 전에는 반드시 `docs/content/AGENTS.md`를 열고 Core 4 문서 선열람, 첫 응답 `ACK/EVIDENCE` 형식, 선열람 전 명령 실행 금지 규칙까지 확인한다.

## 문서 검증

1. Python 의존성 설치: `python3 -m pip install -r requirements.txt`
2. 문서 구조 검증: `yarn validate:docs-structure`
3. Markdown lint 검증: `yarn lint:md`
4. 문서 빌드 검증: `yarn build:docs`

- `yarn validate:docs-structure`는 메타데이터 형식, `content/AGENTS.md` 인덱스, `mkdocs.yml` `nav` 정합성을 검증한다.
- `yarn build:docs`는 내부적으로 `python3 -m mkdocs build --strict`를 실행한다.
- `yarn validate:docs`로 구조 검증, 릴리스 기록 검증, API 에러 문서 검증, 릴리즈 preflight 스크립트 검증, lint, 빌드를 한 번에 실행할 수 있다.

```text
# AGENTS (워크스페이스 전용)

이 워크스페이스는 `docs/content/AGENTS.md`를 최우선으로 따른다.
항상 워크스페이스 루트를 열고 작업한다.
개별 레포지토리를 단독으로 열지 않는다.
```

## 모바일 에뮬레이터 주의사항 (iOS)

- iOS Simulator에서 소프트웨어 키보드가 내려가 있을 때는 입력 필드를 먼저 터치(클릭)해야 터치 이벤트 기반 포커스가 정상 동작한다.
- `Command + K`는 소프트웨어 키보드 표시/숨김 토글이다.
- 하드웨어 키보드 연결(`I/O > Keyboard > Connect Hardware Keyboard`)이 켜져 있으면 입력이 하드웨어 키보드 경로로 처리되어, 터치 이벤트 기반 동작(포커스/키보드 노출 트리거) 재현이 기대와 다를 수 있다.
- [Apple Simulator 문서](https://developer.apple.com/library/archive/documentation/IDEs/Conceptual/iOS_Simulator_Guide/InteractingwithiOSandwatchOS/InteractingwithiOSandwatchOS.html)
