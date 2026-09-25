// Preserve decimal quantity/price precision until an amount is materialized.
function decimal(value) {
  const text=String(value??0).trim();
  if(!/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(text)||!Number.isFinite(Number(text)))throw new Error('Enter a finite decimal amount');
  const [mantissa,exponent='0']=text.toLowerCase().split('e'),places=(mantissa.split('.')[1]||'').length-Number(exponent),integer=BigInt(mantissa.replace('.',''));
  return places>0?[integer,10n**BigInt(places)]:[integer*10n**BigInt(-places),1n];
}
function rounded(n,d){const sign=n<0n?-1n:1n,a=n*sign;return sign*((a*2n+d)/(d*2n));}
function safe(value){const result=Number(value);if(!Number.isSafeInteger(result))throw new Error('Amount exceeds supported precision');return result;}
export function minor(value){const[n,d]=decimal(value);return safe(rounded(n*100n,d));}
export const money=value=>minor(value)/100;
export const sumMoney=values=>safe(values.reduce((sum,value)=>sum+BigInt(minor(value)),0n))/100;
export function multiplyMoney(a,b){const[an,ad]=decimal(a),[bn,bd]=decimal(b);return safe(rounded(an*bn*100n,ad*bd))/100;}
export function divideMoney(a,b){const[an,ad]=decimal(a),[bn,bd]=decimal(b);if(bn<=0n)throw new Error('Divisor must be positive');return safe(rounded(an*bd*100n,ad*bn))/100;}
export function percentageMoney(value,rate,{extractBase=false}={}) {
  const[n,d]=decimal(value),[r,rd]=decimal(rate);
  if(r<0n)throw new Error('Tax rate cannot be negative');
  return extractBase?safe(rounded(n*100n*rd*100n,d*(100n*rd+r)))/100:safe(rounded(n*r,d*rd))/100;
}
// Largest remainder conserves exactly the requested number of paise.
export function allocateMoney(total,weights){
  const units=weights.map(v=>BigInt(Math.max(0,minor(v)))),sum=units.reduce((a,b)=>a+b,0n),target=BigInt(Math.max(0,minor(total)));
  if(target>sum)throw new Error('Discount exceeds eligible value');if(!sum)return weights.map(()=>0);
  const allocated=units.map(v=>target*v/sum);let remaining=target-allocated.reduce((a,b)=>a+b,0n);
  const order=units.map((v,index)=>({index,remainder:target*v%sum})).sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
  for(const{index}of order){if(!remaining)break;if(allocated[index]<units[index]){allocated[index]++;remaining--;}}
  return allocated.map(v=>safe(v)/100);
}
