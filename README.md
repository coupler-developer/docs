# Coupler 개발 문서

## 개발환경 구성

1. 공용 워크스페이스 폴더를 만든다.
2. org에 있는 아래 4개 레포를 워크스페이스 하위 폴더로 `git clone` 한다.
   - coupler-api: <https://github.com/coupler-bluedotstudio/coupler-api>
   - coupler-admin-web: <https://github.com/coupler-bluedotstudio/coupler-admin-web>
   - coupler-mobile-app: <https://github.com/coupler-bluedotstudio/coupler-mobile-app>
   - docs: <https://github.com/coupler-bluedotstudio/docs>
3. 워크스페이스 루트에 `AGENTS.md`를 만들고 아래 내용을 넣는다.
4. IDE에서 워크스페이스 루트를 열고 작업한다(개별 레포 단독 오픈 금지).

```text
# AGENTS (워크스페이스 전용)

이 워크스페이스는 `docs/AGENTS.md`를 최우선으로 따른다.
항상 워크스페이스 루트를 열고 작업한다.
개별 레포지토리를 단독으로 열지 않는다.
```

## 문서 목록

### Architecture

- [회원 심사 FSM](architecture/member-review-fsm.md) - 회원 상태머신 및 심사 플로우
- [프로필 이미지 마이그레이션](architecture/member-review-image-migration-plan.md)

### Policy

- [Git 브랜치 전략](policy/git-branch-strategy.md) - 브랜치 명명 규칙
- [커밋 메시지 컨벤션](policy/commit-convention.md) - Conventional Commits 기반
- [로그 정책](policy/log-policy.md) - 개발/운영 로그 규칙
- [코드 리뷰 정책](policy/code-review-policy.md) - PR 작성 및 리뷰 가이드
- [TypeScript 전환 계획](policy/typescript-migration-plan.md)

### Flows

- [사용자 등록 플로우](flows/cross-project/user-registration-flow.md) - 회원가입 → 심사
- [사용자 인증 플로우](flows/coupler-mobile-app/user-authentication-flow.md) - 로그인
