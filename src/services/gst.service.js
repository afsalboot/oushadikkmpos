import {money as amount,minor,sumMoney,percentageMoney,allocateMoney} from '../lib/money.js';
import {validState,usesUtgst} from '../lib/gst-compliance.js';
function gstContext(settings,placeOfSupply){
  const enabled=Boolean(settings?.gst?.enabled)&&(!settings.gst.registrationStatus||settings.gst.registrationStatus==='REGULAR');
  const priceMode=settings?.gst?.priceMode==='EXCLUSIVE'?'EXCLUSIVE':'INCLUSIVE';
  const supplierState=String(settings?.store?.stateCode||settings?.gst?.stateCode||''),supplyState=String(placeOfSupply||supplierState);
  if(enabled&&(!validState(supplierState)||!validState(supplyState)))throw new Error('Valid supplier state and place of supply are required');
  const interstate=enabled&&supplierState!==supplyState,ut=enabled&&!interstate&&usesUtgst(supplierState);
  return {enabled,priceMode,calculationMethod:'PRODUCT',taxDetermination:'AUTOMATIC',supplierState,supplyState,interstate,ut,taxType:enabled?interstate?'IGST':ut?'CGST_UTGST':'CGST_SGST':'NONE'};
}
function effectiveRate(line,settings,context){
  if(!context.enabled||line.taxable===false||line.gstExempt)return 0;
  const rate=Number(line.useDefaultGstRate===true||line.gstRate==null?settings?.gst?.defaultRate:line.gstRate);
  if(!Number.isFinite(rate)||rate<0||rate>100)throw new Error('Invalid product GST rate');return rate;
}
export function calculateLineGST(line,{settings,placeOfSupply,discount=0}={}){
  const context=gstContext(settings,placeOfSupply),requestedMode=String(line?.gstPriceMode||'STORE').toUpperCase(),priceMode=['INCLUSIVE','EXCLUSIVE'].includes(requestedMode)?requestedMode:context.priceMode;
  const baseAmount=amount(Math.max(0,Number(line?.amount)||0)),discountAmount=amount(Math.min(baseAmount,Math.max(0,Number(discount)||0))),discountedAmount=amount(baseAmount-discountAmount),gstRate=effectiveRate(line||{},settings,context);
  const taxableAmount=context.enabled&&priceMode==='INCLUSIVE'&&gstRate?percentageMoney(discountedAmount,gstRate,{extractBase:true}):discountedAmount;
  const totalGST=context.enabled?priceMode==='INCLUSIVE'?amount(discountedAmount-taxableAmount):percentageMoney(taxableAmount,gstRate):0;
  const cgst=context.interstate?0:Math.floor(minor(totalGST)/2)/100,local=amount(totalGST-cgst),sgst=context.interstate||context.ut?0:local,utgst=context.ut?local:0,igst=context.interstate?totalGST:0;
  return {...line,amount:baseAmount,baseAmount,discount:discountAmount,taxableAmount,taxableValue:taxableAmount,gstRate,cgstRate:context.interstate?0:gstRate/2,sgstRate:context.interstate||context.ut?0:gstRate/2,utgstRate:context.ut?gstRate/2:0,igstRate:context.interstate?gstRate:0,cgst,sgst,utgst,igst,totalGST,taxAmount:totalGST,finalAmount:sumMoney([taxableAmount,totalGST]),total:sumMoney([taxableAmount,totalGST]),priceIncludesTax:priceMode==='INCLUSIVE',gstPriceMode:['INCLUSIVE','EXCLUSIVE'].includes(requestedMode)?requestedMode:'STORE'};
}
export function calculateGstInvoice({lines=[],discount=0,lineDiscounts=[],discountEligible,settings,placeOfSupply}){
  const context=gstContext(settings,placeOfSupply),bases=lines.map(line=>amount(Math.max(0,Number(line.amount)||0))),subtotal=sumMoney(bases);
  const fixed=bases.map((base,index)=>amount(Math.min(base,Math.max(0,Number(lineDiscounts[index])||0))));
  const weights=bases.map((base,index)=>discountEligible?.[index]===false?0:amount(base-fixed[index]));
  const cartDiscount=amount(Math.min(sumMoney(weights),Math.max(0,Number(discount)||0))),shares=allocateMoney(cartDiscount,weights);
  const calculated=lines.map((line,index)=>calculateLineGST({...line,amount:bases[index]},{settings,placeOfSupply:context.supplyState,discount:sumMoney([fixed[index],shares[index]])}));
  if(context.enabled&&!context.interstate){
    const target=Math.floor(minor(sumMoney(calculated.map(line=>line.totalGST)))/2);let remaining=target-calculated.reduce((sum,line)=>sum+minor(line.cgst),0);
    for(const line of calculated)if(remaining>0&&minor(line.totalGST)%2){line.cgst=amount(line.cgst+.01);line[context.ut?'utgst':'sgst']=amount(line[context.ut?'utgst':'sgst']-.01);remaining--;}
  }
  const sum=key=>sumMoney(calculated.map(line=>line[key]||0));
  return {subtotal,discount:sum('discount'),taxableSubtotal:sum('taxableAmount'),taxableAmount:sum('taxableAmount'),cgst:sum('cgst'),sgst:sum('sgst'),utgst:sum('utgst'),igst:sum('igst'),tax:sum('totalGST'),totalGST:sum('totalGST'),total:sum('finalAmount'),grandTotal:sum('finalAmount'),priceMode:context.priceMode,calculationMethod:context.calculationMethod,taxDetermination:context.taxDetermination,taxType:context.taxType,interstate:context.interstate,supplierState:context.supplierState,placeOfSupply:context.supplyState,lines:calculated};
}
