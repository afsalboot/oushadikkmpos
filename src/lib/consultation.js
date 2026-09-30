export const CONSULTATION_BRANCH = "MAIN";
export const consultationTokenNumber = record => record.displayTokenNumber ?? record.tokenNumber;
export const consultationMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function consultationPatient(body) {
  const name = text(body.patient?.name, 120), phone = text(body.patient?.phone, 24);
  if (!name) throw new Error("Patient name is required");
  if (phone && !/^[0-9+ ()-]{7,24}$/.test(phone)) throw new Error("Enter a valid phone number");
  const age = body.patient?.age === "" || body.patient?.age == null ? undefined : Number(body.patient.age);
  if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > 130)) throw new Error("Age must be between 0 and 130");
  const gender = text(body.patient?.gender, 20);
  if (gender && !["Male", "Female", "Other"].includes(gender)) throw new Error("Select a valid gender");
  return { name, phone, age, gender };
}
export function consultationInput(body, doctor, settings, canOverride) {
  const patient = consultationPatient(body);
  const fee = body.consultationFee === "" || body.consultationFee == null ? doctor.consultationFee : Number(body.consultationFee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 99999999) throw new Error("Enter a valid consultation fee");
  if (!canOverride && consultationMoney(fee) !== consultationMoney(doctor.consultationFee)) throw new Error("You cannot override the doctor's fee");
  const paymentMethod = text(body.paymentMethod, 12);
  if (!settings.payments.enabledMethods.includes(paymentMethod)) throw new Error("Select an enabled payment method");
  const paymentReference = text(body.paymentReference, 120);
  if (fee > 0 && settings.payments[paymentMethod.toLowerCase()]?.requireReference && !paymentReference) throw new Error("Payment reference is required");
  return { patient, consultationFee: consultationMoney(fee), paymentMethod, paymentReference };
}
export function consultationSummary(rows) {
  const completed = rows.filter((row) => row.status === "COMPLETED");
  return { count: completed.length, collection: consultationMoney(completed.reduce((sum, row) => sum + Number(row.consultationFee || 0), 0)), cancelled: rows.length - completed.length };
}
