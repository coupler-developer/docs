# Git 브랜치 전략

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 기본 브랜치 구조

- **`main`** → 모든 기능/문서/버그/정리/리팩토링 브랜치가 PR로 합쳐지는 단일 기준 브랜치 (배포 및 태깅)
- **`develop`** → 빈 껍데기처럼 유지하는 임시 실험 브랜치 (필요 시만 사용, main 병합 금지)
- **`feature/*` · `docs/*` · `fix/*` · `chore/*` · `refactor/*`** → 작업 단위별 말단 브랜치
- **`release/*`** → `coupler-mobile-app` Store 제출 준비처럼 버전/빌드 번호를 고정해야 하는 단기 릴리즈 준비 브랜치

> 상시 유지하는 `release/*`, `hotfix/*` 브랜치는 없다.
> 모든 배포/패치는 **main에 병합한 뒤 태그(`v1.2.0`, `v1.2.1`)** 로 기록한다.
> `release/*`는 Mobile Store 제출 준비용 예외이며, 병합 후 삭제한다.

## 흐름 요약

```text
 feature/*   docs/*    fix/*    chore/*   refactor/*   release/*
     \          |        |         |            |          /
      \         |        |         |            |         /
       '--------> main ---------------------------------> (배포 + 태그)
                   ^
                 tag: v1.2.0 / v1.2.1

 develop (optional sandbox, not merged)
```

## 동작 원리

| 단계        | 작업                              | 브랜치 흐름               | 결과              |
| ----------- | --------------------------------- | ------------------------- | ----------------- |
| ① 작업 생성 | 기능/문서/버그/정리/리팩토링 단위로 브랜치 생성 | `main`에서 `feature/*` 등 | 개발 진행         |
| ② PR 생성   | 코드 리뷰 및 QA                   | `feature/*` 등 `→ main`   | 변경 승인         |
| ③ 병합/태그 | main 병합 후 버전 태그            | `main` + `tag v1.2.0`     | Release 표시      |
| ④ 긴급 수정 | 직접 수정 브랜치 생성 → main 병합 | `fix/* → main`            | `v1.2.x (Hotfix)` |
| ⑤ Mobile Store 제출 준비 | 모바일 버전/빌드 번호 고정        | `release/* → main`        | 제출 빌드 기준 고정 |

## 브랜치 이름 규칙

일반 말단 브랜치는 **타입/이름/주제** 형식으로 작성한다.

- `feature/박성빈/간편가입`
- `docs/김민식/브랜치전략`
- `fix/박성빈/핫픽스-로그인`
- `chore/김민식/2.0.0_릴리스_이후_정리`
- `refactor/김민식/회원가입_유스케이스_정리`

Mobile Store 제출 준비 브랜치는 `coupler-mobile-app`에서만 아래 형식을 사용한다.

- `release/김민식/2.2.0(97)-준비`

```text
release/{이름}/{타겟버전}({버전코드})-준비
```

- `{타겟버전}`은 Store에 제출할 `versionName`/`MARKETING_VERSION` 값이다.
- `{버전코드}`는 Android `versionCode`와 iOS `CURRENT_PROJECT_VERSION`에 함께 적용하는 공통 빌드 번호다.
- 쉘 명령에서 괄호가 포함된 브랜치명을 사용할 때는 브랜치명 전체를 작은따옴표로 감싼다.
- API/Admin/docs 릴리즈 준비에는 `release/*`를 쓰지 않는다.
- Store 제출 준비 외의 일반 작업에는 `feature/*`, `fix/*`, `chore/*`, `refactor/*`, `docs/*`를 사용한다.

## 관련 문서

- [커밋 메시지 컨벤션](commit-convention.md)
- [Git 동기화/Rebase 실행 정책](git-sync-rebase-policy.md)

## 주의사항

- 일반 작업 브랜치는 **타입/이름/주제** 형식을 준수한다.
- Mobile Store 제출 준비는 `release/{이름}/{타겟버전}({버전코드})-준비` 형식을 사용한다.
- PR 병합은 `Rebase and merge`만 사용한다.
- 작업 완료 후 병합된 브랜치는 삭제
- 정기적으로 main 브랜치와 동기화
