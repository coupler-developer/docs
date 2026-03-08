# DB Migration Gate 정책

## 문서 역할

- 역할: `규범`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- DB 마이그레이션 검증을 `Gate ID` 기반으로 추적 가능하게 고정한다.
- 실행자/리뷰어/에이전트가 동일 근거로 합격/실패를 판정하게 한다.
- fail-closed 원칙으로 중간 상태 배포를 차단한다.
- 운영 `dump`를 baseline으로 삼아 `Local -> 개발계 DB -> 운영계` 순서로 동일 SQL 검증/반영 절차를 고정한다.

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

| Gate ID | Stage | 적용 조건 | 판정 책임 | 최소 증빙 | 실패 시 동작 |
| --- | --- | --- | --- | --- | --- |
| `DBM-GATE-000` | Precheck | 모든 DB 변경 작업 | 선행 객체/컬럼/버전 조건 충족 | precheck SQL 결과, baseline 로그 | 즉시 중단 |
| `DBM-GATE-100` | Expand | 신규 테이블/컬럼/인덱스/FK 추가가 있을 때 | 신규 객체 생성 및 스키마 검증 | DDL 결과, schema diff 또는 show/create 결과 | 즉시 중단 |
| `DBM-GATE-200` | Backfill | 기존 데이터 이관/보정이 있을 때 | row 수/무결성/상태 매핑 검증 | source/target count, 무결성 쿼리 결과, guard 로그 | 즉시 중단 |
| `DBM-GATE-300` | Cutover | read/write 기준, 계산식, 조회 경로를 구 버전에서 신 버전으로 전환할 때 | 구/신 계산 diff 0건 검증 | diff 쿼리 결과, 대상 시나리오/기간 또는 샘플 수, 로그 경로 | 즉시 중단 |
| `DBM-GATE-400` | Contract | 레거시 객체 삭제, 호환 분기 제거, `drop` 실행이 있을 때 | 레거시 객체/호환 분기 제거 검증 | 의존성 0건 확인, 일정 기간 read/write 0건 로그, 제거 후 postcheck 결과 | 즉시 중단 |

## 작성 규칙

- 각 마이그레이션 SQL 헤더에 `Gate IDs:`를 명시한다.
- baseline은 운영 `dump`를 로컬 MySQL에 복원한 상태를 기준으로 한다.
- 각 postcheck SQL은 적용 대상 Gate별 카운터와 최종 guard 결과를 출력한다.
- guard 실패는 `SIGNAL SQLSTATE '45000'` 또는 의도된 실패 쿼리로 즉시 중단한다.
- Gate 통과 근거 로그 파일 경로를 PR/리뷰 코멘트에 남긴다.
- 적용되지 않는 Gate는 생략하지 말고 `N/A`로 기록한다.
- `N/A`는 `Gate ID + N/A 사유 + 근거 경로` 3종 세트가 있을 때만 인정한다.
- 더미 SQL 또는 의미 없는 0건 결과로 Gate를 통과 처리하지 않는다.

## 판정 규칙

- 하나의 Gate라도 실패하면 해당 Stage는 미완료다.
- 적용 대상 Gate 중 하나라도 미실행/미기록이면 미완료다.
- `No Findings`는 적용 대상 필수 Gate 전부 통과 + 비적용 Gate 전부 `N/A` 근거 완료일 때만 선언한다.
- `DBM-GATE-400`이 적용되는 변경은 이번 변경에서 제거 대상으로 명시한 레거시 잔존 0건까지 확인해야만 `No Findings`다.
- 삭제 대상이 명시되지 않은 기존 기능/객체는 레거시로 간주해 삭제하지 않는다.
- `DBM-GATE-300`은 diff 0건만으로 충분하지 않다. 검증 범위(대상 시나리오, 기간 또는 샘플 수)와 로그 위치가 함께 명시되어야 한다.
- `DBM-GATE-400`은 레거시 `drop` 전 의존성 0건 확인과 일정 기간 read/write 0건 모니터링을 완료해야만 통과다.

## 실행 검증 파이프라인 (간단)

1. `Local Baseline 검증`: 최신 운영 `dump`를 로컬 MySQL에 복원하고 precheck SQL을 먼저 실행한다. `DBM-GATE-000` 또는 baseline gate 미통과 시 즉시 중단한다.
2. `Local 마이그레이션 검증`: 운영 `dump` 기준 로컬 DB에 신규 DDL/backfill/cutover/contract SQL을 순서대로 실행하고, `DBM-GATE-100/200/300/400` 통과 전까지 수정-재실행을 반복한다.
3. `개발계 사전 검증`: 로컬에서 통과한 동일 SQL 세트를 개발계 DB에 동일 순서로 적용하고, 카운터/해시/guard 결과가 동일 결론(`No Findings`)인지 확인한다.
4. `운영계 반영`: Local+개발계 검증 완료 후에만 운영계 MySQL에 동일 SQL 세트를 반영한다. 운영계 반영 실패 시 Local 단계부터 다시 수행한다.
5. `운영계 postcheck`: 운영계 반영 직후 동일 Gate 기준 postcheck SQL을 실행해 최종 guard 결과를 확인하고 로그를 남긴다.
6. `근거 기록`: PR/리뷰에 적용 대상 Gate별 `Gate ID + SQL 파일 경로 + 로그 경로`를 남기고, 비적용 Gate는 `Gate ID + N/A 사유 + 근거 경로`를 남긴다.
7. `승인 조건`: Local/개발계 DB 검증 근거가 없으면 승인하지 않는다. 운영 반영 완료 판정은 운영계 postcheck 로그까지 확인됐을 때만 가능하다.

## 에이전트/리뷰어 추적 규칙

- 작업 지시 또는 리뷰에서 `DBM-GATE-*`가 언급되면, 본 문서를 우선 기준으로 해석한다.
- 근거 제시는 적용 Gate에 대해 `Gate ID + SQL 파일 경로 + 로그 경로`, 비적용 Gate에 대해 `Gate ID + N/A 사유 + 근거 경로`를 기본으로 한다.
