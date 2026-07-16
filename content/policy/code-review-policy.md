# 코드 리뷰 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

코드 품질 향상 및 지식 공유를 통한 팀 전체의 역량 강화

## 적용 범위

- coupler-mobile-app
- coupler-api
- coupler-admin-web
- docs

## 코드 리뷰 원칙

### 1. 모든 코드는 리뷰를 거친다

- main, develop 브랜치로의 모든 병합은 PR을 통해 진행
- 최소 1명 이상의 승인 필요
- 본인의 코드는 본인이 승인할 수 없음

### 2. 리뷰 시간

- PR 생성 후 24시간 이내 1차 리뷰 완료 목표
- 긴급한 경우 슬랙/메신저로 리뷰 요청

### 3. 리뷰 범위

- 기능 구현의 정확성
- 코드 품질 및 가독성
- 테스트 코드 필요 시 작성/갱신 여부
- 보안 취약점
- 성능 이슈

## 기술 판정 기준 (단일 SoT)

- 기술 규칙/완료 기준은 [엔지니어링 가드레일](engineering-guardrails.md)을 단일 기준으로 사용한다.
- 테스트 범위/전략은 [테스트/CI 전략](testing-strategy.md)을 단일 기준으로 사용한다.
- 배포 태그와 스토어 제출 마커 태그 기준은 [배포 태그 정책](release-tag-policy.md)을 단일 기준으로 사용한다.
- 릴리즈 기록 절차는 [배포/릴리즈 프로세스](release-process.md)를 단일 기준으로 사용한다.
- 본 문서는 리뷰 운영 절차와 근거/증빙 요구사항을 다룬다.

## PR 작성 가이드

### PR 제목

- 명확하고 간결하게 작성
- 예: `[Mobile] 사용자 로그인 기능 추가`

### PR 설명

```markdown
## 작업 내용

- 변경 사항 요약

## 변경 이유

- 왜 이 변경이 필요한지

## 테스트

- 테스트 변경 여부와 근거: `추가` / `갱신` / `미변경`
- 어떻게 테스트했는지
- 테스트 결과

## 회귀 안전성

- 영향 범위: 변경된 정책/계약/상태 머신(FSM)/API/UI/DB/권한/배포 범위
- 보호 동작: 보존해야 하는 기존 동작 또는 의도적으로 바꾸는 동작
- 분류 체계(taxonomy): 도메인/상태/enum/error source/code/surface/문서 역할의 축이 섞이지 않는지, 변경 또는 N/A 근거
- 검증 방법: 테스트/검증 스크립트/로그/수동 시나리오
- 상태 분류: 없음/회귀/기준 변경/정책 위반/기존 부채/호환 예외/스펙 공백
- N/A 사유: 회귀 영향이 없다고 판단한 근거
- API 계약 변경/Cutover: 필요/불필요, 신규/기존 호환 경로 여부, 현재 제거 가능 여부, 제거 조건, 목표 시점, 추적 이슈, 검증 근거
- API 계약 판정 범위: `동시 배포 계약 묶음` / `운영 legacy cutover` / `N/A`
- 동시 배포 계약 묶음: API package source, Admin/Mobile dependency·lockfile, 실제 runtime 공개 표면, 요청·응답 wire 계약 정렬 결과
- 운영 증빙 적용 여부: legacy 호환 경로를 실제 제거하는 변경인지와 Store/NextPush, `min_version`/`force_update`, traffic 로그, 릴리즈 기록 적용/N/A 근거

## 문서 동기화

- 관련 문서 갱신 필요 여부 (필요/불필요)
- 불필요 시 판단 근거(문서/코드/로그 링크)

## 리뷰 범위와 최종 판정

- 리뷰 범위: PR diff/커밋 범위/변경 파일
- 적용 기준: 코드/기능 7개 관점, 문서 안정성 평가, 또는 둘 다
- 7개 관점 점검: 완료/N/A
- 문서 안정성 평가: 완료/N/A
- N/A 관점과 근거:
- 열린 Finding:
- 마지막 수정 이후 검증:
- 최종 판정:

## 스크린샷 (UI 변경 시)

- 변경 전/후 스크린샷

## 체크리스트

- [ ] 테스트 변경 여부(`추가`/`갱신`/`미변경`)와 근거 기록
- [ ] 문서 동기화 점검(필요 시 업데이트, 불필요 시 근거 명시)
- [ ] docs 신규 문서 작성/구조 개편 시 `content/templates/` 템플릿 기반 작성 여부 확인 (예외 시 근거 명시)
- [ ] 문서/릴리즈 기록에 개인 사용자명 또는 로컬 절대경로가 남지 않았는지 확인
- [ ] 자체 테스트 완료
- [ ] [테스트/CI 전략](testing-strategy.md)의 공통 품질 게이트 검증 완료 + 실행 명령/결과 링크 첨부 (`N/A` 항목은 미적용 근거 명시)
- [ ] [엔지니어링 가드레일](engineering-guardrails.md)의 `회귀 안전성 게이트` 기준으로 영향 범위/보호 동작/검증 방법/상태 분류/N/A 사유를 기록
- [ ] 도메인/상태/enum/error source/code/surface/문서 역할 분류 체계(taxonomy)가 변경되거나 영향을 받으면 기준 문서와 코드가 같은 축을 쓰는지 기록
- [ ] API 계약 변경 또는 호환 경로 추가/수정/사용이 있으면 cutover 필요성, 현재 제거 가능 여부, 제거 조건, 목표 시점, 추적 이슈, 검증 근거를 기록
- [ ] API 계약 리뷰가 `동시 배포 계약 묶음`인지 `운영 legacy cutover`인지 먼저 고정하고, 동시 배포 묶음에는 운영 증빙을 요구하지 않으며 legacy 경로 제거에는 운영 Gate를 생략하지 않았는지 확인
- [ ] 배포 태그 또는 스토어 제출 마커 태그 변경이 있으면 [배포 태그 정책](release-tag-policy.md)의 태그 규칙과 증빙 기준을 충족하는지 확인
- [ ] 릴리즈 기록 또는 릴리즈 자동화 변경이 있으면 [배포/릴리즈 프로세스](release-process.md)의 `release-metadata` SoT, SoT 분리 금지 기준, `scopeResults` scope 증적, 태그 파생 기준, DB migration SQL/ledger 증빙, Markdown mirror 동기화, API contract cutover Gate 포함 기준을 확인
- [ ] `release-metadata.schema` 버전 변경이 있으면 해당 이전 버전이 이미 `main`에 병합된 계약인지 확인한다. 미병합 작업 브랜치의 로컬 계약 변경만으로 v2/v3/v4처럼 버전을 올린 변경은 finding으로 기록한다.
- [ ] 릴리즈 자동화 metadata 필드가 추가되면 같은 질문을 두 필드가 독립적으로 답하지 않는지 확인한다. 포함 범위/required repo/scope별 결과/terminal evidence 완료 조건은 `releaseScopes` descriptor와 `scopeResults.<scope>`에서 파생하고, 비-ref 증적은 기존 scope-keyed namespace에 둔다.
- [ ] 릴리즈 자동화 hard gate가 추가되면 terminal 상태의 거짓 완료 또는 `pending` 이후 고정 기준 변경을 막는 조건인지 확인한다. `planned`/`pending`/`in_progress` placeholder, 제외 scope, 참고용 본문 형식만 막는 변경은 finding으로 기록하고, 누락 실패/정상 통과/제외 scope 미차단 테스트가 함께 있는지 확인한다.
- [ ] 신규 릴리즈 기록 PR이 표준 단일 PR 흐름을 사용하면 `pending` 커밋이 원격 Draft PR에 존재하고, `released` 전환에서 `releaseScopes`, `extraRepoRefs`, 서비스 commit SHA, Mobile Store version/build, API contract comparison ref가 바뀌지 않았는지 확인한다. `planned`는 선택 초안이며 배포 시작 근거로 승인하지 않는다. `released` 전체 CI와 리뷰 전에는 Ready 전환을 승인하지 않는다.
- [ ] 기존 릴리즈 기록을 수정하면 PR 이력 어디에서도 `released`, `rolled_back`, `superseded`에서 `planned`, `pending`, `in_progress`로 역전이하지 않는지 확인한다. 사실 정정은 terminal 상태를 유지하고 후속 배포는 새 버전으로 분리한다.
- [ ] 릴리즈 자동화 hard gate가 태그 push, GitHub Release 생성, Store 심사/승인처럼 운영 액션 이후에만 생기는 산출물을 그 액션의 사전 조건으로 요구하지 않는지 확인한다. 이런 항목은 precheck와 postcheck/corrective reissue로 분리한다.
- [ ] 릴리즈 자동화 terminal evidence 검증을 바꾸면 `releaseScopeDescriptors`/cutover required path/release tag descriptor 전체를 순회하는 `N/A - <사유>`, `pending`, 비-SHA ref, 서로 다른 SQL/checksum false-pass fixture가 실패 테스트로 고정되어 있는지 확인한다.
- [ ] 릴리즈 자동화 metadata object 구조를 바꾸면 완전한 정상 metadata의 모든 object path에 unknown key를 주입하는 fail-closed 테스트가 유지되는지 확인한다.
- [ ] GitHub 원격 상태 또는 `gh` 인증을 확인했다면 아래 `GitHub 원격 상태 확인과 gh 인증 판정` 기준을 적용했는지 확인한다.
- [ ] 코드/기능 변경 시 7개 관점 점검 결과를 최종 판정에 반영 (`N/A`는 영향 없음 근거 필수)
- [ ] 문서(docs) 변경 시 [테스트/CI 전략](testing-strategy.md)의 docs 검증 게이트 통과 + 실행 명령/결과 링크 첨부
- [ ] 문서 추가/이동/개명 시 [문서 거버넌스 정책](document-governance-policy.md) 기준으로 `content/AGENTS.md` 인덱스와 `mkdocs.yml` `nav` 동기화 여부 확인
```

## 리뷰어 가이드

### 리뷰 태도

- 건설적인 피드백 제공
- 명확한 근거와 함께 의견 제시
- 긍정적인 부분도 언급

### 리뷰 코멘트 종류

- **MUST**: 반드시 수정해야 할 사항
- **SHOULD**: 수정을 권장하는 사항
- **SUGGEST**: 제안 사항
- **QUESTION**: 질문

### 리뷰 근거 표기 의무 (사람/AI 공통)

- 모든 리뷰 코멘트(MUST/SHOULD/SUGGEST/QUESTION)는 아래 중 최소 1개 근거를 포함한다.
    - 문서/코드 근거 경로는 저장소 기준 상대경로를 사용한다.
    - 정책/스펙 문서 라인 링크 (예: `content/policy/code-review-policy.md:88`, 저장소 기준 상대경로)
    - 코드 라인 링크 (예: `<저장소 상대경로>:<line>`)
    - 재현 로그/테스트 결과 링크 (URL 또는 저장소 기준 상대경로)
- 근거 없는 일반론 코멘트는 무효로 간주한다.
- 무효 코멘트가 있으면 병합 전 재리뷰를 요청한다.

### 다중 관점 리뷰 패스 (사람/AI 공통)

- 코드/기능 변경은 아래 7개 관점을 기준으로 점검한다.
- 문서만 변경된 경우 [문서 거버넌스 정책](document-governance-policy.md)의 `문서 안정성 평가`를 우선 적용한다.
- 코드와 문서가 함께 변경된 경우 코드/기능 리뷰 패스와 문서 안정성 평가를 모두 적용하고, 문서 안정성 평가 변경 유형은 `코드+문서`로 기록한다.
- 동일 원인의 finding은 중복 작성하지 않고 하나로 병합한다.
- 각 관점은 별도 코멘트를 남길 수 있으나, 모든 코멘트는 `리뷰 근거 표기 의무`를 따른다.
- 변경 범위와 무관한 관점은 `N/A`로 표시하고, 영향 없음 판단 근거(문서/코드/로그)를 남긴다.
- 최종 리뷰 결과는 finding 중심으로 정리한다. 페르소나별 일반 의견은 finding으로 남기지 않는다.
- 7개 관점은 점검 기준이며, 최종 보고나 세션 출력에 관점별 표를 항상 펼쳐 쓰는 요구사항이 아니다.
- 단, 코드/기능 변경에서는 7개 관점 점검 완료 여부와 `N/A` 근거를 최종 판정에 남긴다.
- 최종 보고는 리뷰 범위, 적용 기준, 열린 Finding, 마지막 수정 이후 검증, 문서 동기화, 최종 판정을 간결하게 기록한다.
- 최종 보고는 같은 판단, 같은 근거, 같은 해결안을 반복하지 않는다. 새 근거가 없는 반복 설명, transition 구조 재소개, 이미 폐기한 대안 재서술은 간결성 위반으로 본다.
- Finding이 있으면 문제, 근거, 필요 조치와 대표 발견 관점을 함께 기록한다.
- 모든 코드/기능 리뷰는 [엔지니어링 가드레일](engineering-guardrails.md)의 `구조 단순화 우선` 원칙을 함께 적용해, 변경 범위 안에서 더 단순한 문서/코드 구조, SoT, 책임 경계, 파일 배치가 가능한지 확인한다. 변경 범위 밖 전면 리팩터링은 finding으로 강제하지 않고 `기존 부채` 또는 근거 있는 제안으로 분리한다.
- **Review Lead / Policy Gatekeeper**: 리뷰 코멘트의 근거, 등급(MUST/SHOULD/SUGGEST/QUESTION), 중복 여부, 정책 충돌 여부를 확인한다.
- **Senior PM / Product**: 요구사항, 사용자 흐름, 스펙 공백, 기준 변경 여부를 확인한다.
- **Business / Operations**: 운영 가능성, CS 리스크, 관리자 액션, 심사/결제/푸시 운영 영향을 확인한다.
- **Senior Security**: 인증/인가, 권한 우회, 민감정보, 로그 마스킹, 임시 권한, 감사 로그를 확인한다.
- **Senior Backend**: API 계약, [엔지니어링 가드레일](engineering-guardrails.md)의 DB 설계 최종 리뷰,
  상태 전이, 트랜잭션, 서버 단일 판정, 도메인/error 분류 체계(taxonomy),
  [API 에러 계약 정책](api-error-contract-policy.md) 준수를 확인한다.
- **Senior Frontend / Client**: Mobile/Admin UI 상태, API 호출 경계, 실패 응답 분기 기준, 로컬 상태와 서버 상태 혼용, 클라이언트 로컬 subset과 서버 분류 체계(taxonomy)의 충돌 여부, 디자인 토큰, React Native `StyleSheet.create` 신규 key의 `lowerCamelCase` 준수를 확인한다.
- **QA / Release**: 위험도 분류, 테스트/CI, 수동 검증, 릴리즈 증빙, 태그/제출 마커 정책 준수, PR별 cutover 필요성/현재 제거 가능 여부를 확인한다.
- 릴리즈 기록/자동화 변경 리뷰에서는 `release-metadata`를 기계 판정 SoT로 둔다. 본문 자유 문장 검색, validator별 중복 상수, metadata와 Markdown mirror의 불일치, cutover 없는 `N/A` 설명을 Gate 포함 신호로 처리하는 변경은 finding으로 기록한다.
- 릴리즈 자동화 hard gate 변경 리뷰에서는 “이 조건이 없으면 완료되지 않은 릴리즈가 terminal 상태로 닫히는가”를 먼저 확인한다. 답이 아니면 hard gate가 아니라 작성 기준 또는 checklist로 낮춘다.
- 릴리즈 자동화 리뷰는 자유 문장의 진위 전체를 validator로 증명하라고 요구하지 않는다. 차단 finding은 descriptor, schema, ref 조회, placeholder 판정처럼 결정적으로 검증 가능한 계약 불일치나 실제로 통과하는 잘못된 fixture가 있을 때만 남긴다.

### No Findings 최종 리뷰 기록

- 최종 리뷰 기록은 마지막 수정 이후 다시 수행한 검증과 재리뷰 결과만 기준으로 한다.
- 관점별 판정은 `No Findings`, `Finding`, `기존 부채`, `N/A`만 사용한다.
- `No Findings`는 아래 조건을 모두 충족할 때만 선언한다.
    - 리뷰 범위가 PR diff, 커밋 범위, 변경 파일 중 하나로 고정되어 있다.
    - 코드/기능 변경의 7개 관점이 모두 `No Findings`, 근거 있는 `N/A`, 또는 이번 변경이 만들거나 확산하지 않은 `기존 부채`다.
    - 문서-only 변경은 [문서 거버넌스 정책](document-governance-policy.md)의 `문서 안정성 평가`를 통과했다.
    - 코드와 문서가 함께 변경된 경우 7개 관점 리뷰와 문서 안정성 평가가 모두 끝났다.
    - 열린 Finding이 0건이며, 기존 부채는 이번 변경이 만들거나 확산하지 않았다는 근거가 있다.
    - [테스트/CI 전략](testing-strategy.md)의 적용 품질 게이트가 마지막 수정 이후 통과했다.
    - 회귀 안전성, 문서 동기화, `N/A` 사유가 경로/라인/로그 중 하나 이상의 근거로 기록되어 있다.
- Finding이 있으면 `원인 수정 -> 적용 품질 게이트 재실행 -> 동일 범위 재리뷰 -> 최종 기록 갱신`을 `No Findings`까지 반복한다.
- 근거 없는 관점 판정, 마지막 수정 이전 검증 결과, 미해결 Finding이 하나라도 있으면 `No Findings`로 판정하지 않는다.

### Push 전 자체 리뷰 게이트

- 원격 `git push`, PR 생성, 기존 PR 브랜치 갱신, 태그 push 전에는 마지막 파일 변경 이후 push 대상 범위를 고정하고 자체 리뷰를 수행한다.
- branch push 범위는 `git status`, `git diff`, `git diff --cached`, upstream 대비 미push 커밋 목록(`git log @{u}..HEAD` 또는 base branch 비교)으로 확인한다.
- tag push 범위는 태그 대상 커밋, 릴리즈/제출 마커 의미, 관련 릴리즈 기록과 preview 검증 결과로 확인한다.
- push 전 보고에는 리뷰 범위, 열린 Finding, 마지막 수정 이후 검증, 문서 동기화, 최종 판정을 포함한다.
- 열린 Finding이 있거나 최종 판정이 `No Findings`가 아니면 push하지 않는다. 예외가 필요하면 위험, 미검증 범위, 되돌림 기준을 먼저 기록하고 사용자 승인을 받아야 한다.
- CI, GitHub Actions, secret, package registry, 권한, 배포, 릴리즈 자동화 변경은 외부 영향 범위와 비코드 설정 필요 여부를 함께 리뷰한다.
- force push, 태그 삭제, 원격 브랜치 삭제처럼 원격 이력을 바꾸는 작업은 일반 push 게이트와 별개로 명시 승인을 받아야 한다.

### PR reviewer 요청 승인 게이트

- 브랜치 push, PR 생성·업데이트, "PR 올려줘", "PR까지 처리해줘" 요청은 GitHub reviewer 요청·지정 권한을 포함하지 않는다.
- 사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인한 경우에만 GitHub `Request reviewer`, `gh pr edit --add-reviewer`, REST/GraphQL requested reviewer 변경을 실행한다.
- reviewer 후보를 코드 소유권, 최근 커밋, 기존 PR, 조직 membership으로 임의 추정해 자동 요청하지 않는다.
- 기존 reviewer의 추가·재요청·교체·제거도 별도 승인 대상이다. 상태 확인과 보고만 read-only로 수행할 수 있다.
- reviewer 승인이 없으면 PR은 reviewer 미지정 상태로 생성·갱신하고, reviewer 요청을 완료 조건이나 후속 기본 작업으로 처리하지 않는다.

### GitHub 원격 상태 확인과 gh 인증 판정

- PR, check, workflow, release, 원격 branch처럼 GitHub 웹 상태를 확인할 때는 브라우저 화면 추측보다 `gh` CLI/API 결과를 우선한다.
- sandbox 안의 `gh` 실패나 `gh auth status`의 invalid 결과는 인증 만료의 최종 근거가 아니다. 같은 명령을 sandbox 밖에서 재실행한 결과로만 인증 상태를 판정한다.
- `EPERM`, keyring 접근 실패, 네트워크 차단은 `sandbox 실행 실패`로 보고하고, sandbox 밖 `gh auth status` 실패 또는 GitHub API의 `401`/명시적 credential 거부가 확인된 경우에만 `gh 인증 실패`로 보고한다.
- `git fetch/push`와 `gh`는 서로 다른 credential을 사용할 수 있으므로 한쪽 성공/실패로 다른 쪽 인증 상태를 추정하지 않는다.
- sandbox 밖 `gh` 재검증 전에는 브라우저 로그인이나 재인증을 사용자에게 요구하지 않는다.

### 외부 공유/메시지 SDK 리뷰 기준

- Kakao Talk Share, OS Share, 외부 메시지 SDK를 사용하는 변경은 아래 상태를 구분해 리뷰한다.
    - SDK 요청 성공: 공유 URL/Intent 생성 또는 공유 UI 실행 성공.
    - 사용자 전송 완료: 사용자가 대상 친구/채팅방을 선택해 실제 전송 완료.
    - 서비스 상태 반영: 우리 서버 DB/로그/보상 상태 변경 완료.
- 요구사항이 "공유 UI 실행" 또는 "추천 내용 저장"이면 서버 웹훅/전송 완료 판정 구현을 새로 요구하지 않는다.
- 요구사항이 "실제 전송 성공 확인", "발송 성공 집계", "보상 지급 기준"이면 SDK 성공값만으로 완료 처리하지 않는다. 서버 콜백/웹훅, 요청 식별자, 인증 검증, 멱등 처리, 상태 전이 근거를 함께 리뷰한다.
- Kakao Talk Share에서 전송 성공을 서비스 서버가 알아야 하는 경우, Kakao Developers의 카카오톡 공유 웹훅과 SDK `serverCallbackArgs` 전달 여부를 확인한다.

### 공통 응답/에러 계약 리뷰 기준

- JSON API 성공/실패 envelope 추가/수정, Mobile/Admin 응답 boundary 수정은 [API 공통 응답 계약 정책](api-response-contract-policy.md)을 단일 기준으로 리뷰한다.
- 신규 API 또는 성공 `data`의 구조를 직접 수정한 API는 Swagger/OpenAPI에 실제 wire shape와 같은 operation별 success DTO가 있고 contracts package가 이를 생성하는지 확인한다. Mobile/Admin이 해당 `data` 내부 필드를 읽으면 generated success DTO를 API 호출 경계에서 사용하지 않는 local response DTO를 finding으로 기록한다.
- 현재 diff가 읽거나 수정하지 않는 기존 loose success schema와 consumer-local response DTO는 `기존 부채`로 분류하고 일괄 정리를 병합 조건으로 만들지 않는다. 다만 직접 수정한 operation에서 같은 패턴을 새로 추가하거나 확산하면 finding으로 기록한다.
- 소비자가 성공 `data` 내부 필드를 해석하지 않고 opaque JSON 값 전체를 그대로 전달·보관하는 passthrough는 success DTO 소비 리뷰를 `N/A`로 둘 수 있다. 필드 접근, local shape 선언, cast 또는 fallback이 있으면 passthrough 예외가 아니다.
- API 실패 응답 추가/수정, Mobile/Admin 실패 분기 수정, 운영 로그 상관관계 변경은 [API 에러 계약 정책](api-error-contract-policy.md)을 단일 기준으로 리뷰한다.
- 서버는 계약된 JSON API 성공을 `{ ok: true, data }`, 실패를 `{ ok: false, error: ErrorData }` envelope로 반환하고, 신규 실패 응답은 공통 factory/mapper 경계로 생성해야 한다. 컨트롤러/도메인 로직에서 실패 응답 JSON을 직접 조립하면 finding으로 기록한다.
- HTTP non-2xx는 API error taxonomy 밖의 transport/protocol/proxy 실패로만 사용해야 한다. 서버가 `ErrorData`를 HTTP 4xx/5xx와 함께 반환하거나, Mobile/Admin이 HTTP status를 `error_action`/`error_code`로 변환하면 finding으로 기록한다.
- Mobile/Admin은 `ok`로 성공/실패를 1차 분기하고, 실패 시 `error.error_action` 우선, `error.error_code` 보조 기준으로 처리해야 한다. 이 기준은 클라이언트가 display message, legacy numeric code, `error_context` 같은 진단값에 기대지 않는다는 뜻이며, 모든 `error_action`을 공통 request wrapper가 전역 처리해야 한다는 뜻이 아니다. 공통 wrapper가 전역 UX를 결정적으로 완료할 수 없는 경우 operation/screen handler가 generated runtime 또는 semantic failure helper로 처리할 수 있다. `result_msg` 문자열 파싱, 도메인 상태용 top-level `result_code` 추가, `error_context` 기반 분기는 finding으로 기록한다.
- 토큰 누락/무효/만료처럼 로그인 또는 재인증 경로로 이동해야 하는 실패가 `LOGIN_REQUIRED`가 아니라 `FIX_REQUEST`로 분류되거나, Mobile/Admin consumer-local `ERROR_ACTION` subset에서 `LOGIN_REQUIRED`가 누락되면 finding으로 기록한다. 해당 action을 공통 boundary에서 전역 처리할지 operation/screen handler에서 처리할지는 클라이언트 navigation 책임 경계로 판정하되, 로그인/재인증이 필요한 UX에서 generic message 표시만 하고 흐름을 끝내면 finding으로 기록한다.
- API/Admin/Mobile 동시 cutover 작업에서 구버전 클라이언트 호환을 이유로 token code fallback, dual parser, legacy envelope branch, shim helper를 추가하거나 유지하면 finding으로 기록한다.
- 최종 구조, 최종 공통 계약, canonical SoT 구현, cutover 변경에 transition 계층이 포함되면 finding으로 기록한다. 호환이 필요하면 별도 호환 배포 작업으로 분리해야 한다.
- `ERROR_CATALOG`/`ERROR_SOURCE`/`ERROR_SURFACE`/generated client runtime contract 변경은 분류 체계(taxonomy) 변경으로 리뷰한다. `error_source`는 상위 서버 도메인 또는 안정적인 모듈 축, `error_surfaces`는 소비 제품면/영향 범위 metadata, `error_action`은 클라이언트 권장 동작, `error_code`는 descriptor의 stable wire value로 분리되어야 한다.
- 서버 production callsite가 `ErrorDescriptor` 대신 raw `error_code` 문자열이나 public `ERROR_CODE` alias를 전달하면 finding으로 기록한다. `ERROR_CODE` 문자열 목록이 필요하면 generator/test 내부 파생값으로만 둔다.
- `ErrorDescriptor` authoring field는 `code`, `source`, `surfaces`, `action`, `messageKey`, `messageArgContextKeys`로 제한한다. `path`, `group`, `name`, `codePrefix`, singular `error_surface`를 canonical 분류 축으로 설명하거나 사용하는 변경은 finding으로 기록한다.
- 신규 error code에 `ADMIN_`/`APP_`/`MOBILE_` 제품면, `RETRY`/`LOGIN_REQUIRED` 동작, domain-specific `*_ACCESS` 같은 일반 분류어를 source/top-level 축으로 추가하면 finding으로 기록한다. 제품면은 `error_surfaces`, 접근/권한 의미는 도메인 source와 `error_code` reason segment로 표현해야 한다.
- `AUTH_ACCOUNT`, `AUTH_LOGIN`, `AUTH_SIGNUP`, `AUTH_TOKEN`, `LOUNGE_CONTENT`, `MATCH_REVIEW`, `MEMBER_AUTH_REVIEW`, `MEMBER_PROFILE_EDIT`, `MEMBER_MANAGER_SELECTION`, `MEMBER_REVIEW`, `REVIEW_STATUS`처럼 operation/flow/화면/판정 상태를 나타내는 세부 namespace를 `error_source`로 추가하거나 유지하는 변경은 finding으로 기록한다. 세부 기능명은 `error_code` segment로 표현해야 한다.
- 기존 미준수 구현을 건드리지 않는 경우에는 [엔지니어링 가드레일](engineering-guardrails.md)의 `회귀 안전성 게이트`에 따라 `기존 부채`로 분류한다. 미준수 경로를 신규로 추가하거나 확산하면 `정책 위반`으로 분류한다.
- 구버전 클라이언트 호환 필드가 필요하면 최종 구조/cutover 변경에 섞지 않고 별도 호환 배포 작업으로 분리한다. 호환 작업에는 제거 조건, 목표 시점, 추적 이슈, 검증 근거가 있어야 한다.
- `error_context`는 중앙 실패 로그에 남는 값이므로 key와 값 모두 민감정보를 담지 않아야 한다. `password`/`pwd`/`token`/`email`/`phone`/`card_number`/`resident_registration_number`/`secret` 계열 key나 이메일/전화번호/토큰/카드번호/주민등록번호로 판정 가능한 value가 통과하면 finding으로 기록한다.
- 서버와 클라이언트 코드가 최종 envelope 형태여도 API/Admin/Mobile 동시 cutover 릴리즈의 배포 순서, 전환 시점, 강제 업데이트 차단 근거가 없으면 cutover 완료로 판정하지 않는다.
- 기존 부채나 호환 예외로 분류한 API 응답/에러 계약 경로는 [기술 부채 정리](../technical-debt/technical-debt.md)의 `API 응답 공통 계약 cutover 인덱스`를 참조한다. PR diff 안에서 새로 추가/수정/사용한 경로가 이 인덱스나 PR 기록 없이 남으면 finding으로 기록한다.
- `No Findings` 판정은 리뷰 범위 기준이다. 서버 catalog 정리나 client runtime contract 생성만으로 전체 API cutover 완료를 의미하지 않는다. 전체 완료는 [API 공통 응답 계약 정책](api-response-contract-policy.md), [API 에러 계약 정책](api-error-contract-policy.md), 기술부채 cutover 인덱스 완료 기준을 함께 만족해야 한다.

### 런타임 설정 리뷰 기준

- `coupler-api`의 DB pool, connection timeout, runtime config 로딩 경로, `config/default*.json`, 운영 `config/production*.json`, `config/production*.json.example`, 운영 환경변수 변경은 API 런타임 변경으로 리뷰한다.
- 리뷰 기록에는 배포 범위 `coupler-api`, 재배포/재시작 필요 여부, `DB migration` 적용 여부(`필요` 또는 `N/A`), 운영 config merge 영향, rollback 기준, post-deploy 확인 항목을 남긴다.
- DB pool/timeout 변경은 정상 동작 테스트만으로 완료하지 않고, 운영 배포 후 확인할 로그/지표를 함께 남긴다. 예: DB 연결 오류, queue limit 오류, p95/p99 latency, RDS connection/running thread 지표.

### 체크 포인트

- [ ] 요구사항을 정확히 구현했는가?
- [ ] 코드가 읽기 쉽고 이해하기 쉬운가?
- [ ] 중복 코드는 없는가?
- [ ] [엔지니어링 가드레일](engineering-guardrails.md)의 `No Findings 게이트` 기준으로 기술 판정을 완료했는가? (Fail-closed, 레이어 책임 분리, Shadow Cutover, 문서 동기화 포함)
- [ ] 같은 도메인에 문서가 여러 개면 [문서 거버넌스 정책](document-governance-policy.md) 기준으로 규범 문서가 1개로 고정돼 있고, 각 문서 상단에 역할/문서 종류/우선순위/as-is-to-be 기준이 명시돼 있는가?
- [ ] [테스트/CI 전략](testing-strategy.md)의 공통 품질 게이트 검증 결과와 로그 링크가 PR에 명시되어 있는가? (`N/A` 항목은 미적용 근거 포함)
- [ ] 코드/기능 변경 시 다중 관점 리뷰 패스의 7개 관점을 확인했고, 무관한 관점은 `N/A` 근거를 남겼는가?
- [ ] 최종 리뷰가 같은 판단/근거/해결안을 반복하지 않고, finding 중심으로 간결하게 작성됐는가?
- [ ] 변경이 도메인/상태/enum/error source/code/surface/문서 역할을 추가·이동·개명한다면 분류 체계(taxonomy)가 단일 책임 기준으로 유지되는가?
- [ ] 최종 구조, 최종 공통 계약, canonical SoT 구현, cutover로 설명한 변경 범위에 transition 계층이 0건인가?
- [ ] 변경 범위 안에서 더 단순한 문서/코드 구조, SoT, 책임 경계, 파일 배치로 정리할 수 있는데도 중복/우회/임시 구조를 새로 만들거나 넓히지 않았는가?
- [ ] 확장성(향후 변경·확대)에 무리가 없는가?
- [ ] 응답/에러 처리가 [API 공통 응답 계약 정책](api-response-contract-policy.md), [API 에러 계약 정책](api-error-contract-policy.md), [엔지니어링 가드레일](engineering-guardrails.md)의 응답/에러 처리 기준을 따르는가?
- [ ] 신규 또는 직접 수정한 structured success `data`의 Swagger/OpenAPI DTO, generated contract, 소비자 API 경계 타입이 일치하며 기존 부채와 opaque JSON passthrough 예외를 구분했는가?
- [ ] 테스트 변경 판정이 충분한가? (`추가`/`갱신`/`미변경` 근거, 중복/누락 시나리오, 함수명-내용 일치, assertion 유효성)
- [ ] 보안 취약점은 없는가?
- [ ] 성능 문제는 없는가?
- [ ] 기능 회귀 가능성이 있는 변경은 [엔지니어링 가드레일](engineering-guardrails.md)의 `회귀 안전성 게이트` 기준으로 분류/검증됐는가?
- [ ] DB/API 런타임 설정 변경 시 `coupler-api` 재배포/재시작 필요 여부와 post-deploy 확인 항목을 기록했는가?
- [ ] React Native `StyleSheet.create`에 신규 style key를 추가한 경우 `lowerCamelCase`로 작성했는가?
- [ ] API 계약 변경 또는 호환 경로 추가/수정/사용이 있으면 cutover 필요성, 현재 제거 가능 여부, 제거 조건, 목표 시점, 추적 이슈가 PR/릴리즈 기록에 남았는가?
- [ ] 기존 정책 불일치를 회귀로 오판하지 않고, 이번 변경이 새로 만들거나 확산한 문제인지 근거로 구분했는가?
- [ ] 문서 변경 시 기존 내용과 충돌하는 부분은 없는가?
- [ ] docs 신규 문서 작성/구조 개편 시 `content/templates/` 템플릿 기준을 따르는가? (예외 시 근거 확인)
- [ ] 문서 변경 시 [테스트/CI 전략](testing-strategy.md)의 docs 검증 게이트를 통과했는가?
- [ ] 문서 추가/이동/개명 시 [문서 거버넌스 정책](document-governance-policy.md) 기준으로 `content/AGENTS.md` 인덱스와 `mkdocs.yml` `nav`가 같은 PR에서 함께 갱신됐는가?

### 리뷰 전제

- 배포 시 기존 버전은 동시 배포로 전부 교체된다.

## 작성자 가이드

### 리뷰 피드백 처리

- 모든 코멘트에 응답
- 수정 완료 후 재리뷰 요청
- 의견이 다른 경우 논의

### 병합 전 체크리스트

- [ ] 모든 리뷰 코멘트 해결
- [ ] 필요한 승인 획득
- [ ] CI/CD 통과
- [ ] 충돌 해결
- [ ] [테스트/CI 전략](testing-strategy.md)의 공통 품질 게이트 검증 완료 및 로그 링크 확인 (`N/A` 항목은 미적용 근거 확인)
- [ ] 문서 동기화 점검 결과(필요 시 반영, 불필요 시 근거) 확인
- [ ] 리뷰 코멘트별 근거 링크(문서/코드/로그) 확인

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [테스트/CI 전략](testing-strategy.md)
- [문서 거버넌스 정책](document-governance-policy.md)

## 예외 사항

### 핫픽스

- 긴급 버그 수정 시 사후 리뷰 가능
- 배포 후 빠른 시일 내 리뷰 진행

### 문서 수정

- 문서 간단 오타 수정은 간소화 리뷰 가능. 단, 문서 안정성 평가 `N/A` 근거를 남긴다.

## 참고 자료

- [Google Engineering Practices](https://google.github.io/eng-practices/review/)
- [Best practices for code review](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/)
