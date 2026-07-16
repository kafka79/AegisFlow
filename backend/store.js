import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { CRYPTO_CONFIG } from "../src/crypto.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "workforces.db");

const STORE_SCHEMAS = {
  users: `CREATE TABLE IF NOT EXISTS users (
    employeeId TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  )`,
  employees: `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL,
    department TEXT,
    manager TEXT,
    location TEXT,
    dateOfJoining TEXT,
    dob TEXT,
    address TEXT,
    nationality TEXT,
    gender TEXT,
    maritalStatus TEXT,
    status TEXT,
    wage REAL,
    bankName TEXT,
    accountNo TEXT,
    ifsc TEXT,
    pan TEXT,
    ptoDays INTEGER DEFAULT 30,
    sickDays INTEGER DEFAULT 15,
    avatar TEXT,
    vectorClock TEXT,
    fieldClocks TEXT,
    lastModified INTEGER
  )`,
  documents: `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    createdAt INTEGER NOT NULL
  )`,
  attendance: `CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL,
    date TEXT NOT NULL,
    checkIn TEXT,
    checkOut TEXT,
    workHours REAL,
    extraHours REAL,
    status TEXT,
    FOREIGN KEY (employeeId) REFERENCES employees(id)
  )`,
  timeoff: `CREATE TABLE IF NOT EXISTS timeoff (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL,
    employeeName TEXT,
    leaveType TEXT,
    startDate TEXT,
    endDate TEXT,
    days REAL,
    remarks TEXT,
    status TEXT,
    attachmentName TEXT,
    attachmentData TEXT,
    comment TEXT,
    FOREIGN KEY (employeeId) REFERENCES employees(id)
  )`,
  config: `CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`
};

const INITIAL_EMPLOYEES = [
  {
    id: "ODIAD20260001",
    name: "HR Admin",
    email: "admin@odoo.com",
    phone: "+91 98765 43210",
    role: "HR",
    department: "Human Resources",
    manager: "N/A",
    location: "Headquarters, India",
    dateOfJoining: "2026-01-01",
    dob: "1990-05-15",
    address: "123 Odoo Avenue, Tech Park, Mumbai",
    nationality: "Indian",
    gender: "Female",
    maritalStatus: "Single",
    status: "Present",
    wage: 150000,
    bankName: "State Bank of India",
    accountNo: "12345678901",
    ifsc: "SBIN0001234",
    pan: "ABCDE1234F",
    ptoDays: 30,
    sickDays: 15,
    avatar: "",
    vectorClock: "{}",
    fieldClocks: "{}",
    lastModified: Date.now()
  },
  {
    id: "ODIJD20260002",
    name: "John Doe",
    email: "john.doe@odoo.com",
    phone: "+91 98765 00002",
    role: "Employee",
    department: "Engineering",
    manager: "HR Admin",
    location: "Pune Office",
    dateOfJoining: "2026-03-15",
    dob: "1995-08-22",
    address: "Flat 402, Green Valley, Pune",
    nationality: "Indian",
    gender: "Male",
    maritalStatus: "Married",
    status: "Present",
    wage: 80000,
    bankName: "HDFC Bank",
    accountNo: "98765432101",
    ifsc: "HDFC0000123",
    pan: "FGHIJ5678K",
    ptoDays: 30,
    sickDays: 15,
    avatar: "",
    vectorClock: "{}",
    fieldClocks: "{}",
    lastModified: Date.now()
  },
  {
    id: "ODIAS20260003",
    name: "Alice Smith",
    email: "alice.smith@odoo.com",
    phone: "+91 98765 00003",
    role: "Employee",
    department: "Marketing",
    manager: "HR Admin",
    location: "Mumbai Office",
    dateOfJoining: "2026-04-01",
    dob: "1997-12-10",
    address: "7A Residency, Bandra, Mumbai",
    nationality: "Indian",
    gender: "Female",
    maritalStatus: "Single",
    status: "Leave",
    wage: 65000,
    bankName: "ICICI Bank",
    accountNo: "11223344556",
    ifsc: "ICIC0000567",
    pan: "LMNOP9012Q",
    ptoDays: 30,
    sickDays: 15,
    avatar: "",
    vectorClock: "{}",
    fieldClocks: "{}",
    lastModified: Date.now()
  }
];

const INITIAL_USERS = [
  { employeeId: "ODIAD20260001", email: "admin@odoo.com", role: "HR" },
  { employeeId: "ODIJD20260002", email: "john.doe@odoo.com", role: "Employee" },
  { employeeId: "ODIAS20260003", email: "alice.smith@odoo.com", role: "Employee" }
];

const DEFAULT_CONFIG = {
  hmac_keys: [],
  payroll_config: {
    pfCeiling: 15000,
    pfRate: 0.12,
    esiCeiling: 21000,
    esiEmployerRate: 0.0325,
    esiEmployeeRate: 0.0075,
    standardDeduction: 75000,
    professionalTaxSlabs: {
      maharashtra: [
        { limit: 7500, rate: 0 },
        { limit: 10000, rate: 175 },
        { limit: null, rate: 200, febRate: 250 }
      ],
      tamil_nadu: [
        { limit: 12000, rate: 0 },
        { limit: 21000, rate: 185 },
        { limit: 30000, rate: 195 },
        { limit: 45000, rate: 210 },
        { limit: 60000, rate: 235 },
        { limit: null, rate: 250 }
      ],
      telangana: [
        { limit: 15000, rate: 0 },
        { limit: 20000, rate: 150 },
        { limit: null, rate: 200 }
      ],
      delhi: [
        { limit: null, rate: 0 }
      ],
      default: [
        { limit: 15000, rate: 0 },
        { limit: null, rate: 200 }
      ]
    },
    tdsSlabs: [
      { limit: 300000, rate: 0, base: 0 },
      { limit: 600000, rate: 0.05, base: 0 },
      { limit: 900000, rate: 0.10, base: 15000 },
      { limit: 1200000, rate: 0.15, base: 45000 },
      { limit: 1500000, rate: 0.20, base: 90000 },
      { limit: null, rate: 0.30, base: 150000 }
    ]
  }
};

function serialize(v) {
  return v === undefined ? null : JSON.stringify(v);
}

function deserialize(v) {
  if (v === null || v === undefined) return undefined;
  try { return JSON.parse(v); } catch { return v; }
}

export function createStore(options = {}) {
  if (options.memory) {
    return new MemoryStore();
  }
  return new SqliteStore(options.filePath || DEFAULT_DB_PATH);
}

class MemoryStore {
  constructor() {
    this.data = {
      users: {},
      employees: {},
      documents: {},
      attendance: {},
      timeoff: {},
      config: {}
    };
  }

  async init() {}

  getKeyField(storeName) {
    return storeName === "users" ? "employeeId" : "id";
  }

  get(storeName, key) {
    return this.data[storeName]?.[key] ?? null;
  }

  getAll(storeName) {
    return Object.values(this.data[storeName] || {});
  }

  put(storeName, record) {
    const keyField = this.getKeyField(storeName);
    const key = record[keyField];
    if (!key) throw new Error("Missing key path field.");
    if (!this.data[storeName]) this.data[storeName] = {};
    this.data[storeName][key] = structuredClone(record);
  }

  delete(storeName, key) {
    if (this.data[storeName]) delete this.data[storeName][key];
  }

  getConfig(key) {
    return this.data.config?.[key]?.value ?? null;
  }

  setConfig(key, value) {
    if (!this.data.config) this.data.config = {};
    this.data.config[key] = { key, value };
  }

  clear() {
    this.data = {
      users: {},
      employees: {},
      documents: {},
      attendance: {},
      timeoff: {},
      config: {}
    };
  }
}

class SqliteStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
  }

  async init() {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    this.db = new Database(this.filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");

    for (const [, schema] of Object.entries(STORE_SCHEMAS)) {
      this.db.exec(schema);
    }

    await this.seedIfEmpty();
  }

  async seedIfEmpty() {
    const userCount = this.db.prepare("SELECT COUNT(*) as c FROM users").get().c;
    if (userCount > 0) return;

    const insertUser = this.db.prepare(`
      INSERT INTO users (employeeId, email, password, salt, role, createdAt)
      VALUES (@employeeId, @email, @password, @salt, @role, @createdAt)
    `);

    const insertEmp = this.db.prepare(`
      INSERT INTO employees (id, name, email, phone, role, department, manager, location,
        dateOfJoining, dob, address, nationality, gender, maritalStatus, status,
        wage, bankName, accountNo, ifsc, pan, ptoDays, sickDays, avatar,
        vectorClock, fieldClocks, lastModified)
      VALUES (@id, @name, @email, @phone, @role, @department, @manager, @location,
        @dateOfJoining, @dob, @address, @nationality, @gender, @maritalStatus, @status,
        @wage, @bankName, @accountNo, @ifsc, @pan, @ptoDays, @sickDays, @avatar,
        @vectorClock, @fieldClocks, @lastModified)
    `);

    const insertConfig = this.db.prepare(`
      INSERT INTO config (key, value) VALUES (@key, @value)
    `);

    const now = Date.now();
    const crypto = await import("node:crypto");

    const tx = this.db.transaction(() => {
      for (const u of INITIAL_USERS) {
        const salt = crypto.randomBytes(CRYPTO_CONFIG.SALT_LENGTH).toString("hex");
        const iterations = CRYPTO_CONFIG.PBKDF2_ITERATIONS;
        const keylen = CRYPTO_CONFIG.PBKDF2_KEY_LENGTH / 8;
        const digest = CRYPTO_CONFIG.PBKDF2_HASH.toLowerCase().replace("-", "");
        const derivedKey = crypto.pbkdf2Sync("Password123!", salt, iterations, keylen, digest);
        const passwordHash = derivedKey.toString("hex");

        insertUser.run({
          employeeId: u.employeeId,
          email: u.email,
          password: passwordHash,
          salt: salt,
          role: u.role,
          createdAt: now
        });
      }
      for (const e of INITIAL_EMPLOYEES) {
        insertEmp.run(e);
      }
      for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
        insertConfig.run({ key, value: JSON.stringify(value) });
      }
    });
    tx();
  }

  getKeyField(storeName) {
    return storeName === "users" ? "employeeId" : "id";
  }

  get(storeName, key) {
    const keyField = this.getKeyField(storeName);
    const row = this.db.prepare(`SELECT * FROM ${storeName} WHERE ${keyField} = ?`).get(key);
    if (!row) return null;
    return this.deserializeRow(storeName, row);
  }

  getAll(storeName) {
    const rows = this.db.prepare(`SELECT * FROM ${storeName}`).all();
    return rows.map(r => this.deserializeRow(storeName, r));
  }

  put(storeName, record) {
    const keyField = this.getKeyField(storeName);
    const key = record[keyField];
    if (!key) throw new Error("Missing key path field.");

    const validColumns = new Set();
    for (const line of STORE_SCHEMAS[storeName].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.toUpperCase().startsWith('CREATE') || trimmed.toUpperCase().startsWith('FOREIGN') || trimmed.startsWith(')')) continue;
      validColumns.add(trimmed.split(' ')[0]);
    }

    const safeKeys = Object.keys(record).filter(k => k !== keyField && validColumns.has(k));
    const cols = safeKeys.join(", ");
    const placeholders = safeKeys.map(k => `@${k}`).join(", ");
    const sql = cols 
      ? `INSERT OR REPLACE INTO ${storeName} (${keyField}, ${cols}) VALUES (@${keyField}, ${placeholders})`
      : `INSERT OR REPLACE INTO ${storeName} (${keyField}) VALUES (@${keyField})`;

    const stmt = this.db.prepare(sql);
    const params = { [keyField]: key };
    for (const k of safeKeys) {
      const v = record[k];
      params[k] = (k === "vectorClock" || k === "fieldClocks") ? serialize(v) : v;
    }
    stmt.run(params);
  }

  delete(storeName, key) {
    const keyField = this.getKeyField(storeName);
    this.db.prepare(`DELETE FROM ${storeName} WHERE ${keyField} = ?`).run(key);
  }

  getConfig(key) {
    const row = this.db.prepare("SELECT value FROM config WHERE key = ?").get(key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  }

  setConfig(key, value) {
    this.db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
  }

  async clear() {
    for (const storeName of Object.keys(STORE_SCHEMAS)) {
      this.db.prepare(`DELETE FROM ${storeName}`).run();
    }
  }

  deserializeRow(storeName, row) {
    const obj = { ...row };
    if (storeName === "employees") {
      obj.vectorClock = deserialize(obj.vectorClock);
      obj.fieldClocks = deserialize(obj.fieldClocks);
    }
    return obj;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
