# 레포지토리 요약

- **`coupler-admin-web`**: CRA 기반 어드민 프론트엔드. `npm start`(포트 8000)로 개발 서버를 띄우며 MobX 상태 관리와 Chart.js, DataTables 등을 활용해 운영 지표와 회원 관리 UI를 제공합니다.
- **`coupler-api`**: Express + MySQL 백엔드. `app.js` 진입점에서 REST API와 다국어(i18n)/Firebase Admin 연동을 제공하며, README에 정리된 다수의 cron 엔드포인트로 매칭·알림·정리 작업을 자동화합니다.
- **`coupler-mobile-app`**: React Native 클라이언트. CodePush 스크립트로 스테이징/프로덕션 배포를 지원하고 Agora, Notifee, Kakao 연동 등 다양한 네이티브 모듈을 포함합니다. README에 명시된 iOS/Android별 빌드 패치가 필요합니다.

