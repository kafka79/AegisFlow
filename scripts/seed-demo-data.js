import { createEngine } from "../backend/engine.js";

const engine = createEngine({ memory: true });

const employees = [
  { id: "ODIAD20260001", name: "Priya Sharma", email: "priya@workforces.in", phone: "+91 98765 43210", role: "HR", department: "People Operations", manager: "", location: "Bangalore", dateOfJoining: "2024-06-01", wage: 85000, ptoDays: 20, sickDays: 12, dob: "1990-03-15", address: "Indiranagar, Bangalore", nationality: "Indian", gender: "Female", maritalStatus: "Married", bankName: "HDFC", accountNo: "XXXX1234", ifsc: "HDFC0001234", pan: "ABCDE1234F", uan: "IN123456789012", esic: "ESIC12345678" },
  { id: "ODIAD20260002", name: "Rahul Verma", email: "rahul@workforces.in", phone: "+91 87654 32109", role: "Employee", department: "Engineering", manager: "Priya Sharma", location: "Bangalore", dateOfJoining: "2024-08-15", wage: 65000, ptoDays: 18, sickDays: 10, dob: "1992-07-22", address: "Koramangala, Bangalore", nationality: "Indian", gender: "Male", maritalStatus: "Single", bankName: "ICICI", accountNo: "XXXX5678", ifsc: "ICIC0005678", pan: "FGHIJ5678K", uan: "IN987654321098", esic: "ESIC87654321" },
  { id: "ODIAD20260003", name: "Ananya Patel", email: "ananya@workforces.in", phone: "+91 76543 21098", role: "Employee", department: "Engineering", manager: "Priya Sharma", location: "Bangalore", dateOfJoining: "2025-01-10", wage: 58000, ptoDays: 18, sickDays: 10, dob: "1994-11-03", address: "HSR Layout, Bangalore", nationality: "Indian", gender: "Female", maritalStatus: "Single", bankName: "Axis", accountNo: "XXXX9012", ifsc: "AXIS0009012", pan: "KLMNO9012P", uan: "IN543210987654", esic: "ESIC54321098" }
];

async function seed() {
  await engine.init();

  for (const emp of employees) {
    try {
      const result = await engine.registerUser(emp, "Password123!");
      console.log(`Created user: ${emp.name} (${result.employee.id})`);
    } catch (err) {
      console.error(`Failed to create ${emp.name}:`, err.message);
    }
  }

  const all = engine.store.getAll("employees");
  console.log(`\nSeeded ${all.length} employees.`);
  console.log("Demo credentials:");
  console.log("  HR:        priya@workforces.in / Password123!");
  console.log("  Employee:  rahul@workforces.in  / Password123!");
  console.log("  Employee:  ananya@workforces.in / Password123!");
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
