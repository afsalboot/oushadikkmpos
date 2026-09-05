import {AUTH_COOKIE} from "@/lib/auth";import {ok} from "@/lib/api";
export async function POST(){const response=ok({success:true});response.cookies.set({name:AUTH_COOKIE,value:"",path:"/",maxAge:0});return response;}
