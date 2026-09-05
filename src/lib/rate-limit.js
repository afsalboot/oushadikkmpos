const buckets=globalThis.__oushadiRateLimitBuckets||(globalThis.__oushadiRateLimitBuckets=new Map());
const MAX_BUCKETS=10000;
let nextCleanupAt=0;

export function requestClientKey(request){
  if(process.env.TRUST_PROXY_HEADERS!=="true")return "shared";
  const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded||request.headers.get("cf-connecting-ip")||request.headers.get("x-real-ip")||"unknown";
}

export function consumeRateLimit(key,{limit,windowMs},now=Date.now()){
  if(now>=nextCleanupAt||buckets.size>=MAX_BUCKETS){
    for(const [id,bucket] of buckets)if(bucket.resetAt<=now)buckets.delete(id);
    nextCleanupAt=now+60000;
  }
  const current=buckets.get(key);
  if(!current||current.resetAt<=now){if(!current&&buckets.size>=MAX_BUCKETS)return{allowed:false,remaining:0,retryAfter:60};const next={count:1,resetAt:now+windowMs};buckets.set(key,next);return{allowed:true,remaining:limit-1,retryAfter:0};}
  current.count+=1;
  if(current.count>limit)return{allowed:false,remaining:0,retryAfter:Math.max(1,Math.ceil((current.resetAt-now)/1000))};
  return{allowed:true,remaining:limit-current.count,retryAfter:0};
}

export function clearRateLimits(){buckets.clear();nextCleanupAt=0;}
