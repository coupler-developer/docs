# Coupler 개발 정책 및 플로우 문서

이 저장소는 Coupler 프로젝트의 개발 정책 문서와 시스템 플로우를 Markdown 형식으로 관리합니다.

## 📁 디렉토리 구조

```
docs/
├── flows/                      # 시스템 플로우 문서
│   ├── coupler-mobile-app/    # Mobile App 플로우
│   ├── coupler-api/           # API 플로우
│   ├── coupler-admin-web/     # Admin Web 플로우
│   └── cross-project/         # 통합 플로우 (여러 시스템 포괄)
└── policies/                  # 개발 정책 문서
    ├── git-branch-strategy.md
    ├── code-review-policy.md
    └── ...
```

## 🚀 프로젝트 범위

이 문서는 다음 Coupler 프로젝트들을 포괄합니다:

- **coupler-mobile-app**: 모바일 애플리케이션
- **coupler-api**: 백엔드 API 서버
- **coupler-admin-web**: 관리자 웹 인터페이스

## 📋 문서 카테고리

### 1. Flows (플로우 문서)

각 프로젝트별 기능 플로우와 통합 플로우를 문서화합니다.

#### [Mobile App Flows](/flows/coupler-mobile-app/)
- 사용자 인증 플로우
- 데이터 동기화 플로우
- 푸시 알림 플로우
- UI/UX 플로우

#### [API Flows](/flows/coupler-api/)
- 인증/인가 플로우
- 데이터 CRUD 플로우
- 배치 처리 플로우
- 외부 서비스 연동

#### [Admin Web Flows](/flows/coupler-admin-web/)
- 사용자 관리 플로우
- 시스템 설정 플로우
- 데이터 모니터링 플로우
- 리포트 생성 플로우

#### [Cross-Project Flows](/flows/cross-project/)
- 시스템 간 통합 플로우
- End-to-end 비즈니스 플로우
- 데이터 동기화 플로우

### 2. Policies (개발 정책)

팀 전체가 따라야 할 개발 정책과 가이드라인을 문서화합니다.

- [Git 브랜치 전략](/policies/git-branch-strategy.md)
- [코드 리뷰 정책](/policies/code-review-policy.md)
- 코딩 스타일 가이드
- 보안 정책
- 배포 프로세스

## ✍️ 문서 작성 가이드

### 플로우 문서 템플릿

```markdown
# [플로우 제목]

## 개요
플로우에 대한 간단한 설명

## 참여 시스템 (통합 플로우의 경우)
- Mobile App
- API
- Admin Web

## 단계
1. 첫 번째 단계
2. 두 번째 단계
...

## 관련 컴포넌트/파일
- 파일 경로 및 설명

## API 연동 (해당하는 경우)
- API 엔드포인트 목록

## 주의사항
- 개발 시 주의해야 할 사항
```

### 정책 문서 템플릿

```markdown
# [정책 제목]

## 목적
정책의 목적과 필요성

## 적용 범위
어떤 프로젝트/팀에 적용되는지

## 세부 내용
정책의 구체적인 내용

## 예시
올바른/잘못된 예시

## 참고 자료
관련 문서나 링크
```

## 🤝 기여 가이드

1. 새로운 플로우나 정책 문서 추가 시 해당 디렉토리의 README에 목록 업데이트
2. 문서는 명확하고 이해하기 쉽게 작성
3. 코드 예시는 실제 사용 가능한 형태로 작성
4. 다이어그램이 필요한 경우 Mermaid 또는 이미지 사용

## 📝 문서 예시

- [사용자 인증 플로우 (Mobile App)](/flows/coupler-mobile-app/user-authentication-flow.md)
- [사용자 등록 및 인증 통합 플로우](/flows/cross-project/user-registration-flow.md)

## 🔄 문서 업데이트

- 시스템 변경 시 관련 플로우 문서 업데이트 필수
- 정책 변경 시 팀 전체에 공지 후 반영
- 정기적으로 문서의 유효성 검토

## 📞 문의

문서에 대한 질문이나 제안사항이 있으면 이슈를 생성해주세요.
