# docs

개발정책문서

## 개발환경 구성

1. 공용 워크스페이스 폴더를 만든다.
2. org에 있는 아래 4개 레포를 워크스페이스 하위 폴더로 `git clone` 한다.
   - coupler-api: <https://github.com/coupler-bluedotstudio/coupler-api>
   - coupler-admin-web: <https://github.com/coupler-bluedotstudio/coupler-admin-web>
   - coupler-mobile-app: <https://github.com/coupler-bluedotstudio/coupler-mobile-app>
   - docs: <https://github.com/coupler-bluedotstudio/docs>
3. 워크스페이스 루트에 `AGENTS.md`를 만들고 아래 내용을 그대로 넣는다.
4. IDE에서 워크스페이스 루트를 열고 작업한다(개별 레포 단독 오픈 금지).

### AGENTS.md 내용

```text
# AGENTS (워크스페이스 전용)

이 워크스페이스는 `docs/AGENTS.md`를 최우선으로 따른다.
항상 워크스페이스 루트를 열고 작업한다.
개별 레포지토리를 단독으로 열지 않는다.
```
