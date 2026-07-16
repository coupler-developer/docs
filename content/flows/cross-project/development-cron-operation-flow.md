# 개발계 cron 운영 흐름

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: 작업 목록·주기는 [Cron 작업](../../architecture/cron-jobs.md), 상태 전이·알림·삭제 판정은 각 도메인 정책
- 기준 성격: `as-is`

## 목적

- 공유 개발계에서 운영과 같은 시간 기반 상태 전이를 재현하되 실제 FCM 발송, 무단 호출, 의도하지 않은 개인정보·프로필 삭제를 기본 차단한다.
- 서버의 수동 endpoint별 crontab 대신 repository가 소유한 단일 dispatcher를 배포해 스케줄 유실과 중복 실행을 방지한다.

## 기본 안전 모드

| 항목 | 기본값 | 효과 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 다른 환경에서 development cron 실행 차단 |
| `DEV_CRON_ENABLED` | `true` | 인증된 개발 dispatcher만 허용 |
| `DEV_CRON_TOKEN` | 32자 이상 무작위 값 | `x-dev-cron-token` 인증, 로그·repository 저장 금지 |
| `DEV_CRON_BASE_URL` | `http://127.0.0.1:3002` | 같은 EC2의 API만 호출 |
| `DEV_CRON_EXTERNAL_DELIVERY_ENABLED` | `false` | cron 문맥의 실제 FCM 전송 차단 |
| `DEV_CRON_DESTRUCTIVE_ENABLED` | `false` | 회원 자동삭제·오래된 프로필 삭제 차단 |
| `DEV_DATA_CRON_FENCE_ENABLED` | `true` | 합성 데이터 run과 cron의 동시 DB 변경 차단 |
| `DEV_DATA_REGISTRY_DIR` | private 절대 경로 | feeder fence와 cron lease 공유 |

개발 cron이 변경하는 DB 상태, 키 환불, 예약 매칭, 내부 알람 row는 실제 QA 대상이다. 외부 FCM만 차단된다고 해서 DB write가 dry-run이 되는 것은 아니다.

## 설치 전 확인

1. 개발 API 배포 경로와 PM2 process `coupler-api`가 현재 개발 DB를 사용하는지 확인한다.
2. 배포 SHA에 development cron access guard, 외부 전송 억제 context, destructive guard, dispatcher가 포함됐는지 확인한다.
3. `command -v pnpm`, `/usr/bin/flock`, loopback API 응답을 확인한다.
4. 기존 user/root crontab과 `/etc/crontab`, `/etc/cron.d`를 백업·검색해 `/admin/cron/` 직접 호출과 기존 dispatcher가 없는지 확인한다. installer도 현재 user crontab의 legacy·unmanaged entry를 발견하면 변경 없이 중단한다.
5. 개발 DB의 비어 있지 않은 FCM token 수와 두 삭제성 작업의 예상 대상 건수를 집계한다. 개별 token·회원정보는 출력하지 않는다.

## 환경 파일 준비

```sh
PNPM_BIN="$(command -v pnpm)"
DEV_CRON_TOKEN="$(openssl rand -hex 32)"
DEV_DATA_REGISTRY_DIR=/home/projects/ritzy/.dev-data-registry
sudo install -d -m 755 /etc/coupler-api
install -d -m 700 "$DEV_DATA_REGISTRY_DIR"
sudo install -m 600 -o "$USER" -g "$(id -gn)" /dev/null /etc/coupler-api/dev-cron.env
printf '%s\n' \
  'NODE_ENV=development' \
  'DEV_CRON_ENABLED=true' \
  "DEV_CRON_TOKEN=$DEV_CRON_TOKEN" \
  'DEV_CRON_BASE_URL=http://127.0.0.1:3002' \
  'DEV_CRON_EXTERNAL_DELIVERY_ENABLED=false' \
  'DEV_CRON_DESTRUCTIVE_ENABLED=false' \
  'DEV_DATA_CRON_FENCE_ENABLED=true' \
  "DEV_DATA_REGISTRY_DIR=$DEV_DATA_REGISTRY_DIR" \
  "PNPM_BIN=$PNPM_BIN" > /etc/coupler-api/dev-cron.env
chmod 600 /etc/coupler-api/dev-cron.env
```

- 환경 파일은 cron을 실행하는 OS 사용자 소유, mode `600`이어야 한다.
- 실제 token을 터미널 로그, PR, 이슈, 문서 증빙에 남기지 않는다.

## API 재시작과 scheduler 설치

```sh
cd /home/projects/ritzy/ritzy-api
pnpm install --frozen-lockfile
set -a
. /etc/coupler-api/dev-cron.env
set +a
pnpm data-feed init-registry
pm2 restart coupler-api --update-env
pm2 save

./scripts/install-development-cron.sh install
crontab -l
```

- installer는 기존 crontab을 보존하고 `BEGIN/END COUPLER DEVELOPMENT CRON` marker 구간만 원자적으로 교체한다.
- `init-registry`는 DB를 열거나 변경하지 않고 private registry의 최초 directory와 빈 fence만 만든다. fence가 없는데 active record가 있으면 자동 복구하지 않고 중단한다.
- `ops/cron/development.crontab`의 단일 1분 dispatcher와 `flock`만 설치한다.
- endpoint별 cron 표현식은 `lib/development-cron-schedule.ts`가 소유한다.
- installer는 `.runtime` directory를 mode `700`, log와 `flock` file을 mode `600`으로 만들고 symlink·비정규 파일이면 중단한다. log는 runner가 10 MiB에서 `.1` 하나로 회전한다.

## 활성화 검증

```sh
./scripts/run-development-cron.sh run checkMatch
tail -n 100 .runtime/development-cron.log
pm2 logs coupler-api --lines 100 --nostream
```

다음을 모두 확인한다.

- token 없는 외부 요청은 `CRON_DEVELOPMENT_ACCESS_DENIED`로 handler 전에 거부된다.
- 수동 `checkMatch`는 loopback·token 경로로 `PASS`를 기록한다.
- 매분 dispatcher run이 KST due job을 manifest 순서대로 실행하고 `PASS`/`SKIP`/`FAIL`을 구조화 JSON으로 남긴다. 동일 DB 행의 상태 전이 경쟁을 피하기 위해 due job끼리 병렬 실행하지 않는다.
- 로그에 token, FCM token, 회원정보가 없다.
- cron 대상 내부 알람과 상태 전이는 생성되지만 Firebase 전송 성공 로그는 없다.
- `DEV_CRON_DESTRUCTIVE_ENABLED=false`에서 두 삭제성 endpoint가 `CRON_DEVELOPMENT_DESTRUCTIVE_DISABLED`로 거부된다.
- 같은 minute run이 겹치면 두 번째 dispatcher가 `flock`으로 실행되지 않는다.
- 같은 job의 이전 handler가 아직 끝나지 않았으면 다음 호출은 idempotent success와 `x-dev-cron-result: already-running`을 반환하고 dispatcher는 `SKIP`으로 기록하며 DB query를 다시 시작하지 않는다.
- dispatcher 요청은 최대 45초에 중단되지만, 서버 handler가 계속 실행 중이면 job lease는 실제 promise가 끝날 때까지 남아 다음 중복 호출과 feeder claim을 차단한다.

## 삭제성 작업 일회성 검증

상시 활성화하지 않는다. 대상 건수, 개발 DB snapshot 또는 복구 기준, 작업 시간을 검토한 일회성 작업에서만 수행한다.

1. scheduler를 잠시 제거한다.
2. 환경 파일의 `DEV_CRON_DESTRUCTIVE_ENABLED=true`를 설정하고 API를 `--update-env`로 재시작한다.
3. 대상 job 하나만 `run <job-id>`로 실행한다.
4. 삭제 건수와 잔존 불변식을 확인한다.
5. 즉시 값을 `false`로 되돌리고 API를 재시작한 뒤 scheduler를 다시 설치한다.

## 중지와 rollback

```sh
./scripts/install-development-cron.sh remove
crontab -l
```

1. 환경 파일의 `DEV_CRON_ENABLED=false`를 설정한다.
2. `set -a; . /etc/coupler-api/dev-cron.env; set +a` 후 `pm2 restart coupler-api --update-env`를 실행한다.
3. `.runtime/development-cron.log`에서 마지막 run과 중지 시각을 확인한다.
4. DB 변경은 자동 rollback하지 않는다. 잘못된 상태 전이·환불·삭제는 대상 도메인 정책의 data repair 절차로 분리한다.

## 공유 개발 데이터와의 관계

- 평상시에는 개발 cron을 실행한다.
- 합성 데이터 `apply`는 shared registry mutex 안에서 active cron lease가 0건일 때만 fence를 만든다. 실행 중인 cron이 있으면 DB write 전에 실패하므로 cron을 수동으로 끄고 주입하지 않는다.
- fence가 만들어진 뒤 화면 검증·`reset`까지는 cron handler가 lease를 만들기 전에 일시 차단된다.
- reset과 registry finalization이 끝나면 다음 1분 dispatcher부터 자동 재개한다.
- fence를 개발 cron 미설치 사유나 장기 중지 수단으로 사용하지 않는다.

## stale lease 복구

- `_cron_leases` file은 API process가 비정상 종료되면 남을 수 있으며 자동 만료하지 않는다. 임의 만료는 아직 실행 중인 DB 작업과 feeder를 겹치게 할 수 있기 때문이다.
- 같은 job의 `SKIP` 또는 feeder claim 차단이 계속되면 scheduler를 먼저 remove하고 API를 재시작해 이전 handler가 종료됐음을 확정한다.
- `fence.json`과 `active` record를 read-only로 확인해 합성 데이터 run이 없을 때만 해당 stale lease file 하나를 제거한다. 실행 여부나 소유권을 확인할 수 없으면 제거하지 않는다.
- 복구 뒤 `plan` 또는 수동 cron job 하나로 registry 정합성을 확인한 다음 scheduler를 다시 install한다.

## 관련 문서

- [Cron 작업](../../architecture/cron-jobs.md)
- [테스트용 개발 데이터 운영 흐름](development-test-data-flow.md)
- [푸시알림 운영 정책](../../policy/push-notification-policy.md)
- [데이터 거버넌스 정책](../../policy/data-governance-policy.md)
