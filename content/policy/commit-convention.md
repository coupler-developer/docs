# 커밋 메시지 컨벤션

## 기본 규칙

- [Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/) 준수
- 한글로 작성

## Prefix

| Prefix | 용도 |
| ------ | ---- |
| `feat:` | 새로운 기능 |
| `fix:` | 버그 수정 |
| `docs:` | 문서 수정 |
| `style:` | 코드 포맷팅 |
| `refactor:` | 코드 리팩토링 |
| `test:` | 테스트 코드 |
| `chore:` | 빌드 설정 등 |

## fix 브랜치의 경우

제목은 한 줄 요약으로 작성하고, 본문에는 **원인**과 **해결**을 명시합니다.

```markdown
fix: 회원가입 선호정보 예외 처리

- 원인: GlobalState.setting.best_favor 로드 전 find() 결과가 undefined라 .name 접근 시 오류 발생
- 해결: find() 결과가 없을 때 선택 안내 문구로 대체하고 널 가드 추가
```

여러 변경이 포함되면 항목별로 `원인:`/`해결:` 쌍을 나눠 적어 리뷰어가 흐름을 바로 파악할 수 있게 합니다.

## 그 외 브랜치

원인/해결 본문 강제 규칙은 적용하지 않습니다. 일반적인 Conventional Commits 규칙에 맞춰 제목만 작성하거나, 필요 시 간단한 본문을 추가합니다.
