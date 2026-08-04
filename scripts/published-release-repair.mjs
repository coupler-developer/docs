import { createHash } from "node:crypto";

export const publishedReleaseRepairAuthorization = Object.freeze({
  releasePath: "content/releases/v2.4.0.md",
  baseSha256: "49d41eece94fa12a95bc0fbc74ea1258b19e2d653b503916e928859d1e1ac029",
  repairedSha256: "3586827d93d5a9449e2b5e06a94bfb5e9d23b63a965fd4b7ee83c5d4f33f41ea",
});

export function isAuthorizedPublishedReleaseRepair({
  releasePath,
  baseSource,
  currentSource,
}) {
  return (
    releasePath === publishedReleaseRepairAuthorization.releasePath &&
    sha256Hex(baseSource) === publishedReleaseRepairAuthorization.baseSha256 &&
    sha256Hex(currentSource) === publishedReleaseRepairAuthorization.repairedSha256
  );
}

function sha256Hex(source) {
  if (typeof source !== "string" && !Buffer.isBuffer(source)) {
    return null;
  }
  return createHash("sha256").update(source).digest("hex");
}
