# 프로필 세트/인증 증빙 이미지 심사 구조 (최종)

## 목적

- 프로필 세트, 세트 이미지, 인증 증빙 이미지를 분리 저장해 정규화한다.
- 심사 판정 SoT는 단일 뷰(`v_member_review_status`)로 고정한다.
- API/Admin/Mobile은 동일 계약으로 읽고, 심사 판정은 서버/DB에서만 수행한다.

## 핵심 원칙

- 생애주기 상태 SoT: `t_member.status`
- 심사 판정 SoT: `v_member_review_status`
- 스냅샷 테이블(`t_member_review_stage_snapshot`)은 판정용이 아니라 표시/호환용이다.
- 앱/어드민은 판정 로직을 재구현하지 않고 서버 응답만 표시한다.

## 최종 저장 구조

### 1) 프로필 세트 원장

- 테이블: `t_member_profile_set`
- 주요 컬럼:
- `id`
- `member_id`
- `profile_set_version`
- `created_at`
- `review_status` (`0=PENDING`, `1=APPROVED`, `2=RETURN`, `3=REAPPLY`)
- `review_finalized_at`
- `profile_video_url`
- `profile_video_review_status`
- `profile_video_review_reason`

### 2) 프로필 세트 이미지

- 테이블: `t_member_profile_set_image`
- 주요 컬럼:
- `id`
- `profile_set_id`
- `image_position`
- `image_url`
- `review_status`
- `review_reason`
- `created_at`
- `review_finalized_at`

### 3) 인증 증빙 이미지

- 테이블: `t_member_auth_evidence_image`
- 주요 컬럼:
- `id`
- `member_auth_id`
- `evidence_position`
- `evidence_url`
- `review_status`
- `review_reason`
- `created_at`
- `review_finalized_at`

### 4) 현재 프로필 세트 포인터

- 테이블: `t_member`
- 컬럼: `profile_version_id`
- 의미: 현재 활성 프로필 세트(`t_member_profile_set.id`)를 가리키는 포인터

## API 계약 관점

- 응답은 `profile_set_current`, `profile_set_pending` 구조로 전달한다.
- 각 세트는 `version` + `images`로 구성한다.
- 버전/이미지/증빙의 `review_status`/`review_reason`은 서버가 최종 판정/기록한다.

## 운영 보정 (manager 이미지 webp)

manager 이미지 경로(`uploads/image/manager/*`)에 non-webp가 남아 있으면 아래를 실행한다.

```bash
# workspace root 기준
cd coupler-api
node -r ts-node/register/transpile-only scripts/migrate-manager-images-to-webp.ts --dry-run
node -r ts-node/register/transpile-only scripts/migrate-manager-images-to-webp.ts
```

검증:

```bash
mysql -h127.0.0.1 -P3306 -uroot -proot -D coupler -e "
SELECT
  SUM(CASE WHEN profile IS NOT NULL AND profile <> '' AND profile LIKE 'uploads/image/manager/%' AND LOWER(profile) NOT LIKE '%.webp' THEN 1 ELSE 0 END) AS profile_non_webp,
  SUM(CASE WHEN detail_profile IS NOT NULL AND detail_profile <> '' AND detail_profile LIKE 'uploads/image/manager/%' AND LOWER(detail_profile) NOT LIKE '%.webp' THEN 1 ELSE 0 END) AS detail_non_webp
FROM t_manager;
"
```

## 검증 체크리스트

1. `t_member_profile_set` 고아 행 0건

```sql
SELECT COUNT(*) AS orphan_profile_set
FROM t_member_profile_set ps
WHERE NOT EXISTS (
  SELECT 1 FROM t_member m WHERE m.id = ps.member_id
);
```

2. `t_member_profile_set_image` 고아 행 0건

```sql
SELECT COUNT(*) AS orphan_profile_set_image
FROM t_member_profile_set_image psi
WHERE NOT EXISTS (
  SELECT 1 FROM t_member_profile_set ps WHERE ps.id = psi.profile_set_id
);
```

3. `t_member_auth_evidence_image` 고아 행 0건

```sql
SELECT COUNT(*) AS orphan_auth_evidence
FROM t_member_auth_evidence_image aei
WHERE NOT EXISTS (
  SELECT 1 FROM t_member_auth a WHERE a.id = aei.member_auth_id
);
```

4. 반려 데이터 reason 누락 0건

```sql
SELECT
  (SELECT COUNT(*) FROM t_member_profile_set_image WHERE review_status = 2 AND (review_reason IS NULL OR review_reason = '')) AS profile_image_return_reason_missing,
  (SELECT COUNT(*) FROM t_member_profile_set WHERE profile_video_review_status = 2 AND (profile_video_review_reason IS NULL OR profile_video_review_reason = '')) AS profile_video_return_reason_missing,
  (SELECT COUNT(*) FROM t_member_auth_evidence_image WHERE review_status = 2 AND (review_reason IS NULL OR review_reason = '')) AS auth_evidence_return_reason_missing;
```

## 관련 문서

- [회원 심사 FSM](member-review-fsm.md)
- [회원 심사 3축 분리 정책](member-review-axis-policy.md)
- [업로드/미디어 시스템](upload-media-system.md)
- 최종 스키마 요약: `ritzy운영-coupler운영_마이그레이션_가이드/27_FINAL_SCHEMA_SUMMARY_AND_CONTRACT.md`
