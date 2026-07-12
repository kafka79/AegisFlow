/**
 * Field-level merge for offline sync conflicts.
 * Uses per-field logical clocks (fieldClocks) plus merged vector clocks.
 */

const MERGE_META_KEYS = new Set(["vectorClock", "lastModified", "id", "fieldClocks", "employeeId"]);

export function mergeVectorClocks(local, remote) {
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
        const clientStr = JSON.stringify(clientVal);
        const serverStr = JSON.stringify(serverVal);
        merged[key] = clientStr > serverStr ? clientVal : serverVal;
      }
      merged.fieldClocks = merged.fieldClocks || {};
      merged.fieldClocks[key] = Math.max(clientFieldClock, serverFieldClock) + 1;
    } else {
      merged.fieldClocks = merged.fieldClocks || {};
      merged.fieldClocks[key] = Math.max(clientFieldClock, serverFieldClock);
    }
  }

  merged.vectorClock = mergeVectorClocks(clientData?.vectorClock || {}, serverData?.vectorClock || {});
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
