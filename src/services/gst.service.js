const amount=(value)=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const stateCode=(value)=>/^\d{2}$/.test(String(value||""))?String(value):"";

function gstContext(settings,placeOfSupply){
  const enabled=Boolean(settings?.gst?.enabled);
  const priceMode=String(settings?.gst?.priceMode).toUpperCase()==="EXCLUSIVE"?"EXCLUSIVE":"INCLUSIVE";
  const calculationMethod=String(settings?.gst?.calculationMethod).toUpperCase()==="CART"?"CART":"PRODUCT";
  const taxDetermination=String(settings?.gst?.taxDetermination||"AUTOMATIC").toUpperCase();
  const supplierState=stateCode(settings?.store?.stateCode||settings?.gst?.stateCode);
  const supplyState=stateCode(placeOfSupply)||supplierState;
  const interstate=enabled&&(taxDetermination==="INTERSTATE"||(taxDetermination!=="INTRASTATE"&&Boolean(supplierState&&supplyState&&supplierState!==supplyState)));
  return{enabled,priceMode,calculationMethod,taxDetermination,supplierState,supplyState,interstate,taxType:enabled?(interstate?"IGST":"CGST_SGST"):"NONE"};
}

function effectiveRate(line,settings,context){
  if(!context.enabled||line.taxable===false||line.gstExempt)return 0;
  if(context.calculationMethod==="CART")return Math.max(0,Number(settings?.gst?.cartRate??settings?.gst?.defaultRate)||0);
  const useDefault=line.useDefaultGstRate===undefined?line.gstRate===null||line.gstRate===undefined:line.useDefaultGstRate!==false;
  if(settings?.gst?.allowProductSpecificRate===false||useDefault)return Math.max(0,Number(settings?.gst?.defaultRate)||0);
  return Math.max(0,Number(line.gstRate??settings?.gst?.defaultRate)||0);
}

export function calculateLineGST(line,{settings,placeOfSupply,discount=0}={}){
  const context=gstContext(settings,placeOfSupply),requestedMode=String(line?.gstPriceMode||"STORE").toUpperCase(),priceMode=requestedMode==="INCLUSIVE"||requestedMode==="EXCLUSIVE"?requestedMode:context.priceMode,baseAmount=amount(Math.max(0,Number(line?.amount)||0)),discountAmount=amount(Math.min(baseAmount,Math.max(0,Number(discount)||0))),discountedAmount=amount(baseAmount-discountAmount),gstRate=effectiveRate(line||{},settings,context);
  const taxableAmount=context.enabled&&priceMode==="INCLUSIVE"&&gstRate?amount(discountedAmount/(1+gstRate/100)):discountedAmount;
  const totalGST=context.enabled?amount(priceMode==="INCLUSIVE"?discountedAmount-taxableAmount:taxableAmount*gstRate/100):0;
  const cgst=context.interstate?0:amount(totalGST/2),sgst=context.interstate?0:amount(totalGST-cgst),igst=context.interstate?totalGST:0;
  return{...line,amount:baseAmount,baseAmount,discount:discountAmount,taxableAmount,taxableValue:taxableAmount,gstRate,cgstRate:context.interstate?0:gstRate/2,sgstRate:context.interstate?0:gstRate/2,igstRate:context.interstate?gstRate:0,cgst,sgst,igst,totalGST,taxAmount:totalGST,finalAmount:amount(taxableAmount+totalGST),total:amount(taxableAmount+totalGST),priceIncludesTax:priceMode==="INCLUSIVE",gstPriceMode:requestedMode==="INCLUSIVE"||requestedMode==="EXCLUSIVE"?requestedMode:"STORE"};
}

export function calculateGstInvoice({lines=[],discount=0,settings,placeOfSupply}){
  const context=gstContext(settings,placeOfSupply),subtotal=amount(lines.reduce((sum,line)=>sum+Math.max(0,Number(line.amount)||0),0)),safeDiscount=amount(Math.min(subtotal,Math.max(0,Number(discount)||0)));
  let allocated=0;
  const calculated=lines.map((line,index)=>{const lineAmount=amount(Math.max(0,Number(line.amount)||0)),remaining=amount(Math.max(0,safeDiscount-allocated)),discountShare=index===lines.length-1?Math.min(lineAmount,remaining):Math.min(lineAmount,amount(subtotal?safeDiscount*lineAmount/subtotal:0));allocated=amount(allocated+discountShare);return calculateLineGST({...line,amount:lineAmount},{settings,placeOfSupply:context.supplyState,discount:discountShare});});
  const sum=(key)=>amount(calculated.reduce((total,line)=>total+Number(line[key]||0),0));
  return{subtotal,discount:safeDiscount,taxableSubtotal:sum("taxableAmount"),taxableAmount:sum("taxableAmount"),cgst:sum("cgst"),sgst:sum("sgst"),igst:sum("igst"),tax:sum("totalGST"),totalGST:sum("totalGST"),total:sum("finalAmount"),grandTotal:sum("finalAmount"),priceMode:context.priceMode,calculationMethod:context.calculationMethod,taxDetermination:context.taxDetermination,taxType:context.taxType,interstate:context.interstate,supplierState:context.supplierState,placeOfSupply:context.supplyState,lines:calculated};
}
