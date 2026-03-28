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
2. org에 있는 아래 4개 레포를 워크스페이스 하위 폴더로 `git clone` 한다.
   - coupler-api: <https://github.com/coupler-developer/coupler-api>
   - coupler-admin-web: <https://github.com/coupler-developer/coupler-admin-web>
   - coupler-mobile-app: <https://github.com/coupler-developer/coupler-mobile-app>
   - docs: <https://github.com/coupler-developer/docs>

3. 워크스페이스 루트에 `AGENTS.md`를 만들고 아래 내용을 넣는다.
4. IDE에서 워크스페이스 루트를 열고 작업한다(개별 레포 단독 오픈 금지).
5. 첫 작업 전에는 반드시 `docs/content/AGENTS.md`를 열고 Core 4 문서 선열람, 첫 응답 `ACK/EVIDENCE` 형식, 선열람 전 명령 실행 금지 규칙까지 확인한다.

## 문서 검증

1. Python 의존성 설치: `python3 -m pip install -r requirements.txt`
2. 문서 구조 검증: `yarn validate:docs-structure`
3. Markdown lint 검증: `yarn lint:md`
4. 문서 빌드 검증: `yarn build:docs`

- `yarn validate:docs-structure`는 메타데이터 형식, `content/AGENTS.md` 인덱스, `mkdocs.yml` `nav` 정합성을 검증한다.
- `yarn build:docs`는 내부적으로 `python3 -m mkdocs build --strict`를 실행한다.
- `yarn validate:docs`로 구조 검증, lint, 빌드를 한 번에 실행할 수 있다.

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
