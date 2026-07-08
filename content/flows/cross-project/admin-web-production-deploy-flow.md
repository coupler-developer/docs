# Admin 운영 배포 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [배포/릴리즈 프로세스](../../policy/release-process.md)
- 기준 성격: `as-is`

## 목적

- `coupler-admin-web`를 CRA 개발 서버 없이 `build/ + nginx` 구조로 운영 배포하는 실행 절차를 고정한다.

## 범위

- 시작 조건: `coupler-admin-web` 배포 커밋이 `main`에서 확정되고, `No Findings` 기준을 통과했으며, 운영 `EC2` SSH 접근 권한이 준비된 상태
- 종료 조건: `https://cms.ritzy.fourhundred.co.kr`가 `nginx`로 `200` 응답하고, 브라우저 콘솔에 CRA 개발 서버 WebSocket 재연결 오류가 없는 상태
- 제외 범위: `coupler-api` 프로세스 배포, `RDS` 반영, 모바일 배포

## 상위 규범 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)

## 액터

- 릴리즈 작업자: 로컬 또는 CI에서 `build/` 산출물을 준비하고 업로드한다.
- 운영 `EC2`: `/var/www/coupler-admin-web`와 `nginx` 설정을 유지한다.
- `nginx`: `build/` 정적 파일을 내부 `8000` 포트에서 서빙한다.
- `pm2`: `coupler-api`만 관리한다. `coupler-admin-web`는 관리 대상이 아니다.

## 환경별 주의사항

- 개발계 Admin 배포는 운영 전 검증 목적이다. 개발계 반영 성공을 운영 배포 완료, 운영 npm auth 검증, 운영 태그 생성 근거로 사용하지 않는다.
- 운영계 Admin 배포는 실사용자 대상이다. `main` 배포 커밋, `No Findings`, 품질 게이트, 롤백 기준, 외부 응답 기준선을 먼저 고정한다.
- 개발계와 운영계는 host, 도메인, API base URL, 배포 사용자, `nginx` root, GitHub Packages npm auth를 각각 확인한다.
- EC2에서 직접 `yarn install`/`yarn build`를 실행하면 설치 실행 OS 사용자 예: `ubuntu`, `deploy`, `root`의 user-level npm auth가 필요하다. `Manage Actions access`는 GitHub Actions 전용이며 SSH shell에는 적용되지 않는다.
- `yarn build`는 CRA production build이므로 `.env.development`가 아니라 build 시점의 production-mode 환경값이 번들에 고정된다. 개발계 빌드는 개발 API URL, 운영계 빌드는 운영 API URL을 바라보는지 업로드 전에 확인한다.
- 운영계에서는 `react-scripts start`, `yarn start`, `pm2` 기반 CRA 개발 서버 서빙을 금지한다. 개발계에서 임시로 개발 서버를 띄운 경우에도 운영 절차로 간주하지 않는다.

## 메인 흐름

1. 배포 시작 전 [배포/릴리즈 프로세스](../../policy/release-process.md)의 `No Findings`와 공통 품질 게이트 기준을 통과했는지 확인한다.
2. 로컬 또는 CI에서 `coupler-admin-web` 루트 기준으로 `yarn install`, `yarn build`를 실행해 `build/` 산출물을 만든다.
3. 운영 서버에서 직접 `yarn install` 또는 `yarn build`를 실행하는 임시/수동 배포라면, 먼저 설치를 실행하는 OS 사용자 예: `ubuntu`, `deploy`, `root`의 user-level npm 설정에 GitHub Packages 인증을 준비한다. GitHub Packages `Manage Actions access`는 GitHub Actions 전용이며 EC2 SSH shell에는 적용되지 않는다.

```bash
cd ~/coupler-admin-web
gh auth status -h github.com
gh auth refresh -h github.com -s read:packages
npm config set --location=user @coupler-developer:registry https://npm.pkg.github.com
npm config set --location=user //npm.pkg.github.com/:_authToken "$(gh auth token)"
yarn install --frozen-lockfile
```

`gh`를 사용할 수 없는 호스트에서는 승인된 GitHub 계정 또는 머신 계정의 `read:packages` token을 해당 사용자 홈의 npm 설정에만 저장한다. token 값을 repo `.npmrc`, shell history, 배포 로그에 남기지 않는다.

```bash
cd ~/coupler-admin-web
read -s GH_PACKAGES_TOKEN
npm config set --location=user @coupler-developer:registry https://npm.pkg.github.com
npm config set --location=user //npm.pkg.github.com/:_authToken "$GH_PACKAGES_TOKEN"
unset GH_PACKAGES_TOKEN
yarn install --frozen-lockfile
```

1. 운영 서버에서 최초 1회 또는 서버 재구성 시 아래를 준비한다.

```bash
sudo apt-get update
sudo apt-get install -y nginx
sudo mkdir -p /var/www/coupler-admin-web
sudo chown -R <deploy-user>:<deploy-user> /var/www/coupler-admin-web
```

1. 운영 서버가 외부 `https://cms.ritzy.fourhundred.co.kr`를 내부 `8000`으로 전달받는 현재 인프라 기준인지 확인한다. 이 가정이 바뀌면 아래 `nginx` 포트와 검증 절차도 함께 갱신한다.
2. 기존 정적 산출물 롤백 지점을 남기려면 업로드 전에 서버에서 현재 파일을 백업한다.

```bash
BACKUP_DIR="/var/www/coupler-admin-web-backup-$(date +%Y%m%d%H%M%S)"
sudo mkdir -p "${BACKUP_DIR}"
sudo rsync -a /var/www/coupler-admin-web/ "${BACKUP_DIR}/"
```

1. 로컬 또는 CI에서 `build/` 산출물을 운영 서버 `/var/www/coupler-admin-web/`로 업로드한다.

```bash
rsync -avz --delete ./build/ <deploy-user>@<server>:/var/www/coupler-admin-web/
```

1. 운영 서버의 `nginx` 사이트 설정 파일을 `/etc/nginx/sites-available/coupler-admin-web`에 아래 기준으로 작성한다.

```bash
sudo tee /etc/nginx/sites-available/coupler-admin-web >/dev/null <<'NGINX'
server {
    listen 8000 default_server;
    listen [::]:8000 default_server;
    server_name cms.ritzy.fourhundred.co.kr;

    root /var/www/coupler-admin-web;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
}
NGINX
```

1. 운영 서버에서 `default` 사이트를 제거하고 Admin 사이트를 활성화한다.

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/coupler-admin-web /etc/nginx/sites-enabled/coupler-admin-web
```

1. 과거 잘못된 운영 방식으로 등록된 `coupler-admin-web` PM2 앱이 있으면 삭제하고 저장 목록까지 동기화한다.

```bash
sudo /usr/bin/pm2 stop coupler-admin-web || true
sudo /usr/bin/pm2 delete coupler-admin-web || true
sudo /usr/bin/pm2 save || true
```

1. `nginx` 설정 검증 후 재시작한다.

```bash
sudo nginx -t
sudo systemctl restart nginx
```

1. 서버 내부 응답을 먼저 확인한다.

```bash
curl -I http://127.0.0.1:8000
```

1. 외부 도메인 응답을 확인한다.

```bash
curl -I https://cms.ritzy.fourhundred.co.kr
```

1. 브라우저에서 Admin 로그인 후 핵심 화면 1-2개를 열고, 콘솔에 `wss://cms.ritzy.fourhundred.co.kr:8000/ws` 같은 CRA 개발 서버 WebSocket 재연결 오류가 없는지 확인한다.

## 예외 흐름

- `rsync: mkdir ... Permission denied`가 발생하면 `/var/www/coupler-admin-web`가 없거나 소유권이 배포 사용자에게 없다는 뜻이다. `sudo mkdir -p /var/www/coupler-admin-web`와 `sudo chown -R <deploy-user>:<deploy-user> /var/www/coupler-admin-web`를 먼저 실행한다.
- `yarn install`이 `npm.pkg.github.com`에서 `401 Unauthorized`로 실패하면 설치를 실행한 OS 사용자의 user-level npm auth가 없거나 `read:packages` 권한이 없는 상태다. `sudo yarn install`은 `root`의 npm 설정을 사용하므로, 실제 설치 사용자와 인증 설정 사용자를 일치시킨다.
- `pm2 list`에 `coupler-admin-web`가 보이지 않는데 `8000` 포트에 Node 프로세스가 떠 있으면 다른 사용자(`root`)의 PM2일 수 있다. 이 경우 `sudo /usr/bin/pm2 list`와 `sudo /usr/bin/pm2 delete coupler-admin-web`를 사용한다.
- `nginx -t`가 실패하면 사이트 설정 수정 전까지 재시작하지 않는다.
- 외부 `https://cms.ritzy.fourhundred.co.kr` 응답이 `nginx`가 아니면 상위 프록시 또는 로드밸런서 구성을 먼저 확인한다.

## 비포함 / 금지

- 운영에서 `yarn start`, `react-scripts start`, `pm2 start ./node_modules/react-scripts/scripts/start.js`를 사용하지 않는다.
- `coupler-admin-web`를 프로세스 앱처럼 `pm2`로 상시 운영하지 않는다.
- 이 문서를 [배포/릴리즈 프로세스](../../policy/release-process.md)의 규범 기준 대신 사용하지 않는다.

## 롤백 흐름

1. 최근 정상 배포의 `build/` 백업 또는 이전 릴리즈 artifact를 확인한다.
2. 백업 산출물을 `/var/www/coupler-admin-web/`로 다시 복원한다.

```bash
sudo rsync -a --delete <backup-dir>/ /var/www/coupler-admin-web/
```

1. `sudo nginx -t`, `sudo systemctl restart nginx`를 다시 실행한다.
2. `curl -I http://127.0.0.1:8000`와 `curl -I https://cms.ritzy.fourhundred.co.kr`로 응답을 재확인한다.

## 관련 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [레포지토리 요약](../../architecture/repo-overview.md)
