import {connectDb} from "@/lib/db";import {ok,apiError} from "@/lib/api";import {User} from "@/models";
export async function GET(){try{await connectDb();return ok({needsBootstrap:(await User.countDocuments())===0});}catch(e){return apiError(e);}}
