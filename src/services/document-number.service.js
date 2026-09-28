export function formatDocumentDateTime(value, timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

export function maxDocumentSequence(numbers = []) {
  return numbers.reduce((maximum, number) => Math.max(maximum, Number(String(number).match(/-(\d+)$/)?.[1] || 0)), 0);
}

export async function nextDocumentNumber({ Counter, prefix, value = new Date(), session, minimumSequence = 0 }) {
  const normalizedPrefix = String(prefix || "DOC").trim().toUpperCase();
  const dateTime = formatDocumentDateTime(value);
  const key = `${normalizedPrefix}:GLOBAL`;
  await Counter.findOneAndUpdate({ key }, { $max:{ sequence:Number(minimumSequence) || 0 } }, { returnDocument:"after", upsert:true, setDefaultsOnInsert:true, session });
  const counter = await Counter.findOneAndUpdate({ key }, { $inc:{ sequence:1 } }, { returnDocument:"after", session });
  return `${normalizedPrefix}-${dateTime}-${String(counter.sequence).padStart(3,"0")}`;
}
export async function nextInvoiceNumber({ Counter, prefix = "INV", value = new Date(), session, isNumberUsed = async () => false }) {
  const series = String(prefix).trim().toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/.test(series)) throw new Error("Invoice series must contain 1 to 3 letters or digits");
  const key = `INVOICE:TIMESTAMP:${series}`;
  const dateTime = formatDocumentDateTime(value);
  // Skip a used number if an owner resets twice in the same second.
  for (let attempt = 0; attempt < 100; attempt++) {
    const counter = await Counter.findOneAndUpdate({ key }, { $inc: { sequence: 1 } }, { returnDocument: "after", upsert: true, setDefaultsOnInsert: true, session });
    if (!Number.isSafeInteger(counter.sequence) || counter.sequence < 1) throw new Error("Invalid invoice sequence");
    const number = `${series}-${dateTime}-${String(counter.sequence).padStart(3, "0")}`;
    if (!await isNumberUsed(number)) return number;
  }
  throw new Error("Unable to allocate an unused invoice number. Try again.");
}
