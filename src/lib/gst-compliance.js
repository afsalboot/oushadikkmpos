import {GST_STATES} from './gst-states.js';
export const GST_RULE_VERSION='2026-09-10';
export const validState=value=>GST_STATES.some(([code])=>code===String(value));
export const usesUtgst=code=>['04','26','31','35','38','97'].includes(String(code));
export function gstinError(value,state){
  const gstin=String(value||'').trim().toUpperCase();
  if(!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))return 'Enter a valid 15-character GSTIN';
  if(!validState(gstin.slice(0,2)))return 'GSTIN has an invalid state code';
  if(state&&gstin.slice(0,2)!==String(state))return 'GSTIN state does not match the selected state';
  const chars='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';let sum=0;
  for(let i=0;i<14;i++){const product=chars.indexOf(gstin[i])*(i%2?2:1);sum+=Math.floor(product/36)+product%36;}
  return chars[(36-sum%36)%36]!==gstin[14]?'GSTIN checksum is invalid':'';
}
export function financialYear(value=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).formatToParts(new Date(value));
  const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value),start=month<4?year-1:year;
  return `${start}-${String(start+1).slice(-2)}`;
}
export const registrationStatus=settings=>settings?.gst?.registrationStatus||'UNREGISTERED';
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function registrationErrors(settings,date=new Date()){
  const gst=settings?.gst||{},store=settings?.store||{},status=registrationStatus(settings),errors={};
  if(!['UNREGISTERED','REGULAR','COMPOSITION','INACTIVE'].includes(status))errors['gst.registrationStatus']='Select a registration status';
  if(gst.enabled&&status!=='REGULAR')errors['gst.enabled']='Only an active regular GST registration can collect output GST';
  if(status==='REGULAR'||status==='COMPOSITION'){
    const error=gstinError(store.gstin,store.stateCode);if(error)errors['store.gstin']=error;
    if(!String(store.legalName||'').trim())errors['store.legalName']='Registered legal name is required';
    if(!String(store.address||'').trim())errors['store.address']='Registered address is required';
    if(!validState(store.stateCode))errors['store.stateCode']='Select a valid registration state';
    if(!validDate(gst.effectiveFrom))errors['gst.effectiveFrom']='A valid registration effective date is required';
    else if(Date.parse(`${gst.effectiveFrom}T00:00:00+05:30`)>new Date(date).getTime())errors['gst.effectiveFrom']='Registration is not effective yet';
    if(gst.effectiveTo&&(!validDate(gst.effectiveTo)||gst.effectiveTo<gst.effectiveFrom))errors['gst.effectiveTo']='Enter a valid end date after registration starts';
    else if(gst.effectiveTo&&Date.parse(`${gst.effectiveTo}T23:59:59+05:30`)<new Date(date).getTime())errors['gst.effectiveTo']='Registration has expired';
    if(!String(gst.verificationReference||'').trim())errors['gst.verificationReference']='Record how the registration was verified; a checksum does not verify active status';
    for(const field of ['precedingYearTurnover','highestTurnover'])if(gst[field]===''||gst[field]==null||!Number.isFinite(Number(gst[field]))||Number(gst[field])<0)errors[`gst.${field}`]='Enter PAN-level aggregate turnover in rupees';
    if(Number(gst.highestTurnover)<Number(gst.precedingYearTurnover))errors['gst.highestTurnover']='Highest turnover cannot be below preceding-year turnover';
  }
  if(gst.enabled&&(gst.calculationMethod==='CART'||gst.allowProductSpecificRate===false||(gst.taxDetermination&&gst.taxDetermination!=='AUTOMATIC')))errors['gst.calculationMethod']='GST billing requires product rates and automatic place-of-supply determination';
  return errors;
}
export function assertRegistration(settings,date){
  const errors=registrationErrors(settings,date);if(Object.keys(errors).length)throw Object.assign(new Error(Object.values(errors)[0]),{status:422,details:errors});
  if(registrationStatus(settings)==='REGULAR'&&!settings.gst.enabled)throw new Error('Enable GST for the regular registration before billing');
  if(registrationStatus(settings)==='INACTIVE')throw new Error('Inactive registration requires review before issuing new documents');
}
// Ordinary domestic goods only: special supplies cannot silently use these rules.
export function resolveSupply(settings,customer,input={}){
  const status=registrationStatus(settings),supplier=settings?.store?.stateCode||'',mode=input.fulfilment||'COUNTER';
  if(!['COUNTER','DELIVERY'].includes(mode)||input.sez||input.export||input.reverseCharge||input.billToShipTo||input.service)throw new Error('This supply requires a specialist GST document workflow');
  const gstin=String(customer?.gstin||'').trim().toUpperCase(),recipientStatus=gstin?'REGISTERED':'UNREGISTERED';
  if(gstin&&gstinError(gstin,customer?.stateCode))throw new Error(gstinError(gstin,customer?.stateCode));
  const recipientState=String(customer?.stateCode||gstin.slice(0,2)||'');
  if(recipientState&&!validState(recipientState))throw new Error('Select a valid recipient state');
  if(status!=='UNREGISTERED'&&recipientState&&!String(customer?.billingAddress||customer?.address||'').trim()&&recipientStatus==='UNREGISTERED')throw new Error('Record the recipient address when using their state as place of supply');
  if(mode==='DELIVERY'&&(!validState(input.deliveryStateCode)||!String(input.deliveryAddress||'').trim()))throw new Error('Delivery address and state are required');
  const placeOfSupply=mode==='DELIVERY'?String(input.deliveryStateCode):recipientStatus==='UNREGISTERED'&&recipientState?recipientState:supplier;
  if(status==='COMPOSITION'&&placeOfSupply!==supplier)throw new Error('Interstate outward supplies are unavailable for composition billing');
  if(status!=='UNREGISTERED'&&!validState(placeOfSupply))throw new Error('Select a valid place of supply');
  return {fulfilment:mode,placeOfSupply,recipientStatus,recipientStateCode:recipientState,recipientName:customer?.businessName||customer?.name||'',billingAddress:customer?.billingAddress||customer?.address||'',deliveryAddress:mode==='DELIVERY'?String(input.deliveryAddress).trim():'',deliveryStateCode:mode==='DELIVERY'?String(input.deliveryStateCode):'',ruleBasis:mode==='DELIVERY'?gstin?'IGST_10_1_A':'IGST_10_1_CA':recipientStatus==='UNREGISTERED'?'IGST_10_1_CA':'IGST_10_1_C'};
}
export function validateFiscalLines(items,settings,supply,total){
  const status=registrationStatus(settings);if(status==='UNREGISTERED')return 'COMMERCIAL_INVOICE';
  if(status==='REGULAR'&&Number(settings.gst.highestTurnover)>50000000&&supply.recipientStatus==='REGISTERED')throw new Error('Use an IRP-enabled workflow for this potentially mandated e-invoice; POS cannot issue it without applicability review and IRN');
  if(status==='REGULAR'&&Number(settings.gst.highestTurnover)>5000000000)throw new Error('High-turnover B2C QR requirements need a supported invoicing workflow');
  if(supply.recipientStatus==='UNREGISTERED'&&total>=50000&&(!supply.recipientName||!supply.billingAddress||!validState(supply.recipientStateCode)))throw new Error('Recipient name, address and state are required for this invoice value');
  if(supply.recipientStatus==='REGISTERED'&&(!supply.recipientName||!supply.billingAddress))throw new Error('Registered recipient name and billing address are required');
  for(const item of items){
    if(item.kind==='MIX'||item.freeQuantity>0)throw new Error('Mixtures and free schemes need an approved specialist GST classification workflow');
    const digits=Number(settings.gst.precedingYearTurnover)>50000000?6:4;
    if(![4,6,8].includes(String(item.hsnCode||'').length)||String(item.hsnCode).length<digits||!/^\d+$/.test(item.hsnCode))throw new Error(`A classified HSN of ${digits===6?'6 or 8':'4, 6 or 8'} digits is required for ${item.name}`);
    if(item.useDefaultGstRate!==false&&item.taxable!==false&&!item.gstExempt)throw new Error(`Set an explicit verified GST rate for ${item.name}`);
  }
  if(status==='COMPOSITION'||items.every(i=>i.taxable===false||i.gstExempt))return 'BILL_OF_SUPPLY';
  if(supply.recipientStatus==='UNREGISTERED'&&items.some(i=>i.taxable===false||i.gstExempt))return 'INVOICE_CUM_BILL_OF_SUPPLY';
  return 'TAX_INVOICE';
}
