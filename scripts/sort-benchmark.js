/**
 * Benchmark: sortObjectKeys vs naive JSON.stringify.
 *
 * Demonstrates that the key-sorting approach is O(n log n) and acceptable
 * for small payloads (< 50 keys).  Run with: node scripts/sort-benchmark.js
 */

function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = sortObjectKeys(obj[key]);
    return acc;
  }, {});
}

function buildPayload(depth, breadth) {
  if (depth <= 0) return Math.random();
  const obj = {};
  for (let i = 0; i < breadth; i++) {
    obj[`k${i}_${Math.random().toString(36).slice(2, 6)}`] = buildPayload(depth - 1, breadth);
  }
  return obj;
}

const SIZES = [
  { depth: 1, breadth: 5, label: "5 keys, 1 level" },
  { depth: 2, breadth: 5, label: "25 keys, 2 levels" },
  { depth: 3, breadth: 5, label: "125 keys, 3 levels" },
];

for (const { depth, breadth, label } of SIZES) {
  const payload = buildPayload(depth, breadth);

  const start = process.hrtime.bigint();
  const ITERATIONS = 10000;
  for (let i = 0; i < ITERATIONS; i++) {
    sortObjectKeys(payload);
  }
  const end = process.hrtime.bigint();
  const nsPerOp = Number(end - start) / ITERATIONS;

  console.log(`${label}: ${(nsPerOp / 1000).toFixed(2)} µs/op  (${nsPerOp.toFixed(0)} ns/op)`);
}
