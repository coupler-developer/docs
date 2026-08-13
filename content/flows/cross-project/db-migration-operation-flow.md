# DB Migration 실행 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [DB Migration 정책](../../policy/db-migration-gate-policy.md)
- 기준 성격: `as-is`

## 전체 흐름

```text
Mac: migration 생성 → Docker MySQL·MariaDB 실제 실행 검증
개발 서버: ubuntu SSH → exact source checkout → status dev → apply dev
운영 서버: ubuntu SSH → sudo -i → 개발과 같은 exact source checkout → status prod → apply prod
```

제품 릴리스 사이에도 다른 migration은 main에 계속 추가·병합할 수 있다. 운영계는 최신 main이 아니라 개발계에
적용한 마이그레이션 소스 커밋을 사용하므로 후속 migration을 함께 실행하지 않는다.

## 1. Mac에서 작성·검증

```bash
cd /path/to/workspace/coupler-api

pnpm db:migration new add_member_status
```

생성된 `db/migrations/<17자리 UTC ID>_add_member_status.sql`에 필요한 SQL 문장을 모두 작성한다. 한 문장 제한은
없다. 기존 source 파일은 수정하지 않는다.

```bash
pnpm db:migration verify
pnpm verify
```

첫 명령은 Docker MariaDB 10.6과 MySQL 8.4를 각각 생성해 baseline과 migration 전체를 실행하고 MariaDB
결과로 생성 lock을 동기화하며 재실행 skip을 확인한 뒤 container를 제거한다. 변경된 lock을 SQL과 함께
리뷰한다. 두 명령과 리뷰가 통과한 source를 API main에 병합한다.

## 2. 개발 DB 적용

Mac에서 승인된 개발 SSH 키와 host로 `ubuntu` 계정에 접속한다. 아래 꺾쇠괄호 값은 실행할 때 승인된 실제
값으로 바꾸며, 개인 경로·키 파일명·고정 host/IP는 공유 런북에 기록하지 않는다.

Mac shell:

```bash
ssh -i "<승인된 개발 SSH 키 경로>" "ubuntu@<개발 EC2 주소>"
```

접속한 개발 서버의 `ubuntu` shell에서 다음을 실행한다. DB 사용자는 `config/development.json`이 선택하며 현재
환경에서는 `coupler`다.

```bash
(
set -e
cd /home/ubuntu/coupler-api

git fetch --no-tags origin main
MIGRATION_SOURCE_COMMIT='<개발계에 검증·적용할 40자 SHA>'
[[ "${MIGRATION_SOURCE_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
git switch --detach "${MIGRATION_SOURCE_COMMIT}"
test "$(git rev-parse HEAD)" = "${MIGRATION_SOURCE_COMMIT}"

pnpm install --frozen-lockfile
pnpm db:migration status dev
pnpm db:migration apply dev
pnpm db:migration status dev
)
```

첫 status에서 환경·DB identity·전체 SHA와 pending 목록을 확인한다. apply typed confirmation에도 같은 환경과
SHA가 표시된다. 마지막 status는 이 source의 pending이 0이어야 한다.

실행 오류나 중단이 발생하면 apply를 자동 재실행하지 않는다. live DB와 `schema_migrations`를 수동 확인하고
별도 판단한다.

## 3. 운영 DB 적용

개발계에서 성공한 `MIGRATION_SOURCE_COMMIT`을 그대로 전달한다. Mac에서 승인된 운영 SSH 키와 host로
`ubuntu` 계정에 접속한다. 아래 꺾쇠괄호 값은 실행할 때 승인된 실제 값으로 바꾸며, 개인 경로·키 파일명·고정
host/IP는 공유 런북에 기록하지 않는다.

Mac shell:

```bash
ssh -i "<승인된 운영 SSH 키 경로>" "ubuntu@<운영 EC2 주소>"
```

접속한 `ubuntu` shell에서는 repo 명령을 실행하지 않고 root 로그인 shell로 전환한다.

```bash
sudo -i
```

이후 명령은 모두 전환된 root shell에서 실행한다. 운영 repo와 `.git`, `node_modules`가 root 소유이므로
`ubuntu` shell에서 `fetch`, `switch`, `install`, migration 명령을 실행하지 않는다. DB 사용자는
`config/production.json`이 선택하며 현재 환경에서는 `ritzy`다.

```bash
(
set -e
test "$(id -u)" -eq 0
cd /home/projects/coupler-api

git fetch --no-tags origin main
MIGRATION_SOURCE_COMMIT='<개발계에 적용한 같은 40자 SHA>'
[[ "${MIGRATION_SOURCE_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
git switch --detach "${MIGRATION_SOURCE_COMMIT}"
test "$(git rev-parse HEAD)" = "${MIGRATION_SOURCE_COMMIT}"

pnpm install --frozen-lockfile
pnpm db:migration status prod
pnpm db:migration apply prod
pnpm db:migration status prod
)
```

운영 status가 출력한 DB hostname/database/current user와 SHA가 운영 대상 및 개발계 source와 일치하는지 확인한
뒤 apply한다. 마지막 status는 이 source의 pending이 0이어야 한다. 그 뒤 필요한 API 배포와 smoke는
[API 운영 배포 런북](api-production-deploy-flow.md)을 따른다.

## 개발자 시뮬레이션

### 개발 적용 뒤 새 migration이 main에 추가된 경우

SHA A에는 M1, 이후 SHA B에는 M1+M2가 있다고 가정한다.

```text
개발이 A checkout: M1 pending → apply → M1 applied
main에 B merge
운영이 A checkout: source에는 M1만 존재 → M1만 pending/apply
개발이 나중에 B checkout: M1 skip, M2 pending/apply
```

M2를 운영에 적용할 때는 B를 별도의 마이그레이션 소스 커밋으로 개발계부터 확인한다.

### 같은 명령을 재실행한 경우

정상 성공 행의 filename과 checksum이 같으므로 SQL은 0건 실행되고 모두 skip된다. 같은 filename의 checksum이
다르면 SQL 전에 실패한다. 실패·중단된 명령의 재실행은 이 경우에 포함하지 않는다.

### 개발 96행, 운영 87행인 경우

전체 행 수는 비교하지 않는다.

```text
새 source 비어 있음: dev pending 0, prod pending 0
M1이 dev에만 있음: dev M1 skip, prod M1 pending
```

과거 96행과 87행은 그대로 보존되고 새 source 판정에서 직접 비교되지 않는다.

### IAP가 이미 존재하는 경우

양쪽 DB의 `t_iap_notification`과 `schema_migrations`를 변경하지 않는다. IAP migration을 만들거나 기존 DROP
current SQL을 실행하지 않는다. source 기준 파일만 실제 공통 schema와 정렬된 상태다.

### 서버 경로와 계정이 다른 경우

```text
Mac              /path/to/workspace/coupler-api  new, verify
Mac              승인된 개발 SSH 접속 정보       개발 서버 ubuntu 접속
개발 서버 ubuntu  /home/ubuntu/coupler-api       status dev, apply dev
Mac              승인된 운영 SSH 접속 정보       운영 서버 ubuntu 접속
운영 서버 ubuntu  SSH 접속만 수행               sudo -i
운영 서버 root    /home/projects/coupler-api     status prod, apply prod
개발 DB user coupler / 운영 DB user ritzy        환경별 config가 선택
```

서버 repo 절대경로와 권한 전환만 공유 런북에 둔다. 개인 key 경로·key 파일명·고정 host/IP와 credential은
문서·runner·명령 출력에 넣지 않는다.

## 금지

- 운영에서 개발계와 다른 SHA 또는 최신 main을 임의 실행
- 운영 repo 명령을 `ubuntu` shell에서 실행하거나 root shell 전환을 생략
- migration 파일을 workflow 밖에서 직접 실행
- main에 병합된 migration의 수정·삭제·이름 변경
- 실패·중단된 apply의 자동 재실행
- 기존 `schema_migrations` 삭제·교체 또는 과거 행 수정
- release-time flush/finalize, 별도 watermark, plan/journal/receipt 생성

## 관련 문서

- [DB Migration 정책](../../policy/db-migration-gate-policy.md)
- [API 운영 배포 런북](api-production-deploy-flow.md)
