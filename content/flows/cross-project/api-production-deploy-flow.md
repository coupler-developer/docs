# API 운영 배포 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [릴리스 프로세스](../../policy/release-process.md)
- 기준 성격: `as-is`

## 목적

- `coupler-api`의 확정된 `main` commit을 운영 PM2 production 설정으로 배포·검증한다.

## 범위

- 시작 조건: [운영 릴리스 실행 런북](production-deploy-command-runbook.md)의 공통 preflight가 같은 입력으로 `PASS`했고 운영 EC2 접근·package 인증이 준비된 상태
- 종료 조건: exact commit이 PM2 production 설정으로 실행되고 내부·외부 smoke와 로그 확인이 끝난 상태
- 제외 범위: DB migration, Admin 정적 artifact, Mobile, 서비스 태그

## 실행 흐름

운영 배포는 `API_ACTION=deploy`, 릴리스 기록이 허용한 previous-release rollback은 `API_ACTION=rollback`으로
설정하고 운영 EC2의 새 shell에서 실행한다. 기능별 smoke와 적용 지표는 릴리스 기록 또는 해당 도메인 문서가
소유한다.

```bash
set -euo pipefail
: "${API_ACTION:?set API_ACTION to deploy or rollback}"
: "${TARGET_COMMIT:?set TARGET_COMMIT}"
[[ "${TARGET_COMMIT}" =~ ^[0-9a-f]{40}$ ]]

DEPLOY_ROOT=/home/projects/coupler-api
cd "${DEPLOY_ROOT}"
test "$(pwd -P)" = "${DEPLOY_ROOT}"

WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
git fetch --no-tags origin
test "$(git rev-parse --verify "${TARGET_COMMIT}^{commit}")" = "${TARGET_COMMIT}"

case "${API_ACTION}" in
  deploy)
    test "$(git rev-parse origin/main)" = "${TARGET_COMMIT}"
    git checkout main
    git merge --ff-only "${TARGET_COMMIT}"
    ;;
  rollback)
    git checkout --detach "${TARGET_COMMIT}"
    ;;
  *)
    printf 'invalid API_ACTION: %s\n' "${API_ACTION}" >&2
    exit 1
    ;;
esac
test "$(git rev-parse HEAD)" = "${TARGET_COMMIT}"

pnpm install --frozen-lockfile
pm2 startOrReload ./pm2.json --env production --only coupler-api
pm2 save
pm2 status coupler-api
pm2 describe coupler-api
PM2_STATE="$(
  pm2 jlist | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const app = JSON.parse(input).find((item) => item.name === "coupler-api");
      process.stdout.write([
        app?.pm2_env?.status ?? "",
        app?.pm2_env?.NODE_ENV ?? "",
        app?.pm2_env?.pm_cwd ?? "",
      ].join("|"));
    });
  '
)"
test "${PM2_STATE}" = "online|production|${DEPLOY_ROOT}"

curl --fail-with-body --show-error -i http://127.0.0.1:3002/
curl --fail-with-body --show-error -i https://api.ritzy.fourhundred.co.kr/
pm2 logs coupler-api --lines 100 --nostream
git grep -n "router.get('/" "${TARGET_COMMIT}" -- routes/admin/cron.ts
sudo crontab -l
```

exact commit, action, PM2 상태, 내부·외부 응답과 릴리스 기록의 기능별 smoke·지표를 모두 증빙한다. 하나라도 실패하면
배포 완료나 서비스 태그 가능 상태로 판정하지 않는다.

API source 배포는 운영 root crontab을 변경하지 않는다. 출력한 cron route와
[Cron 작업](../../architecture/cron-jobs.md)의 운영 호출 상태를 대조해 활성 작업은 exact endpoint와 주기가
root crontab에 있고, 의도적 중지 작업은 호출이 없거나 주석 상태인지 확인한다. 새 활성 route는 다음 예약 실행의
cron 로그와 비식별화한 상태 변경·알림 저장 결과까지 확인한다. 의도적 중지 route를 배포됐다는 이유로 활성화하거나,
삭제성 endpoint를 검증 목적으로 직접 호출하지 않는다.

## 예외 흐름

- install 또는 PM2 반영이 중단되면 블록을 처음부터 재실행하지 않는다. checkout, PM2 상태, 내부·외부 응답과
  로그로 실제 반영 지점을 먼저 확인한다.
- rollback은 릴리스 기록이 exact commit과 현재 TARGET DB 계약의 호환성을 증명한 경우에만 수행한다. 근거가
  없으면 forward fix를 사용한다.

## 비포함 / 금지

- 운영에서 `node app.ts` 또는 `pm2 start app.ts`로 `pm2.json`과 `prestart` 검사를 우회하지 않는다.
- 개발계 성공을 운영 배포·검증 또는 서비스 태그 근거로 사용하지 않는다.
- DB migration 뒤 이전 API 복구 가능성을 API 응답만으로 추론하지 않는다.

## 관련 문서

- [운영 릴리스 실행 런북](production-deploy-command-runbook.md)
- [DB Migration 실행 런북](db-migration-operation-flow.md)
- [API 계약 변경 모바일 릴리스 플로우](api-contract-mobile-release-flow.md)
- [릴리스 태그 정책](../../policy/release-tag-policy.md)
