export const MERGE_META_KEYS = new Set([
  "vectorClock", "lastModified", "id", "fieldClocks", "employeeId"
]);

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

function mergeVectorClocks(local, remote) {
  const merged = { ...local };
  for (const [client, time] of Object.entries(remote || {})) {
    merged[client] = Math.max(merged[client] || 0, time);
  }
  return merged;
}

export function mergeFieldsWithFieldClocks(clientData, serverData) {
  const merged = { ...serverData };
  const clientKeys = new Set(Object.keys(clientData || {}));
  const serverKeys = new Set(Object.keys(serverData || {}));
  const allKeys = new Set([...clientKeys, ...serverKeys]);

  const clientFieldClocks = clientData?.fieldClocks || {};
  const serverFieldClocks = serverData?.fieldClocks || {};
  const clientVectorClock = clientData?.vectorClock || {};
  const serverVectorClock = serverData?.vectorClock || {};

  const allClientIds = new Set([...Object.keys(clientVectorClock), ...Object.keys(serverVectorClock)]);
  const tieBreakClientId = [...allClientIds].sort()[0] || "server";

  for (const key of allKeys) {
    if (MERGE_META_KEYS.has(key)) continue;

    const clientVal = clientData?.[key];
    const serverVal = serverData?.[key];
    const clientFieldClock = clientFieldClocks[key] || 0;
    const serverFieldClock = serverFieldClocks[key] || 0;

    if (clientKeys.has(key) && !serverKeys.has(key)) {
      merged[key] = clientVal;
      merged.fieldClocks = merged.fieldClocks || {};
      merged.fieldClocks[key] = clientFieldClock;
    } else if (!clientKeys.has(key) && serverKeys.has(key)) {
      merged[key] = serverVal;
      merged.fieldClocks = merged.fieldClocks || {};
      merged.fieldClocks[key] = serverFieldClock;
    } else if (clientVal !== serverVal) {
      if (clientFieldClock > serverFieldClock) {
        merged[key] = clientVal;
      } else if (serverFieldClock > clientFieldClock) {
        merged[key] = serverVal;
      } else {
        merged[key] = clientVal;
      }
      merged.fieldClocks = merged.fieldClocks || {};
      merged.fieldClocks[key] = Math.max(clientFieldClock, serverFieldClock) + 1;
    } else {
      merged.fieldClocks = merged.fieldClocks || {};
      merged.fieldClocks[key] = Math.max(clientFieldClock, serverFieldClock);
    }
  }

  merged.vectorClock = mergeVectorClocks(clientVectorClock, serverVectorClock);

  const mergedVectorClock = merged.vectorClock;
  const allClients = new Set([...Object.keys(mergedVectorClock), ...Object.keys(clientVectorClock), ...Object.keys(serverVectorClock)]);
  for (const client of allClients) {
    const localTime = mergedVectorClock[client] || 0;
    const clientTime = clientVectorClock[client] || 0;
    const serverTime = serverVectorClock[client] || 0;
    if (localTime < Math.max(clientTime, serverTime)) {
      mergedVectorClock[client] = Math.max(clientTime, serverTime) + 1;
    }
  }

  return merged;
}

export function addFieldClocks(data, vectorClock, clientId) {
  const time = vectorClock?.[clientId] || 1;
  data.fieldClocks = data.fieldClocks || {};
  for (const key of Object.keys(data)) {
    if (!MERGE_META_KEYS.has(key)) {
      data.fieldClocks[key] = data.fieldClocks[key] || time;
    }
  }
  return data;
}
