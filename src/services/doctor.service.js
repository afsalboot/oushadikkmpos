import { Doctor, AuditLog } from "@/models";
import mongoose from "mongoose";
export async function saveDoctor(id, body, actor) {
  const name = String(body.name || "").trim(), qualification = String(body.qualification || "").trim(), fee = Number(body.consultationFee);
  if (!name || name.length > 120 || qualification.length > 120 || body.consultationFee === "" || !Number.isFinite(fee) || fee < 0 || fee > 99999999 || typeof body.active !== "boolean") throw Object.assign(new Error("Enter a doctor name, valid fee and status"), { status: 422 });
  if (id && !/^[a-f0-9]{24}$/i.test(id)) throw Object.assign(new Error("Invalid doctor"), { status: 422 });
  return mongoose.connection.transaction(async (session) => {
    const values = { name, qualification, consultationFee: Math.round(fee * 100) / 100, active: body.active };
    const row = id ? await Doctor.findByIdAndUpdate(id, { $set: values, $inc: { revision: 1 } }, { session, returnDocument: "after", runValidators: true }) : (await Doctor.create([values], { session }))[0];
    if (!row) throw Object.assign(new Error("Doctor not found"), { status: 404 });
    await AuditLog.create([{ actorId: actor.sub, action: id ? "DOCTOR_UPDATED" : "DOCTOR_CREATED", module: "doctor", targetType: "Doctor", targetId: row._id, description: `${id ? "Updated" : "Created"} doctor ${name}` }], { session });
    return row.toObject();
  });
}
