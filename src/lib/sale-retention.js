import {createHash} from 'node:crypto';
import {canonical,requestHash} from './fiscal-integrity.js';
import {minor, money, multiplyMoney} from './money.js';

export const SALE_RETENTION_DAYS=90;
export const RETENTION_VERSION=1;
export const RETAINED_BILL_MESSAGE='This bill is no longer available because detailed sales are retained for 90 days.';
export const retentionGone=()=>Object.assign(new Error(RETAINED_BILL_MESSAGE),{status:410});
export const retentionConflict=message=>Object.assign(new Error(message),{status:409});
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
export function saleBusinessDate(sale){
  const date=new Date(sale.invoiceDate ?? sale.createdAt);
  if(!Number.isFinite(date.getTime()))throw new Error('Sale business date is invalid');
  return date;
}
export const saleExpiry=sale=>new Date(saleBusinessDate(sale).getTime()+SALE_RETENTION_DAYS*86400000);
export const businessDay=sale=>dayFormatter.format(saleBusinessDate(sale));
export const invoiceIdentity=(storeId,number)=>createHash('sha256').update(JSON.stringify([String(storeId),String(number||'').trim().toUpperCase()])).digest('hex');
export function saleSourceHash(sale){
  const input={...(sale.toObject?.()||sale)};
  for(const key of ['retentionProcessed','retentionHash','retentionStoreId','expiresAt'])delete input[key];
  return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
}
const id=value=>value?value._id||value:null;
const pick=(source,keys)=>Object.fromEntries(keys.filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
const lineFields=['kind','name','saleMode','itemSource','quantity','baseQuantity','baseUnit','looseUnit','packageType','total','paidQuantity','freeQuantity','totalOutgoingQuantity','hsnCode','uqc','taxClassification','gstRate','gstExempt','taxable','taxableValue','cgst','sgst','utgst','igst','cess','totalTax','taxAmount'];
// Analytics facts, not an invoice copy: no invoice number, unit selling price,
// addresses/phone/GSTIN, references, receipt, allocations, discounts or raw input.
export function saleAnalyticsFacts(sale){
  const facts=pick(sale,['createdAt','invoiceDate','financialYear','documentType','documentStatus','saleType','customerType','subtotal','discount','taxableSubtotal','tax','cgst','sgst','utgst','igst','roundOff','consultationFee','total','amountPaid','balanceDue','paymentStatus','gstEnabled','taxType','placeOfSupply']);
  facts.customerId=id(sale.customerId);facts.actorId=id(sale.actorId);
  facts.customerIsB2B=Boolean(sale.customerSnapshot?.gstin);
  if(sale.registrationSnapshot)facts.registrationSnapshot=pick(sale.registrationSnapshot,['status']);
  facts.discountSummary={totalDiscount:sale.discountSummary?.totalDiscount??sale.discount??0,...(sale.discountSummary?.reason==='Wholesale discount'?{reason:'Wholesale discount'}:{})};
  facts.itemCount=sale.items?.length||0;
  facts.items=(sale.items||[]).map(item=>{
    const line={...pick(item,lineFields),productId:id(item.productId)};
    if(item.freeProductId)line.freeProductId=id(item.freeProductId);
    if(item.kind==='MIX'||item.saleMode==='MIX')line.ingredients=(item.ingredients||[]).map(ingredient=>({...pick(ingredient,['name','baseQuantity','baseUnit','total']),productId:id(ingredient.productId)}));
    if(item.itemSource==='external_purchase'){
      // Only analytic costs, without supplier names, reference or payment notes.
      line.purchaseCost=item.purchaseCost||0;
      if(item.externalPurchasePaymentMethod!==undefined)line.externalPurchasePaymentMethod=item.externalPurchasePaymentMethod;
    }
    return line;
  });
  // Preserve the original numeric inputs for existing dashboard calculations.
  // Account/report readers and the daily summary apply their existing cap.
  facts.payments=(sale.payments||[]).map(payment=>({method:payment.method||'CASH',amount:Number(payment.amount||0),paidAt:payment.paidAt||sale.createdAt}));
  return facts;
}
export function dailyContribution(facts){
  const included=facts.documentStatus!=='CANCELLED';
  const result={salesCount:included?1:0,grossSalesCents:included?minor(facts.subtotal??facts.total??0):0,netSalesCents:included?minor(facts.total||0):0,discountCents:included?minor(facts.discountSummary?.totalDiscount||0):0,taxCents:included?minor(facts.tax||0):0,refundCents:0,knownCostCents:0,unknownCostSales:0,paymentComponents:0,outstandingCents:included?minor(facts.balanceDue||0):0};
  if(included){
    let unknown=false;
    for(const item of facts.items){
      if(item.itemSource==='external_purchase'&&item.externalPurchasePaymentMethod)result.knownCostCents+=minor(multiplyMoney(item.quantity,item.purchaseCost));
      else unknown=true; // Existing inventory COGS is not reliably snapshotted.
    }
    result.unknownCostSales=unknown?1:0;
    let remaining=Math.max(0,Number(facts.total||0));
    for(const payment of facts.payments){const amount=money(Math.min(remaining,Math.max(0,Number(payment.amount||0))));if(!amount)continue;if(!/^[A-Z_]{1,20}$/.test(payment.method))throw new Error('Invalid historical payment method');const key='payment_'+payment.method+'_Cents';result[key]=(result[key]||0)+minor(amount);result.paymentComponents++;remaining=money(remaining-amount);}
  }
  return result;
}
export function productContributions(facts){
  const groups=new Map();
  if(facts.documentStatus==='CANCELLED')return [];
  for(const item of facts.items){
    const mixture=item.kind==='MIX'||item.saleMode==='MIX',lines=mixture?item.ingredients||[]:[item];
    for(const line of lines){
      const key=String(line.productId||line.name||'Product'),row=groups.get(key)||{productKey:key,productId:line.productId||null,name:line.name||'Product',unit:line.baseUnit||item.looseUnit||item.baseUnit||'',salesCount:1,packageQuantity:0,looseQuantity:0,mixQuantity:0,wholesalePaid:0,wholesaleFree:0,revenueCents:0};
      if(mixture)row.mixQuantity+=Number(line.baseQuantity||0);
      else if(item.saleMode==='PACKAGE')row.packageQuantity+=Number(line.quantity||0);
      else if(item.saleMode==='LOOSE')row.looseQuantity+=Number(line.baseQuantity||line.quantity||0);
      else if(item.saleMode==='WHOLESALE'){row.wholesalePaid+=Number(line.paidQuantity||0);row.wholesaleFree+=Number(line.freeQuantity||0);}
      row.revenueCents+=minor(line.total||0);groups.set(key,row);
    }
  }
  return [...groups.values()];
}
export function deltaMetrics(previous={},next={}){
  return Object.fromEntries([...new Set([...Object.keys(previous),...Object.keys(next)])].map(key=>[key,Number(next[key]||0)-Number(previous[key]||0)]));
}
export function sumMetrics(rows){const totals={};for(const row of rows)for(const [key,value]of Object.entries(row))totals[key]=(totals[key]||0)+Number(value);return totals;}
export const sameMetrics=(left={},right={})=>Object.keys(deltaMetrics(left,right)).every(key=>Math.abs(Number(left[key]||0)-Number(right[key]||0))<0.0000001);
export function sourceMatchesHistory(sale,ledger){
  if(!ledger||ledger.purgedAt||ledger.version!==RETENTION_VERSION||sale.retentionProcessed!==true||String(sale.retentionStoreId)!==ledger.storeId||ledger.sourceHash!==saleSourceHash(sale)||sale.retentionHash!==ledger.sourceHash||+new Date(sale.expiresAt)!==+saleExpiry(sale))return false;
  const facts=saleAnalyticsFacts(sale);
  return ledger.date===businessDay(sale)&&+new Date(ledger.saleDate)===+saleBusinessDate(sale)&&+new Date(ledger.expiresAt)===+saleExpiry(sale)&&requestHash(facts)===requestHash(ledger.facts)&&sameMetrics(dailyContribution(facts),ledger.metrics)&&requestHash(productContributions(facts))===requestHash(ledger.productMetrics);
}
export function retentionEligible(sale,ledger,now=new Date()){
  return Boolean(sourceMatchesHistory(sale,ledger)&&saleExpiry(sale)<now&&saleBusinessDate(sale)<now);
}
