import { SignJWT,jwtVerify } from "jose";
import { cookies } from "next/headers";
import {connectDb} from "@/lib/db";
import {User} from "@/models";
import {flattenPermissions,getEffectivePermissionObject} from "@/services/rbac.service";
import {getSettings} from "@/services/settings.service";
export const AUTH_COOKIE="oushadi_session";
const AUTH_ISSUER="oushadi-pos";
const AUTH_AUDIENCE="oushadi-workspace";
const secret=()=>{if(!process.env.JWT_SECRET)throw new Error("JWT_SECRET is not configured");return new TextEncoder().encode(process.env.JWT_SECRET);};
export async function createToken(user){
  const payload={
    sub:String(user._id),
    role:String(user.role),
    name:String(user.name),
    roleId:user.roleId?String(user.roleId._id||user.roleId):undefined,
    authVersion:Number(user.authVersion||0),
  };
  return new SignJWT(payload).setProtectedHeader({alg:"HS256"}).setIssuer(AUTH_ISSUER).setAudience(AUTH_AUDIENCE).setIssuedAt().setExpirationTime("12h").sign(secret());
}
export async function readSession(){const token=(await cookies()).get(AUTH_COOKIE)?.value;if(!token)return null;try{const payload=(await jwtVerify(token,secret(),{algorithms:["HS256"],issuer:AUTH_ISSUER,audience:AUTH_AUDIENCE})).payload;await connectDb();const user=await User.findOne({_id:payload.sub,active:true}).populate("roleId");if(!user||Number(payload.authVersion||0)!==Number(user.authVersion||0))return null;const settings=await getSettings(),timeoutMs=Number(settings.security?.sessionTimeoutMinutes||480)*60000,lastActive=user.lastActiveAt?new Date(user.lastActiveAt).getTime():Date.now();if(user.role==="STAFF"&&settings.security?.logoutInactiveStaff!==false&&Date.now()-lastActive>timeoutMs)return null;const effectivePermissions=getEffectivePermissionObject(user),permissions=flattenPermissions(effectivePermissions);if(!user.lastActiveAt||Date.now()-lastActive>300000)await User.updateOne({_id:user._id},{$set:{lastActiveAt:new Date()}});return{sub:String(user._id),name:user.name,role:user.role,roleId:user.roleId?String(user.roleId._id):null,roleName:user.role==="ADMIN"?"Owner":user.roleId?.name||"Staff",permissions,effectivePermissions,mustChangePassword:Boolean(user.mustChangePassword)};}catch{return null;}}
export async function requireSession(requirement){const session=await readSession();if(!session)throw new Error("UNAUTHORIZED");if(session.mustChangePassword&&requirement!=="auth.changePassword")throw new Error("PASSWORD_CHANGE_REQUIRED");if(!requirement||requirement==="auth.changePassword")return session;if(requirement==="ADMIN"){if(session.role!=="ADMIN")throw new Error("FORBIDDEN");return session;}const permission=requirement.includes(".")?requirement:`${requirement}.view`;if(session.role!=="ADMIN"&&!session.permissions.includes(permission))throw new Error("FORBIDDEN");return session;}
export const sessionCookie=(token)=>({name:AUTH_COOKIE,value:token,httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:43200});
