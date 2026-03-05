# 레포지토리 요약

- **`coupler-admin-web`**: CRA 기반 어드민 프론트엔드. `npm start`(포트 8000)로 개발 서버를 띄우며 MobX 상태 관리와 Chart.js, DataTables 등을 활용해 운영 지표와 회원 관리 UI를 제공합니다.
- **`coupler-api`**: Express + MySQL + TypeScript 백엔드. `app.ts` 진입점에서 REST API, i18n, Firebase Admin 연동을 제공하며, 도메인 로직은 controller와 lib/usecase 계층에 분산되어 있고 응답 경계는 DTO 기반으로 관리합니다. 심사 상태 판정은 `v_member_review_status` 단일 기준을 사용하며 cron/알림 자동화를 운영합니다.
- **`coupler-mobile-app`**: React Native 클라이언트. NextPush(CodePush) OTA 업데이트를 사용하며 `Staging`/`Production`은 "서버 환경"이 아니라 **배포 채널 이름**입니다. Agora, Notifee, Kakao 연동 등 다양한 네이티브 모듈을 포함하며 README에 명시된 iOS/Android별 빌드 패치가 필요합니다.
