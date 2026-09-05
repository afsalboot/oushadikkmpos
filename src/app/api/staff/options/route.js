import { connectDb } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, apiError } from "@/lib/api";
import { User } from "@/models";

export async function GET(){try{await requireSession("expenses");await connectDb();return ok(await User.find({active:true,role:"STAFF"}).select("name email role active").sort({name:1}).lean());}catch(error){return apiError(error);}}
