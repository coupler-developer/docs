import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseReleaseStatus,
  validateReleaseStatusGate,
} from "./release-status-gate.mjs";

describe("release status gate", () => {
  it("allows released status when pending scope is explicitly N/A", () => {
    const statusSection = [
      "- 목표 버전: `v9.9.0`",
      "- 전체 상태: `released`",
      "- 완료 범위: API/Admin/Mobile 운영 반영 및 검증 완료",
      "- 대기 범위: N/A",
    ].join("\n");

    assert.equal(parseReleaseStatus(statusSection), "released");
    assert.deepEqual(
      validateReleaseStatusGate({
        context: "content/releases/v9.9.0.md",
        status: "released",
        statusSection,
      }),
      [],
    );
  });

  it("fails released status when pending scope has a value", () => {
    const statusSection = [
      "- 목표 버전: `v9.9.0`",
      "- 전체 상태: `released`",
      "- 완료 범위: API/Admin 배포 완료",
      "- 대기 범위: Store review 대기",
    ].join("\n");

    assert.deepEqual(
      validateReleaseStatusGate({
        context: "content/releases/v9.9.0.md",
        status: "released",
        statusSection,
      }),
      [
        "content/releases/v9.9.0.md: released 상태에는 대기 범위 값을 남길 수 없습니다",
      ],
    );
  });

  it("fails released status when another status field keeps incomplete signals", () => {
    const statusSection = [
      "- 목표 버전: `v9.9.0`",
      "- 전체 상태: `released`",
      "- 완료 범위: Mobile Store 심사 중",
      "- 대기 범위: N/A",
    ].join("\n");

    assert.deepEqual(
      validateReleaseStatusGate({
        context: "content/releases/v9.9.0.md",
        status: "released",
        statusSection,
      }),
      [
        "content/releases/v9.9.0.md: released 상태에는 미완료 신호를 남길 수 없습니다 (완료 범위: 심사 중)",
      ],
    );
  });

  it("fails released status when completed scope keeps a missing-tag placeholder", () => {
    const statusSection = [
      "- 목표 버전: `v9.9.0`",
      "- 전체 상태: `released`",
      "- 완료 범위: docs 태그 미생성",
      "- 대기 범위: N/A",
    ].join("\n");

    assert.deepEqual(
      validateReleaseStatusGate({
        context: "content/releases/v9.9.0.md",
        status: "released",
        statusSection,
      }),
      [
        "content/releases/v9.9.0.md: released 상태에는 미완료 신호를 남길 수 없습니다 (완료 범위: 미생성)",
      ],
    );
  });

  it("does not treat empty optional mirror fields as incomplete legacy evidence", () => {
    const statusSection = [
      "- 목표 버전: `v9.9.0`",
      "- 전체 상태: `released`",
      "- 완료 범위: docs 릴리스 기록 완료",
      "- 대기 범위: N/A",
      "- `coupler-mobile-app` 제출 마커 태그:",
      "- 제출 마커 증빙 이관/삭제:",
    ].join("\n");

    assert.deepEqual(
      validateReleaseStatusGate({
        context: "content/releases/v9.9.0.md",
        status: "released",
        statusSection,
      }),
      [],
    );
  });

  it("requires pending scope for in_progress status", () => {
    const statusSection = [
      "- 목표 버전: `v9.9.0`",
      "- 전체 상태: `in_progress`",
      "- 완료 범위: docs 기록 작성",
      "- 대기 범위: N/A",
    ].join("\n");

    assert.deepEqual(
      validateReleaseStatusGate({
        context: "content/releases/v9.9.0.md",
        status: "in_progress",
        statusSection,
      }),
      [
        "content/releases/v9.9.0.md: in_progress 상태에는 대기 범위를 명시해야 합니다",
      ],
    );
  });
});
