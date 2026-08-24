import {
  activeReleaseStatuses,
  getRequiredRepoRefsForReleaseScopes,
  recordRepoName,
  releaseScopeDescriptors,
  serviceRepoNames,
  sortRepoNames,
} from "./release-schema.mjs";

export function createReleaseRecordModel(metadata) {
  const releaseScopes = new Set(
    Array.isArray(metadata?.releaseScopes) ? metadata.releaseScopes : [],
  );
  const extraRepoRefs = new Set(
    Array.isArray(metadata?.extraRepoRefs) ? metadata.extraRepoRefs : [],
  );
  const scopeResults = new Map(
    [...releaseScopes].map((scopeName) => [
      scopeName,
      metadata?.scopeResults?.[scopeName] ?? null,
    ]),
  );
  const requiredRepoRefs = getRequiredRepoRefsForReleaseScopes(releaseScopes);
  const preflightRepoNames = sortRepoNames([
    ...requiredRepoRefs,
    ...extraRepoRefs,
  ]);
  const activeReleaseScopes = new Set(
    [...scopeResults.entries()]
      .filter(([, result]) => activeReleaseStatuses.has(result?.status))
      .map(([scopeName]) => scopeName),
  );
  const activePreflightRepoNames = sortRepoNames([
    ...getRequiredRepoRefsForReleaseScopes(activeReleaseScopes),
    ...extraRepoRefs,
  ]);
  const serviceRepoRefs = new Set(
    [...preflightRepoNames].filter((repoName) => serviceRepoNames.includes(repoName)),
  );
  const releasedTagRepoNames = sortRepoNames(
    [...scopeResults.entries()]
      .filter(([, result]) => result?.status === "released")
      .map(([scopeName]) => releaseScopeDescriptors[scopeName]?.releaseTagRepo)
      .filter(Boolean),
  );

  return {
    recordRepoName,
    releaseScopes,
    activeReleaseScopes,
    scopeResults,
    extraRepoRefs,
    requiredRepoRefs,
    releasedTagRepoNames,
    serviceRepoRefs,
    preflightRepoNames,
    activePreflightRepoNames,
    requiresServiceWorkspace: serviceRepoRefs.size > 0,
  };
}
