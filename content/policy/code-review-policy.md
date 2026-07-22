# 코드 리뷰 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 리뷰 절차·증빙·판정 운영은 이 문서, 기술·테스트·배포 세부 판정은 `기술 판정 기준` 절의 범위별 SoT
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

- 상위 공통 기술 원칙과 기술 이행 유형별 완료 기준은 [엔지니어링 가드레일](engineering-guardrails.md)을 단일 기준으로 사용한다. API/DB/테스트 등 세부 판정은 가드레일의 `단일 SoT와 우선순위` 표에 연결된 범위별 문서를 따른다.
- 페이지/use-case 조회 집계와 증분 조회·동작 명령·전송 경계는 [API 조회·동작 설계 정책](api-operation-design-policy.md)을 단일 기준으로 사용한다.
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
- API 계약 변경/Cutover: 단일 최종 계약 배포 여부, Store 출시 activation 강제 업데이트 또는 NextPush mandatory 방식,
  신규/기존 호환 경로 여부, 호환이 있으면 작업 요청자의 명시적 승인과 제거 조건·목표 시점·추적 이슈·검증 근거
- API 계약 판정 범위: `동시 배포 계약 묶음` / `운영 legacy cutover` / `N/A`
- 동시 배포 계약 묶음: API package source, Admin/Mobile dependency·lockfile, 실제 runtime 공개 표면, 요청·응답 wire 계약 정렬 결과
- 다중 레포 문서 최종 상태: 관련 PR 전체 병합 후 source main version·기능 상태, 선행 PR과 merge order,
  브랜치 한정 진행 상태를 PR 본문/pending 릴리스 기록으로 분리한 결과
- 운영 증빙 적용 여부: legacy 호환 경로를 실제 제거하는 변경인지와 Store 출시 activation 강제 업데이트 또는 NextPush
  mandatory, 현재 코드 소비 경로 0건, 릴리즈 기록 적용/N/A 근거

## 문서 동기화

- 관련 문서 갱신 필요 여부 (필요/불필요)
- 불필요 시 판단 근거(문서/코드/로그 링크)

## 정책 Composition (policy 추가·수정·삭제 시)

- 적용 여부: `적용` / `N/A` + 근거
- 전체 검토 범위: 대상 정책 전체, 정방향 링크, 역방향 규범 참조, 같은 도메인 정책, 제외 범위
- 책임/우선순위: 변경 전/후 판정 책임별 단일 SoT와 충돌 해결 순서
- 생명주기: 적용 상태·단계별 진입 조건, 허용 구조, Exit Gate와 `N/A` 근거
- 전역 절 정합성: 목적/필수 규칙/예외/검증/완료 정의/체크리스트 영향
- 삭제/승계: 비삭제 변경은 `N/A`; 삭제는 삭제 사유, 후속 단일 SoT/책임 종료 근거, 정방향·역방향 참조와 인덱스 이관·제거 결과
- 검증/rollback: 마지막 변경 이후 실행 명령·결과와 정책 변경을 되돌릴 기준점
- Composition Gate 판정: `No Findings` / `Finding`

## 리뷰 범위와 최종 판정

- 리뷰 범위: PR diff/커밋 범위/변경 파일
- 적용 기준: 코드/기능 7개 관점, 문서 안정성 평가, 또는 둘 다
- 7개 관점 점검: 완료/N/A
- 문서 안정성 평가: 완료/N/A
- N/A 관점과 근거:
- 열린 Finding:
- 독립 최종 리뷰 체크포인트: `열린 Finding 0건·검증 대기` / `미도달` + 근거
- 마지막 변경 이후 검증:
- 최종 판정:

## 스크린샷 (UI 변경 시)

- 변경 전/후 스크린샷

## 체크리스트

- [ ] 테스트 변경 여부(`추가`/`갱신`/`미변경`)와 근거 기록
- [ ] 문서 동기화 점검(필요 시 업데이트, 불필요 시 근거 명시)
- [ ] docs 신규 문서 작성/구조 개편 시 `content/templates/` 템플릿 기반 작성 여부 확인 (예외 시 근거 명시)
- [ ] 문서/릴리즈 기록에 개인 사용자명·개인 개발 장비 절대경로가 없고, 공유 환경 경로는
  [문서 거버넌스 정책](document-governance-policy.md)의 운영 flow/runbook 예외를 충족하는지 확인
- [ ] policy를 추가·수정·삭제하면 [문서 거버넌스 정책](document-governance-policy.md)의 `정책 Composition Gate` 증빙과 **Policy Composition / Lifecycle Consistency Reviewer** 판정을 기록
- [ ] [테스트/CI 전략](testing-strategy.md)의 공통 품질 게이트 검증 완료 + 실행 명령/결과 링크 첨부 (`N/A` 항목은 미적용 근거 명시)
- [ ] 독립 최종 리뷰 체크포인트 이후 동일 최종 후보에서 로컬 표준 통합 품질 게이트를 레포별 1회만 실행했는지와
  별도 표적 검증을 실행했다면 허용 사유·명령·결과를, 환경 실패가 있었다면 실패·미실행 하위 Gate의 재시도
  근거를 확인
- [ ] [엔지니어링 가드레일](engineering-guardrails.md)의 `회귀 안전성 게이트` 기준으로 영향 범위/보호 동작/검증 방법/상태 분류/N/A 사유를 기록
- [ ] 외부 의존성을 추가·대체하면 [에이전트 운영 규칙](../AGENTS.md)의 `권한 집합`에 따른 명시적 승인 기록과 [엔지니어링 가드레일](engineering-guardrails.md)의 `외부 의존성 변경 사전 검토` 근거를 확인
- [ ] 도메인/상태/enum/error source/code/surface/문서 역할 분류 체계(taxonomy)가 변경되거나 영향을 받으면 기준 문서와 코드가 같은 축을 쓰는지 기록
- [ ] API 계약 변경이면 단일 최종 계약과 강제 업데이트/mandatory 방식을 기록하고, 호환 경로 추가/수정/사용이
  있으면 작업 요청자의 명시적 승인, 제거 조건, 목표 시점, 추적 이슈, 검증 근거를 기록
- [ ] API 계약 리뷰가 `동시 배포 계약 묶음`인지 `운영 legacy cutover`인지 먼저 고정하고, 동시 배포 묶음에는 운영 증빙을 요구하지 않으며 legacy 경로 제거에는 운영 Gate를 생략하지 않았는지 확인
- [ ] API producer·consumer DTO 변경이면 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)의 적용 절과 체크리스트를 확인
- [ ] 다중 레포 최종 상태 문서가 관련 PR 전체 병합 후에도 사실이고, branch-local version·`main 병합 대기`를
  `as-is` 문서나 기술부채의 최종 상태로 남기지 않았으며 선행 PR과 merge order가 기록됐는지 확인
- [ ] 배포 태그 또는 스토어 제출 마커 태그 변경이 있으면 [배포 태그 정책](release-tag-policy.md)의 태그 규칙과 증빙 기준을 충족하는지 확인
- [ ] 릴리즈 기록·자동화 변경이면 [배포/릴리즈 프로세스](release-process.md)의 적용 절과 체크리스트,
  공통 release schema/derived model, 전환 검증 결과를 확인
- [ ] 릴리즈 schema·hard gate 변경이면 누락·거짓 완료·unknown field 실패와 정상·제외 범위 통과 fixture가
  같은 변경에서 검증되는지 확인
- [ ] GitHub 원격 상태 또는 `gh` 인증을 확인했다면 아래 `GitHub 원격 상태 확인과 gh 인증 판정` 기준을 적용했는지 확인한다.
- [ ] 코드/기능 변경 시 7개 관점 점검 결과를 최종 판정에 반영 (`N/A`는 영향 없음 근거 필수)
- [ ] 문서(docs) 변경 시 [테스트/CI 전략](testing-strategy.md)의 docs 검증 게이트 통과 + 실행 명령/결과 링크 첨부
- [ ] 문서 추가/삭제/이동/개명 시 [문서 거버넌스 정책](document-governance-policy.md) 기준으로 `content/AGENTS.md` 인덱스와 `mkdocs.yml` `nav` 동기화 여부 확인
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
- 최종 보고는 리뷰 범위, 적용 기준, 열린 Finding, 마지막 변경 이후 검증, 문서 동기화, 최종 판정을 간결하게 기록한다.
- 최종 보고는 같은 판단, 같은 근거, 같은 해결안을 반복하지 않는다. 새 근거가 없는 반복 설명, transition 구조 재소개, 이미 폐기한 대안 재서술은 간결성 위반으로 본다.
- Finding이 있으면 문제, 근거, 필요 조치와 대표 발견 관점을 함께 기록한다.
- 모든 코드/기능 리뷰는 [엔지니어링 가드레일](engineering-guardrails.md)의 `구조 단순화 우선` 원칙을 함께 적용해, 변경 범위 안에서 더 단순한 문서/코드 구조, SoT, 책임 경계, 파일 배치가 가능한지 확인한다. 변경 범위 밖 전면 리팩터링은 finding으로 강제하지 않고 `기존 부채` 또는 근거 있는 제안으로 분리한다.
- **Review Lead / Policy Gatekeeper**: 리뷰 코멘트의 근거, 등급(MUST/SHOULD/SUGGEST/QUESTION), 중복 여부, 정책 충돌 여부를 확인한다.
- **Senior PM / Product**: 요구사항, 사용자 흐름, 스펙 공백, 기준 변경 여부를 확인한다.
- **Business / Operations**: 운영 가능성, CS 리스크, 관리자 액션, 심사/결제/푸시 운영 영향을 확인한다.
- **Senior Security**: 인증/인가, 권한 우회, 민감정보, 로그 마스킹, 임시 권한, 감사 로그를 확인한다.
- **Senior Backend**: API 계약, [엔지니어링 가드레일](engineering-guardrails.md)의 DB 설계 최종 리뷰,
  [API 조회·동작 설계 정책](api-operation-design-policy.md)의 페이지/use-case 집계와 operation 경계,
  상태 전이, 트랜잭션, 서버 단일 판정, 도메인/error 분류 체계(taxonomy),
  [API 에러 계약 정책](api-error-contract-policy.md) 준수를 확인한다.
- **Senior Frontend / Client**: Mobile/Admin UI 상태, API 호출 경계, 실패 응답 분기 기준, 로컬 상태와 서버 상태 혼용, 클라이언트 로컬 subset과 서버 분류 체계(taxonomy)의 충돌 여부, 디자인 토큰, React Native `StyleSheet.create` 신규 key의 `lowerCamelCase` 준수를 확인한다.
- **QA / Release**: 위험도 분류, 테스트/CI, 수동 검증, 릴리즈 증빙, 태그/제출 마커 정책 준수, PR별 cutover
  필요성/현재 제거 가능 여부와 같은 event·ref·baseline·산출물에서 동일 Gate가 불필요하게 반복되는지
  확인한다. 서로 다른 신뢰 경계의 재검증과 validator 회귀 테스트는 별도 증빙으로 구분한다.
- 릴리즈 기록/자동화 변경 리뷰에서는 `release-metadata`를 기계 판정 SoT로 둔다. 본문 자유 문장 검색, validator별 중복 상수, metadata와 Markdown mirror의 불일치, cutover 없는 `N/A` 설명을 Gate 포함 신호로 처리하는 변경은 finding으로 기록한다.
- 릴리즈 자동화 hard gate 변경 리뷰에서는 “이 조건이 없으면 완료되지 않은 릴리즈가 terminal 상태로 닫히는가”를 먼저 확인한다. 답이 아니면 hard gate가 아니라 작성 기준 또는 checklist로 낮춘다.
- 릴리즈 자동화 리뷰는 자유 문장의 진위 전체를 validator로 증명하라고 요구하지 않는다. 차단 finding은 descriptor, schema, ref 조회, placeholder 판정처럼 결정적으로 검증 가능한 계약 불일치나 실제로 통과하는 잘못된 fixture가 있을 때만 남긴다.

### 검증 전 독립 최종 리뷰 체크포인트

- 마지막 파일 변경 이후 리뷰 범위를 고정하고, 작성·수정 단계와 분리된 read-only 리뷰 패스로 코드 리뷰 또는
  문서 안정성 평가를 수행한다.
- 테스트·CI, 수동 검증 또는 표적 검증 결과는 독립 리뷰나 체크포인트를 대체하지 않는다.
- Finding이 있으면 원인을 1회 수정하고 같은 범위를 1회 독립 재리뷰한다. 재리뷰에도 열린 Finding이 남으면 최종
  판정은 `Finding`으로 유지하고 추가 수정·재리뷰 없이 자동 실행을 `BLOCKED`로 종료해 보고한다. 열린 Finding이
  남아 있는 동안에는 [테스트/CI 전략](testing-strategy.md)의 로컬 표준 통합 품질 게이트를 실행하지 않는다.
- 열린 Finding이 0건이면 `열린 Finding 0건·검증 대기`를 기록한다. 이는 최종 판정이나 관점별 판정값을 새로
  추가하는 상태가 아니며, commit·push·PR·deploy Gate를 충족하지 않는다.
- 체크포인트의 리뷰 범위와 파일 내용이 바뀌면 체크포인트는 만료된다.

### No Findings 최종 리뷰 기록

- 최종 리뷰 기록은 마지막 변경 이후의 독립 리뷰 체크포인트와 동일 최종 후보의 적용 검증 결과만 기준으로 한다.
- 체크포인트 이후 파일이 바뀌지 않았다면 검증 통과 뒤 같은 독립 리뷰를 다시 실행하지 않고 두 증빙을 결합해
  최종 판정을 갱신한다.
- 관점별 판정은 `No Findings`, `Finding`, `기존 부채`, `N/A`만 사용한다.
- `No Findings`는 아래 조건을 모두 충족할 때만 선언한다.
    - 리뷰 범위가 PR diff, 커밋 범위, 변경 파일 중 하나로 고정되어 있다.
    - 코드/기능 변경의 7개 관점이 모두 `No Findings`, 근거 있는 `N/A`, 또는 이번 변경이 만들거나 확산하지 않은 `기존 부채`다.
    - 문서-only 변경은 [문서 거버넌스 정책](document-governance-policy.md)의 `문서 안정성 평가`를 통과했다.
    - 코드와 문서가 함께 변경된 경우 7개 관점 리뷰와 문서 안정성 평가가 모두 끝났다.
    - 열린 Finding이 0건이며, 기존 부채는 이번 변경이 만들거나 확산하지 않았다는 근거가 있다.
    - [테스트/CI 전략](testing-strategy.md)의 적용 품질 게이트가 마지막 변경 이후 통과했다.
    - 회귀 안전성, 문서 동기화, `N/A` 사유가 경로/라인/로그 중 하나 이상의 근거로 기록되어 있다.
- Finding 처리는 위 체크포인트의 1회 수정·재리뷰 및 자동 실행 `BLOCKED` 기준을 따른다. 열린 Finding이 0건인
  동일 최종 후보에만 적용 품질 게이트를 실행한다. 검증 실패로 파일을 수정하면 새 최종 후보로 독립 리뷰부터 다시 시작한다.
- 근거 없는 관점 판정, 마지막 변경 이전 검증 결과, 미해결 Finding이 하나라도 있으면 `No Findings`로 판정하지 않는다.

### Push 전 자체 리뷰 게이트

- 원격 `git push`, PR 생성, 기존 PR 브랜치 갱신, 태그 push 전에는 마지막 파일 변경 이후 push 대상 범위를 고정하고 자체 리뷰를 수행한다.
- branch push 범위는 `git status`, `git diff`, `git diff --cached`, upstream 대비 미push 커밋 목록(`git log @{u}..HEAD` 또는 base branch 비교)으로 확인한다.
- tag push 범위는 태그 대상 커밋, 릴리즈/제출 마커 의미, 관련 릴리즈 기록과 preview 검증 결과로 확인한다.
- push 전 보고에는 리뷰 범위, 열린 Finding, 마지막 변경 이후 검증, 문서 동기화, 최종 판정을 포함한다.
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

### API 계약·조회 구조 리뷰 라우팅

| 변경 신호 | 단일 SoT | 리뷰 증빙 |
| --- | --- | --- |
| JSON 성공/실패 envelope, transport 예외 | [API 공통 응답 계약 정책](api-response-contract-policy.md) | 요청·응답 fixture와 boundary diff |
| 실패 `ErrorData`, taxonomy, client 실패 분기 | [API 에러 계약 정책](api-error-contract-policy.md) | catalog/generated runtime/client 분기와 민감정보 검증 |
| public request/success DTO, producer·consumer mapping | [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md) | Swagger, generated contract, package version, 소비 경계 diff |
| 페이지/use-case 조회와 동작 operation | [API 조회·동작 설계 정책](api-operation-design-policy.md) | 페이지 소유 데이터, 요청 그래프, 실패 UX, payload/query 경계 |

- 리뷰어는 변경 신호에 해당하는 단일 SoT의 적용 절과 체크리스트를 사용한다. 이 문서는 DTO field, mapper,
  error taxonomy, operation 분리 조건 같은 기술 값을 다시 정의하지 않는다.
- 현재 diff가 읽거나 수정하지 않는 기존 불일치는 [엔지니어링 가드레일](engineering-guardrails.md)의
  `회귀 안전성 게이트`에 따라 `기존 부채`로 분류한다. 직접 수정·재사용·확산한 경로는 현재 변경의
  Finding으로 판정한다.
- 동시 배포 계약 묶음과 운영 legacy cutover는 [엔지니어링 가드레일](engineering-guardrails.md)의 기술 이행
  유형과 [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)를
  적용한다. 리뷰 범위의 `No Findings`를 전체 운영 cutover 완료로 확대 해석하지 않는다.

### 런타임 설정 리뷰 기준

- `coupler-api`의 DB pool, connection timeout, runtime config 로딩 경로, `config/default*.json`, 운영 `config/production*.json`, `config/production*.json.example`, 운영 환경변수 변경은 API 런타임 변경으로 리뷰한다.
- 리뷰 기록에는 배포 범위 `coupler-api`, 재배포/재시작 필요 여부, `DB migration` 적용 여부(`필요` 또는 `N/A`), 운영 config merge 영향, rollback 기준, post-deploy 확인 항목을 남긴다.
- DB pool/timeout 변경은 정상 동작 테스트만으로 완료하지 않고, 운영 배포 후 확인할 로그/지표를 함께 남긴다. 예: DB 연결 오류, queue limit 오류, p95/p99 latency, RDS connection/running thread 지표.

### 체크 포인트

- [ ] 요구사항을 정확히 구현했는가?
- [ ] 코드가 읽기 쉽고 이해하기 쉬운가?
- [ ] 중복 코드는 없는가?
- [ ] [엔지니어링 가드레일](engineering-guardrails.md)의 `No Findings 게이트` 기준으로 공통 원칙과 선택한 기술 이행 유형의 Exit Gate를 판정하고, 비적용 유형은 `N/A` 근거를 남겼는가?
- [ ] 같은 도메인에 문서가 여러 개면 [문서 거버넌스 정책](document-governance-policy.md) 기준으로 판정 책임별 단일 SoT가 1개로 고정돼 있고, 각 문서 상단에 역할/문서 종류/책임별 우선순위/기준 성격이 명시돼 있는가?
- [ ] policy를 추가·수정·삭제하면 대상 정책 전체(삭제는 삭제 전 본문)와 정방향·역방향 규범 참조를 검토하고, 책임/우선순위·상태/단계별 Exit Gate·전역 절 정합성·삭제 시 책임 승계가 [문서 거버넌스 정책](document-governance-policy.md)의 `정책 Composition Gate`를 통과했는가?
- [ ] [테스트/CI 전략](testing-strategy.md)의 공통 품질 게이트 검증 결과와 로그 링크가 PR에 명시되어 있는가? (`N/A` 항목은 미적용 근거 포함)
- [ ] 코드/기능 변경 시 다중 관점 리뷰 패스의 7개 관점을 확인했고, 무관한 관점은 `N/A` 근거를 남겼는가?
- [ ] 최종 리뷰가 같은 판단/근거/해결안을 반복하지 않고, finding 중심으로 간결하게 작성됐는가?
- [ ] 변경이 도메인/상태/enum/error source/code/surface/문서 역할을 추가·이동·개명한다면 분류 체계(taxonomy)가 단일 책임 기준으로 유지되는가?
- [ ] 최종 구조, 최종 공통 계약, canonical SoT 구현, cutover로 설명한 변경 범위에 transition 계층이 0건인가?
- [ ] 변경 범위 안에서 더 단순한 문서/코드 구조, SoT, 책임 경계, 파일 배치로 정리할 수 있는데도 중복/우회/임시 구조를 새로 만들거나 넓히지 않았는가?
- [ ] 외부 의존성 추가·대체가 있다면 에이전트 운영 규칙의 독립 승인과 표준 라이브러리·기존 직접 의존성 검토, 대안, exact package 범위 근거가 있는가?
- [ ] 확장성(향후 변경·확대)에 무리가 없는가?
- [ ] 신규·직접 수정 API 또는 새 페이지/use-case가 [API 조회·동작 설계 정책](api-operation-design-policy.md)의
  적용 절, 증빙과 완료 정의를 충족하는가?
- [ ] API 응답·에러·public DTO 변경이 `API 계약·조회 구조 리뷰 라우팅`의 단일 SoT와 각 체크리스트를
  충족하는가?
- [ ] 테스트 변경 판정이 충분한가? (`추가`/`갱신`/`미변경` 근거, 중복/누락 시나리오, 함수명-내용 일치, assertion 유효성)
- [ ] 보안 취약점은 없는가?
- [ ] 성능 문제는 없는가?
- [ ] 기능 회귀 가능성이 있는 변경은 [엔지니어링 가드레일](engineering-guardrails.md)의 `회귀 안전성 게이트` 기준으로 분류/검증됐는가?
- [ ] DB/API 런타임 설정 변경 시 `coupler-api` 재배포/재시작 필요 여부와 post-deploy 확인 항목을 기록했는가?
- [ ] React Native `StyleSheet.create`에 신규 style key를 추가한 경우 `lowerCamelCase`로 작성했는가?
- [ ] API 계약 변경이면 단일 최종 계약과 강제 업데이트/mandatory 방식이 남았고, 호환 경로 추가/수정/사용이
  있으면 작업 요청자의 명시적 승인과 제거 조건·목표 시점·추적 이슈가 PR/릴리즈 기록에 남았는가?
- [ ] 다중 레포 계약 묶음의 문서가 개별 브랜치의 리뷰 시점이 아니라 관련 PR 전체 병합 후 source main 상태를
  설명하고, 문서 PR이 선행 consumer PR 이후에 merge되도록 의존 순서가 기록됐는가?
- [ ] 기존 정책 불일치를 회귀로 오판하지 않고, 이번 변경이 새로 만들거나 확산한 문제인지 근거로 구분했는가?
- [ ] 문서 변경 시 기존 내용과 충돌하는 부분은 없는가?
- [ ] docs 신규 문서 작성/구조 개편 시 `content/templates/` 템플릿 기준을 따르는가? (예외 시 근거 확인)
- [ ] 문서 변경 시 [테스트/CI 전략](testing-strategy.md)의 docs 검증 게이트를 통과했는가?
- [ ] 문서 추가/삭제/이동/개명 시 [문서 거버넌스 정책](document-governance-policy.md) 기준으로 `content/AGENTS.md` 인덱스와 `mkdocs.yml` `nav`가 같은 PR에서 함께 갱신됐는가?

### 리뷰 전제

- 기술 이행 전제는 [엔지니어링 가드레일](engineering-guardrails.md)의 `기술 이행 유형`에서 먼저 고정한다.
- 이 프로젝트의 기본 전제는 Store 심사 승인과 출시 가능 상태 확인 뒤 activation window에서
  `version_code`·`min_version` 갱신으로 이전 build를 `force_update=2`로 차단하고, NextPush도 같은 장벽 안에서
  Android·iOS `Production` mandatory로 이전 bundle을 교체하는 `동시 배포 계약 묶음`이다.
- API/Admin과 Mobile 교체가 모두 끝나기 전에 혼합 계약 사용자 요청이 통과하면 Finding이다. activation
  barrier를 보장할 수 없으면 fallback을 요구하지 않고 배포 차단으로 판정한다.
- 설치된 구버전의 존재나 일반적인 공존 가능성만으로 `호환 배포`를 제안하거나 Finding으로 요구하지 않는다.
  호환 배포는 작업 요청자의 명시적 승인 근거가 있을 때만 판정한다.
- 승인된 운영 legacy를 제거할 때는 강제 업데이트/mandatory와 현재 코드 소비 경로 0건을 확인하며, 24시간
  traffic 관찰은 작업 요청자가 별도로 요구하지 않는 한 Gate로 추가하지 않는다.

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
- [API 조회·동작 설계 정책](api-operation-design-policy.md)
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
