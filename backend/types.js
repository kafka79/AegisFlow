/**
 * @typedef {Object} Employee
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} role
 * @property {string} [phone]
 * @property {Record<string, number>} [fieldClocks]
 * @property {Record<string, number>} [vectorClock]
 * @property {number} [lastModified]
 */

/**
 * @typedef {Object} SessionPayload
 * @property {string} employeeId
 * @property {string} role
 * @property {number} expiresAt
 * @property {string} csrfToken
 */

/**
 * @typedef {Object} SyncTransaction
 * @property {number|string} id
 * @property {'PUT'|'ADD'|'UPDATE'|'DELETE'} type
 * @property {string} store
 * @property {Record<string, unknown>} data
 */

export {};
