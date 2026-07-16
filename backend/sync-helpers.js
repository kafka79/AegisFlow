/** @typedef {import('./types.js').Employee} Employee */
/** @typedef {import('./types.js').SessionPayload} SessionPayload */

export const MERGE_META_KEYS = new Set([
  "vectorClock", "lastModified", "id", "fieldClocks", "employeeId"
]);

/**
 * @param {Record<string, unknown>|null|undefined} clientData
 * @param {Record<string, unknown>|null|undefined} serverData
 */
export function recordsNeedMerge(clientData, serverData) {
  if (!serverData) return false;
  const keys = new Set([
    ...Object.keys(clientData || {}),
    ...Object.keys(serverData || {})
  ]);
  for (const key of keys) {
    if (MERGE_META_KEYS.has(key)) continue;
    if (clientData?.[key] !== serverData?.[key]) return true;
  }
  return false;
}

/**
 * True when two clients edited overlapping fields with independent field clocks.
 * @param {Record<string, unknown>|null|undefined} clientData
 * @param {Record<string, unknown>|null|undefined} serverData
 */
export function hasConcurrentFieldConflict(clientData, serverData) {
  if (!serverData) return false;
  const keys = new Set([
    ...Object.keys(clientData || {}),
    ...Object.keys(serverData || {})
  ]);
  for (const key of keys) {
    if (MERGE_META_KEYS.has(key)) continue;
    if (clientData?.[key] === serverData?.[key]) continue;
    const clientClock = clientData?.fieldClocks?.[key] || 0;
    const serverClock = serverData?.fieldClocks?.[key] || 0;
    if (clientClock > 0 && serverClock > 0) return true;
  }
  return false;
}
