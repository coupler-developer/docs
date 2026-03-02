# DB Migration Gate 정책

## 목적

- DB 마이그레이션 검증을 `Gate ID` 기반으로 추적 가능하게 고정한다.
- 실행자/리뷰어/에이전트가 동일 근거로 합격/실패를 판정하게 한다.
- fail-closed 원칙으로 중간 상태 배포를 차단한다.

## 적용 범위

- DB 스키마 변경(DDL)
- 데이터 이관(backfill)
- 읽기 기준 변경(cutover)
- 레거시 제거(contract)

## Gate ID 규칙

- 형식: `DBM-GATE-###` (예: `DBM-GATE-010`)
- `###`은 3자리 숫자 고정
- 한 Gate ID는 하나의 판정 책임만 가진다
- SQL/문서/PR/로그에서 동일 Gate ID를 공통 사용한다

## 필수 Gate 세트

| Gate ID | Stage | 판정 책임 | 실패 시 동작 |
| --- | --- | --- | --- |
| `DBM-GATE-000` | Precheck | 선행 객체/컬럼/버전 조건 충족 | 즉시 중단 |
| `DBM-GATE-100` | Expand | 신규 테이블/인덱스/FK 생성 검증 | 즉시 중단 |
| `DBM-GATE-200` | Backfill | row 수/무결성/상태 매핑 검증 | 즉시 중단 |
| `DBM-GATE-300` | Cutover | 구/신 계산 diff 0건 검증 | 즉시 중단 |
| `DBM-GATE-400` | Contract | 레거시 객체/호환 분기 제거 검증 | 즉시 중단 |

## 작성 규칙

- 각 마이그레이션 SQL 헤더에 `Gate IDs:`를 명시한다.
- 각 postcheck SQL은 Gate별 카운터와 최종 guard 결과를 출력한다.
- guard 실패는 `SIGNAL SQLSTATE '45000'` 또는 의도된 실패 쿼리로 즉시 중단한다.
- Gate 통과 근거 로그 파일 경로를 PR/리뷰 코멘트에 남긴다.

## 판정 규칙

- 하나의 Gate라도 실패하면 해당 Stage는 미완료다.
- `No Findings`는 필수 Gate 전부 통과 + 레거시 잔존 0건일 때만 선언한다.
- 삭제 대상이 명시되지 않은 기존 기능/객체는 레거시로 간주해 삭제하지 않는다.

## 실행 검증 파이프라인 (간단)

1. `Local Baseline 검증`: 운영 기준 baseline SQL(덤프/초기화 + precheck)을 로컬 DB에 먼저 적용하고, `DBM-GATE-000` 및 baseline gate 미통과 시 즉시 중단한다.
2. `Local 마이그레이션 검증`: 신규 DDL/backfill/cutover/contract SQL을 로컬 DB에 순서대로 실행하고, `DBM-GATE-100/200/300/400` 통과 전까지 수정-재실행을 반복한다.
3. `개발계 사전 검증`: 로컬과 동일 SQL 세트를 개발계 DB에 동일 순서로 적용하고, 카운터/해시/guard 결과가 동일 결론(`No Findings`)인지 확인한다.
4. `시나리오 DB 반영`: 로컬+개발계 검증 완료 후에만 시나리오 DB(또는 운영 전 검증 DB)에 반영하고, 실패 시 Local 단계부터 다시 수행한다.
5. `근거 기록`: PR/리뷰에 `Gate ID + SQL 파일 경로 + 로그 경로`를 남기며, 최소 2개 환경(Local/개발계) 통과 근거가 없으면 승인하지 않는다.

## 에이전트/리뷰어 추적 규칙

- 작업 지시 또는 리뷰에서 `DBM-GATE-*`가 언급되면, 본 문서를 우선 기준으로 해석한다.
- 근거 제시는 `Gate ID + SQL 파일 경로 + 로그 경로` 3종 세트를 기본으로 한다.
