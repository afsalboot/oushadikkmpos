import {financialYear} from "../lib/gst-compliance.js";
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
export async function nextInvoiceNumber({Counter,prefix="INV",value=new Date(),session,registrationKey="UNREGISTERED"}){
  const series=String(prefix).trim().toUpperCase();
  if(!/^[A-Z0-9]{1,3}$/.test(series))throw new Error("Invoice series must contain 1 to 3 letters or digits");
  // The printed number is globally unique in Sale; changing registration must not reset it.
  const year=financialYear(value),key=`INVOICE:${year}:${series}`;
  if(!registrationKey)throw new Error("Registration scope is required");
  const counter=await Counter.findOneAndUpdate({key},{$inc:{sequence:1}},{returnDocument:"after",upsert:true,setDefaultsOnInsert:true,session});
  if(counter.sequence>999999)throw new Error("Invoice series is full; open a new series");
  return `${series}/${year.slice(2)}/${String(counter.sequence).padStart(6,"0")}`;
}
