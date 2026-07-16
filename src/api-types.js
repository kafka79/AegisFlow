/**
 * Shared HTTP API payload contracts (JSDoc + checkJs).
 * Import with: @typedef {import('./api-types.js').LoginResponse} LoginResponse
 */

/**
 * @typedef {Object} ApiError
 * @property {string} error
 */

/**
 * @typedef {Object} Employee
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {'HR'|'Employee'} role
 * @property {string} [phone]
 * @property {string} [department]
 * @property {Record<string, number>} [fieldClocks]
 * @property {Record<string, number>} [vectorClock]
 * @property {number} [lastModified]
 */

/**
 * @typedef {Object} LoginResponse
 * @property {string} token
 * @property {string} csrfToken
 * @property {Employee} employee
 */

/**
 * @typedef {Object} RegisterRequest
 * @property {Employee} employeeDetails
 * @property {string} password
 * @property {string} [token]
 * @property {string} [csrfToken]
 */

/**
 * @typedef {'PUT'|'ADD'|'UPDATE'|'DELETE'} SyncMutationType
 */

/**
 * @typedef {Object} SyncTransaction
 * @property {number|string} id
 * @property {SyncMutationType} type
 * @property {string} store
 * @property {Record<string, unknown>} data
 */

/**
 * @typedef {Object} SyncResultItem
 * @property {number|string} id
 * @property {'success'|'conflict'|'error'} status
 * @property {string} [error]
 */

/**
 * @typedef {Object} SyncResponse
 * @property {boolean} success
 * @property {number} conflicts
 * @property {SyncResultItem[]} results
 * @property {number} [timestamp]
 */

/**
 * @typedef {Object} TelemetryPayload
 * @property {number} timestamp
 * @property {string} message
 * @property {number} successCount
 * @property {number} failureCount
 * @property {number} conflictCount
 */

export {};
