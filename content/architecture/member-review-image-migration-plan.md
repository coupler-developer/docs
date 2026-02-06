# 프로필 이미지/비디오/인증 이미지 심사 정규화 스키마 + 마이그레이션 플랜 최종본

## 목표/범위

- 프로필 이미지/비디오/인증 이미지 심사 데이터를 1NF~3NF 수준으로 정규화한다.
- 운영 DB에 마이그레이션 적용 후 즉시 전환한다(듀얼-라이트 없음).
- 과거 세트는 90일 보관 후 정리한다.


## 새 스키마(DDL)

```sql
-- 프로필 이미지 세트(버전)
CREATE TABLE `t_member_profile_version` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '아이디',
  `member` int NOT NULL COMMENT '회원아이디',
  `version_no` int NOT NULL COMMENT '프로필 이미지 세트 버전번호',
  `create_date` datetime NOT NULL COMMENT '생성날짜',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '세트 상태(0-심사대기,1-승인,2-반려,3-재심사요청)',
  `finalize_date` datetime DEFAULT NULL COMMENT '최종심사일자',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uq_member_version` (`member`,`version_no`),
  KEY `idx_member_create_date` (`member`,`create_date`),
  KEY `idx_status_finalize_date` (`status`,`finalize_date`),
  CONSTRAINT `fk_profile_version_member` FOREIGN KEY (`member`) REFERENCES `t_member` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC COMMENT='회원 프로필 이미지 세트 버전';

-- 프로필 이미지(세트 내 이미지)
CREATE TABLE `t_member_profile_image` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '아이디',
  `profile_version_id` int NOT NULL COMMENT '프로필 세트 아이디',
  `image_index` smallint unsigned NOT NULL COMMENT '이미지 순번',
  `image_url` varchar(500) COLLATE utf8mb4_general_ci NOT NULL COMMENT '이미지 URL',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '심사상태(0-심사대기,1-승인,2-반려,3-재심사요청)',
  `reason` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '반려사유',
  `create_date` datetime NOT NULL COMMENT '생성날짜',
  `finalize_date` datetime DEFAULT NULL COMMENT '최종심사일자',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uq_profile_version_index` (`profile_version_id`,`image_index`),
  KEY `idx_profile_version_status` (`profile_version_id`,`status`),
  CONSTRAINT `fk_profile_image_version` FOREIGN KEY (`profile_version_id`) REFERENCES `t_member_profile_version` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC COMMENT='회원 프로필 이미지';

-- 프로필 비디오 (profile_version 테이블에 컬럼 추가)
ALTER TABLE `t_member_profile_version`
  ADD COLUMN `video_url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '프로필 비디오 URL (여성 전용)' AFTER `finalize_date`,
  ADD COLUMN `video_status` tinyint DEFAULT NULL COMMENT '비디오 심사상태(0-심사대기,1-승인,2-반려,3-재심사요청)' AFTER `video_url`,
  ADD COLUMN `video_reason` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '비디오 반려사유' AFTER `video_status`;

-- 인증 이미지(인증 유형별 이미지)
CREATE TABLE `t_member_auth_image` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '아이디',
  `auth_id` int NOT NULL COMMENT '인증아이디',
  `image_index` smallint unsigned NOT NULL COMMENT '이미지 순번',
  `image_url` varchar(500) COLLATE utf8mb4_general_ci NOT NULL COMMENT '이미지 URL',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '심사상태(0-심사대기,1-승인,2-반려,3-재심사요청)',
  `reason` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '반려사유',
  `create_date` datetime NOT NULL COMMENT '생성날짜',
  `finalize_date` datetime DEFAULT NULL COMMENT '최종심사일자',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uq_auth_image` (`auth_id`,`image_index`),
  KEY `idx_auth_status` (`auth_id`,`status`),
  CONSTRAINT `fk_auth_image_auth` FOREIGN KEY (`auth_id`) REFERENCES `t_member_auth` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC COMMENT='회원 인증 이미지';

-- 현재 프로필 이미지 세트 포인터
-- ⚠️ FK constraint는 마이그레이션 완료 후 추가 (데이터 검증 이슈 방지)
ALTER TABLE `t_member`
  ADD COLUMN `profile_version_id` int DEFAULT NULL COMMENT '현재 프로필 이미지 세트 아이디',
  ADD KEY `idx_profile_version_member` (`profile_version_id`,`id`);
```

```shell
node scripts/migrate-review-images.js --dry-run  # 먼저 시뮬레이션
node scripts/migrate-review-images.js            # 실제 실행
```

## 데이터 이행 규칙

### 프로필 버전 (이미지 + 비디오)

**세트 생성 규칙:**

- 세트 번호(`version_no`): 회원별 1부터 순차 증가
- 세트 생성일(`create_date`):

  - 심사중 세트: `t_member_pending.create_date` 사용
  - 현재 세트: `COALESCE(t_member.signup_date, NOW())` 사용
- 세트 상태(`status`):

  - 심사중 세트: `t_member_pending.status` 매핑
  - 현재 세트: `NORMAL(1)` 설정
- 세트 최종심사일(`finalize_date`): 마이그레이션 시점에는 `NULL`, 이후 승인/반려 시 갱신


**프로필 이미지 마이그레이션:**

- `t_member.profile` (#구분자) → `t_member_profile_version` + `t_member_profile_image`
- **현재 세트**: `t_member.profile` 기준으로 생성
- **심사중 세트**: `t_member_pending (category='profile')` 기준으로 생성
- 이미지 상태 매핑:

  - 기본: 세트 상태(`PENDING/REAPPLY/RETURN`)를 일괄 적용
- `image_cancel` 존재 시 (세트 상태가 `RETURN`일 때):

  - `image_cancel` 포함 인덱스: `RETURN` (2) + `reason` 매핑
  - 나머지 인덱스: `PENDING` (0) + `reason` NULL
  - `reason` 문자열은 `#` 구분자로 이미지별로 나누어져 있어서, `image_cancel`/`image_index` 순서에 맞춰 각 이미지 행에 해당 분절만 저장하도록 처리해야 함


**프로필 비디오 마이그레이션:**

- `t_member.video` → `t_member_profile_version.video_url`
- **현재 세트**: `t_member.video` 기준으로 현재 세트에 포함
- **심사중 세트**: `t_member_pending (category='video')` 기준으로 심사중 세트에 포함
- 비디오 상태/사유 매핑:

  - pending.status → video_status
  - pending.reason → video_reason
- **주의**: 여성 전용 기능


**세트 상태 집계 규칙 (런타임 API):**

- 런타임에서 `lib/review-image.js:resolveAggregateStatus()` 함수가 이미지/비디오 상태를 집계하여 세트 상태 결정
- 마이그레이션 시에는 세트 상태를 `pending.status`(심사중) 또는 `NORMAL`(현재) 직접 설정


**포인터 설정:**

- `t_member.profile_version_id`: **현재 세트**의 `t_member_profile_version.id`로 설정


### 인증 이미지

- `t_member_auth.image` (#구분자) → `t_member_auth_image`
- 이미지 상태: `t_member_auth.status`를 일괄 적용
- `image_cancel` 존재 시 (상태가 `RETURN`일 때):

  - `image_cancel` 포함 인덱스: `RETURN` (2) + `reason` 매핑
  - 나머지 인덱스: `PENDING` (0) + `reason` NULL
  - `reason` 칼럼도 `#` 구분자로 이미지별 사유를 담고 있으므로, `image_index` 순서로 분해한 후 `image_cancel` 대상만 당일 reason을 채우고 나머지는 `NULL`로 남기는 방식이라고 명시해주면 구체적임


## FSM 연계 (회원 심사 상태 머신)

프로필 이미지 버전 시스템은 회원 심사 FSM(`member-review-fsm.md`)과 긴밀히 연계된다.

### 프로필 변경 심사 플로우

- **정회원** (`user.status=NORMAL` + `pending_stage=COMPLETE`)이 프로필 이미지 변경 제출
  → `pending_stage=PROFILE_CHANGE` 전환
  → 새 프로필 버전 생성 (`status=PENDING`, `version_no` 증가)
  → 관리자 심사 (`/admin/member/pending/save`)
  → 승인 시:

  - 새 버전 `status=NORMAL`로 변경
  - `t_member.profile_version_id` 업데이트
  - `pending_stage=COMPLETE` 복귀
    → 반려 시:

  - 새 버전 `status=RETURN`
  - `pending_stage=PROFILE_CHANGE` 유지 (재제출 대기)


### 신규 가입 심사 플로우

- **회원 전** (`user.status=PENDING` + `pending_stage=BASIC_INFO`)이 기본정보 제출
  → 프로필 이미지 포함 시 버전 생성 (`status=PENDING`, `version_no=1`)
  → 관리자 기본정보 심사 승인
  → `pending_stage=REQUIRED_AUTH` 전환
  → 최종 승인 시:

  - 프로필 버전 `status=NORMAL`
  - `user.status=NORMAL` + `pending_stage=COMPLETE`
  - `t_member.profile_version_id` 설정


### 상태 코드 매핑

| 이행 규칙                | FSM 개념                     | 코드 값 |
| ------------------------ | ---------------------------- | ------- |
| PENDING                  | 심사대기 (아이템 상태)       | 0       |
| NORMAL                   | 승인/완료 (아이템 상태)      | 1       |
| RETURN                   | 반려 (아이템 상태)           | 2       |
| REAPPLY                  | 재심사 요청 (아이템 상태)    | 3       |
| pending_status=EDIT_NEED | 반려 (회원 심사 상태)        | -       |
| pending_status=REAPPLY   | 재심사 요청 (회원 심사 상태) | -       |

**⚠️ 중요:**

- `pending_status` (회원 심사 상태)와 아이템 `status` (이미지/버전 상태)는 별개 체계
- 마이그레이션 스크립트는 `t_member_pending.status` 값을 그대로 사용 (매핑 없음)
- `t_member_pending.status`가 STATUS 상수 값(0=PENDING, 1=NORMAL, 2=RETURN, 3=REAPPLY)을 사용한다고 가정
- 만약 실제 DB에서 다른 값 체계를 사용한다면 스크립트 수정 필요


## 단계별 마이그레이션 플랜

### 1. 사전 준비

- 운영 DB 백업(필수).
- 배포 창구 설정(점검 모드 또는 쓰기 중단).


### 2. 스키마 추가

- 위 DDL 적용(신규 테이블 + `t_member.profile_version_id` 컬럼).


### 3. 백필(기존 데이터 이행)

- 프로필 이미지/비디오/인증 이미지를 신규 테이블로 이행.
- 이행 후 `t_member.profile_version_id` 설정.
- 이행 스크립트는 idempotent하게 구성(중복 방지).


### 4. 검증

- 마이그레이션 후 아래 검증 쿼리를 실행하여 데이터 무결성 확인.
- 모든 검증 통과 확인 후 다음 단계 진행.


### 5. 앱/서버 배포 및 즉시 전환

- 신규 테이블 기준으로 읽기/쓰기 전환.
- **강제 업데이트 필수**: 구버전 앱은 즉시 차단.
- 배포 순서:

  1. 스키마 추가 (신규 테이블 생성)
  2. 마이그레이션 실행 (신규 테이블 백필)
  3. 검증 완료 (아래 검증 쿼리 실행)
  4. API/Admin/App 동시 배포 (새 테이블 읽기/쓰기 전환)
  5. 최소 버전 체크 활성화 (구버전 앱 차단)
  6. 모바일 앱 강제 업데이트 공지
- API 응답 형식:

  ```json
  {
    "profile_set_current": {
      "version": {
        "id": 123,
        "member": 456,
        "version_no": 1,
        "status": 1,
        "create_date": "2026-01-30 12:00:00",
        "finalize_date": null,
        "video_url": "https://...",
        "video_status": 1,
        "video_reason": null
      },
      "images": [
        {
          "id": 789,
          "image_index": 1,
          "image_url": "https://...",
          "status": 1,
          "reason": "",
          "create_date": "2026-01-30 12:00:00",
          "finalize_date": null
        }
      ]
    },
    "profile_set_pending": {
      "version": { ... },
      "images": [ ... ]
    }
  }
  ```

### 6. 정리(Cron)

- 조건: `현재 세트 제외` + `최종상태(승인/반려)` + `t_member_profile_version.finalize_date <= NOW() - INTERVAL 90 DAY`
- 대상: `t_member_profile_version` 및 `t_member_profile_image` 삭제.


## 검증 쿼리

### 마이그레이션 직후 검증

**실행 시점**: Section 3 백필 완료 직후 (스크립트가 자동 실행)

```sql
-- 1. profile_version이 있는데 member.profile_version_id가 NULL인 경우 확인
SELECT COUNT(*) as orphan_versions
FROM t_member_profile_version pv
WHERE pv.status = 1  -- NORMAL
  AND NOT EXISTS (
    SELECT 1 FROM t_member M WHERE M.profile_version_id = pv.id
  );
-- 기대값: 0

-- 2. 고아 버전 확인 (회원이 없는 프로필 버전)
SELECT COUNT(*) FROM t_member_profile_version pv
WHERE NOT EXISTS (SELECT 1 FROM t_member WHERE id = pv.member);
-- 기대값: 0

-- 3. 고아 이미지 확인 (버전이 없는 프로필 이미지)
SELECT COUNT(*) FROM t_member_profile_image pi
WHERE NOT EXISTS (SELECT 1 FROM t_member_profile_version WHERE id = pi.profile_version_id);
-- 기대값: 0

-- 4. version_no 중복 확인
SELECT member, version_no, COUNT(*) AS cnt
FROM t_member_profile_version
GROUP BY member, version_no
HAVING cnt > 1;
-- 기대값: empty

-- 5. image_index 중복 확인
SELECT profile_version_id, image_index, COUNT(*) AS cnt
FROM t_member_profile_image
GROUP BY profile_version_id, image_index
HAVING cnt > 1;
-- 기대값: empty

-- 6. 이미지도 비디오도 없는 빈 버전 확인
SELECT pv.id, pv.member, pv.version_no,
  (SELECT COUNT(*) FROM t_member_profile_image WHERE profile_version_id = pv.id) as image_count,
  pv.video_url
FROM t_member_profile_version pv
WHERE (SELECT COUNT(*) FROM t_member_profile_image WHERE profile_version_id = pv.id) = 0
  AND (pv.video_url IS NULL OR pv.video_url = '')
LIMIT 10;
-- 기대값: empty (모든 버전은 최소 1개 이상의 이미지 또는 비디오를 가져야 함)

-- 7. 현재 세트 포인터 일관성 확인
SELECT COUNT(*) FROM t_member M
WHERE M.profile_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM t_member_profile_version pv
    WHERE pv.id = M.profile_version_id AND pv.member = M.id
  );
-- 기대값: 0

-- 8. 반려된 이미지/비디오에 reason 존재 확인
SELECT
  'profile_image' as type,
  COUNT(*) as cnt
FROM t_member_profile_image
WHERE status = 2 AND (reason IS NULL OR reason = '')
UNION ALL
SELECT
  'video' as type,
  COUNT(*) as cnt
FROM t_member_profile_version
WHERE video_status = 2 AND (video_reason IS NULL OR video_reason = '');
-- 기대값: 각 type별로 0

-- 9. 인증 이미지 마이그레이션 확인 (고아 확인)
SELECT COUNT(*) FROM t_member_auth_image ai
WHERE NOT EXISTS (SELECT 1 FROM t_member_auth WHERE id = ai.auth_id);
-- 기대값: 0

-- 9-1. 반려된 인증 이미지 reason 확인
SELECT COUNT(*) as cnt
FROM t_member_auth_image
WHERE status = 2 AND (reason IS NULL OR reason = '');
-- 기대값: 0

-- 10. pending_stage=PROFILE_CHANGE 연계 확인
SELECT COUNT(*) FROM t_member M
WHERE M.pending_stage = 'PROFILE_CHANGE'
  AND NOT EXISTS (
    SELECT 1 FROM t_member_profile_version pv
    WHERE pv.member = M.id AND pv.status <> 1 AND pv.id <> M.profile_version_id
  );
-- 기대값: 0 (PROFILE_CHANGE 상태면 반드시 심사중 버전이 있어야 함)

-- 11. Video 마이그레이션 확인
SELECT COUNT(*) as unmigrated_videos
FROM t_member
WHERE (video IS NOT NULL AND video != '')
  AND NOT EXISTS (
    SELECT 1 FROM t_member_profile_version pv
    WHERE pv.member = t_member.id AND pv.video_url = t_member.video
  );
-- 기대값: 0
```

## 롤백

듀얼-라이트가 없으므로 시나리오별로 롤백 전략을 달리한다.

### 시나리오 1: 마이그레이션 스크립트 실패 (백필 중 오류)

**증상**: 스크립트 실행 중 오류 발생, 일부 데이터만 이행됨

**조치**:

```sql
-- 1. 신규 테이블 데이터 삭제
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE t_member_profile_image;
TRUNCATE t_member_profile_version;
TRUNCATE t_member_auth_image;
SET FOREIGN_KEY_CHECKS=1;

-- 2. profile_version_id 초기화
UPDATE t_member SET profile_version_id = NULL;
```

**결과**: 기존 데이터 그대로 유지, 스크립트 수정 후 재시도 가능 (Idempotent 설계)

### 시나리오 2: API 배포 후 오류 발견

**증상**: 신규 API에서 간헐적 오류, 일부 기능 동작 안 함

**조치**:

1. 전체 DB 백업에서 롤백 (마이그레이션 이전 상태로 복원)
2. 이전 API 버전으로 재배포
3. 근본 원인 분석 후 재시도 계획


**결과**: 마이그레이션 이전 상태로 완전 복원, 재시도 일정 재수립

### 시나리오 3: 데이터 손상 발견 (최악의 경우)

**증상**: 회원 프로필 이미지 누락, 데이터 불일치 심각

**조치**:

1. 모든 서비스 즉시 중지 (점검 모드)
2. 사전 준비한 운영 DB 백업에서 전체 복원
3. 이전 앱/서버 버전으로 재배포
4. 사후 분석 및 재시도 일정 수립


**결과**: 마이그레이션 이전 상태로 완전 복원

### 재시도 전략

- 마이그레이션 스크립트는 **Idempotent** 설계
- `profile_version_id IS NOT NULL` 회원은 자동 스킵
- 이미 존재하는 버전은 `UNIQUE` 제약조건으로 중복 방지
- 실패 로그를 상세히 기록하여 재시도 시 참고
- 배치 크기 조정 가능 (`--batch-size` 옵션)


---

## 변경 이력

### 2026-01-30: Video 마이그레이션 추가

**변경 사항:**

1. **제목 및 범위 업데이트**

   - "프로필/인증 이미지" → "프로필 이미지/비디오/인증 이미지"
   - Video를 프로필 심사 항목에 명시적으로 포함

2. **스키마 업데이트**

   - `t_member_profile_version`에 video 관련 컬럼 추가:

     - `video_url`: 프로필 비디오 URL (여성 전용)
     - `video_status`: 비디오 심사 상태
     - `video_reason`: 비디오 반려 사유

3. **데이터 이행 규칙 업데이트**

   - 프로필 비디오 마이그레이션 규칙 추가
   - `t_member.video` + `t_member_pending (category='video')` → `profile_version.video_*`

4. **검증 쿼리 추가**

   - Video 마이그레이션 확인 (Query 11)

5. **레거시 컬럼 정리 방침**

   - `t_member_auth.image_cancel` 삭제
   - `t_member_pending (category='profile')` 삭제
   - `t_member_pending (category='video')` 삭제
   - **`t_member.video`는 유지** (하위 호환성)


**근거:**

- FSM 문서 Line 149: "프로필 배지 대상: `video`, `profile`"
- Video는 profile과 동일하게 심사 필요 (여성 전용)
- UI에서 video와 profile images를 같은 리스트로 표시 (`[video, ...images]`)
- 일관성: profile images와 동일한 버전 관리 필요


**마이그레이션 대상 최종 정리:**

| 항목           | 기존                  | 신규                                              |
| -------------- | --------------------- | ------------------------------------------------- |
| Profile Images | t_member.profile      | t_member_profile_version + t_member_profile_image |
| Auth Images    | t_member_auth.image   | t_member_auth_image                               |
| Video          | t_member.video (유지) | t_member_profile_version.video_*                  |
