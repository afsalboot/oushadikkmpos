import {calculateGstInvoice} from "./gst.service.js";
import {money, sumMoney, multiplyMoney} from "../lib/money.js";

const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||0));
const discountConfig=(settings)=>settings?.discount||{};

export function calculateRoundOff(value,configuration="NEAREST_1",paymentMethod){
  const total=money(value),config=typeof configuration==="string"?{enabled:true,method:configuration}:configuration||{};
  if(config.enabled===false||String(config.paymentScope||"ALL").toUpperCase()==="NONE")return 0;
  if(String(config.paymentScope||"ALL").toUpperCase()==="CASH"&&String(paymentMethod||"").toUpperCase()!=="CASH")return 0;
  const legacy=String(config.method||"NEAREST_1").toUpperCase(),method=legacy==="UP"?"UP":legacy==="DOWN"?"DOWN":"NEAREST";
  const precision=(config.precision==="CUSTOM"?Number(config.customPrecision):Number(config.precision))||(legacy==="NEAREST_050"?.5:1);
  if(!(precision>0))return 0;
  const rounded=method==="UP"?Math.ceil(total/precision)*precision:method==="DOWN"?Math.floor(total/precision)*precision:Math.round((total+Number.EPSILON)/precision)*precision;
  const adjustment=money(rounded-total),maximum=Number(config.maxAdjustment);
  return Number.isFinite(maximum)&&maximum>=0&&Math.abs(adjustment)>maximum?0:adjustment;
}

function eligible(item,settings){
  const config=discountConfig(settings);
  if(item?.saleMode==="LOOSE"&&config.allowLooseItems===false)return false;
  if(item?.kind==="MIX"&&config.allowCustomMixItems===false)return false;
  if((Number(item?.discountAmount)||Number(item?.existingDiscount))>0&&config.allowAlreadyDiscounted===false)return false;
  if((item?.taxable===false||item?.gstExempt)&&config.allowTaxExempt===false)return false;
  return true;
}

const requestedAmount=(base,type,value)=>type==="PERCENTAGE"?multiplyMoney(base,Number(value||0)/100):money(value);

export function calculateDiscount({items=[],cartSubtotal,discount={},settings,currentUser={}}){
  const config=discountConfig(settings),subtotal=money(cartSubtotal??items.reduce((sum,item)=>sum+Number(item.amount??item.total??0),0)),errors=[];
  if(!config.enabled)return{itemDiscount:0,cartDiscount:0,automaticDiscount:0,totalDiscount:0,subtotalAfterDiscount:subtotal,approvalRequired:false,validationErrors:errors,lineDiscounts:items.map(()=>0)};
  const role=String(currentUser.role||"STAFF").toUpperCase();
  if(role==="STAFF"&&config.allowStaff===false)errors.push("Staff discounts are disabled in Settings.");
  if(role==="ADMIN"&&config.allowAdmin===false&&config.allowOwner===false)errors.push("Administrator discounts are disabled in Settings.");
  const lineDiscounts=items.map((item)=>{
    if(!eligible(item,settings))return 0;
    const base=money(item.amount??item.total),entry=item.discount||{},type=String(entry.type||"FIXED").toUpperCase(),value=Number(entry.value??item.discountValue??0);
    if(!value)return 0;if(config.itemLevel===false){errors.push("Item-level discounts are disabled in Settings.");return 0;}
    if(type==="PERCENTAGE"&&config.allowPercentage===false)errors.push("Percentage discounts are disabled in Settings.");
    if(type!=="PERCENTAGE"&&config.allowFixed===false)errors.push("Fixed discounts are disabled in Settings.");
    return clamp(requestedAmount(base,type,value),0,base);
  });
  const itemDiscount=money(lineDiscounts.reduce((sum,value)=>sum+value,0)),cartType=String(discount.type||"FIXED").toUpperCase(),cartValue=Number(discount.value||0),cartBase=money(subtotal-itemDiscount);
  let cartDiscount=0;
  if(cartValue){
    if(config.cartLevel===false)errors.push("Cart discounts are disabled in Settings.");
    else if(config.minimumPurchaseEnabled&&subtotal<Number(config.minimumPurchaseAmount||0))errors.push(`Minimum purchase of ₹${Number(config.minimumPurchaseAmount||0)} is required for a discount.`);
    else if(itemDiscount>0&&config.allowStacking===false)errors.push("This cart already contains item-level discounts.");
    else if(cartType==="PERCENTAGE"&&config.allowPercentage===false)errors.push("Percentage discounts are disabled in Settings.");
    else if(cartType!=="PERCENTAGE"&&config.allowFixed===false)errors.push("Fixed discounts are disabled in Settings.");
    else cartDiscount=clamp(requestedAmount(cartBase,cartType,cartValue),0,cartBase);
  }
  const maximumPercentage=Number(config.maxPercentage??config.maxStaffPercentage??100),maximumFixed=Number(config.maxFixedAmount);
  if(cartType==="PERCENTAGE"&&cartValue>maximumPercentage)errors.push(`Discount cannot exceed ${maximumPercentage}%.`);
  if(cartType!=="PERCENTAGE"&&Number.isFinite(maximumFixed)&&cartValue>maximumFixed)errors.push(`Discount cannot exceed ₹${maximumFixed}.`);
  let automaticDiscount=0;
  if(config.automaticEnabled&&subtotal>=Number(config.automaticAbove||0)&&!(config.preventAutomaticWithManual!==false&&(itemDiscount||cartDiscount)))automaticDiscount=clamp(subtotal*Number(config.automaticPercentage||0)/100,0,Number(config.automaticMaximum)||subtotal);
  let totalDiscount=money(itemDiscount+cartDiscount+automaticDiscount),saleLimit=config.totalLimitType==="PERCENTAGE"?subtotal*Number(config.totalLimitPercentage||0)/100:config.totalLimitType==="FIXED"?Number(config.totalLimitFixed||0):Infinity;
  if(Number.isFinite(saleLimit)&&totalDiscount>saleLimit)errors.push(`Total discount cannot exceed ₹${money(saleLimit)} for this sale.`);
  const combinedMaximum=Number(config.maximumCombinedPercentage);
  if(config.allowStacking&&Number.isFinite(combinedMaximum)&&subtotal&&totalDiscount/subtotal*100>combinedMaximum)errors.push(`Combined discount cannot exceed ${combinedMaximum}%.`);
  totalDiscount=clamp(totalDiscount,0,subtotal);
  const staffPercent=Number(config.staffMaxPercentage??config.maxStaffPercentage??0),staffFixed=Number(config.staffMaxFixed??0),approvalPercent=Number(config.approvalPercentage??0),approvalFixed=Number(config.approvalFixedAmount??0),effectivePercent=subtotal?totalDiscount/subtotal*100:0;
  const reason=String(discount.reason||"").trim(),reasonEntry=(config.reasons||[]).find(entry=>entry.active!==false&&entry.name===reason);
  if(config.requireReason&&totalDiscount>0&&!reason)errors.push("Select or enter a discount reason.");
  const approvalRequired=role==="STAFF"&&totalDiscount>0&&(effectivePercent>staffPercent||totalDiscount>staffFixed||effectivePercent>approvalPercent||totalDiscount>approvalFixed||reasonEntry?.requireApproval===true);
  return{itemDiscount,cartDiscount,automaticDiscount,totalDiscount,subtotalAfterDiscount:money(subtotal-totalDiscount),approvalRequired,allowedWithoutApproval:{percentage:staffPercent,fixed:staffFixed},validationErrors:[...new Set(errors)],lineDiscounts,discountType:cartType,discountValue:cartValue,reason};
}

export function calculateSalePricing({items=[],discount={},settings,currentUser,paymentMethod,placeOfSupply}){
  const subtotal=money(items.reduce((sum,item)=>sum+Number(item.amount??item.total??0),0)),discountSummary=calculateDiscount({items,cartSubtotal:subtotal,discount,settings,currentUser});
  const gst=calculateGstInvoice({lines:items,discount:sumMoney([discountSummary.cartDiscount,discountSummary.automaticDiscount]),lineDiscounts:discountSummary.lineDiscounts,discountEligible:items.map(item=>eligible(item,settings)),settings,placeOfSupply});
  discountSummary.totalDiscount=gst.discount;
  discountSummary.subtotalAfterDiscount=money(subtotal-gst.discount);
  const roundOff=settings?.roundOff?.enabled?calculateRoundOff(gst.total,settings.roundOff,paymentMethod):0,total=money(gst.total+roundOff);
  return{subtotal,...discountSummary,gst,beforeRoundOff:gst.total,roundOff,total,roundingSummary:{enabled:Boolean(settings?.roundOff?.enabled),beforeRoundOff:gst.total,roundOffAmount:roundOff,finalAmount:total,method:String(settings?.roundOff?.method||"NEAREST").toUpperCase(),precision:settings?.roundOff?.precision==="CUSTOM"?Number(settings?.roundOff?.customPrecision):Number(settings?.roundOff?.precision)||(settings?.roundOff?.method==="NEAREST_050"?.5:1),paymentScope:String(settings?.roundOff?.paymentScope||"ALL").toUpperCase()}};
}

export function calculateConfiguredDiscount({subtotal,type="FIXED",value=0,settings,currentUser={role:"ADMIN"}}){const result=calculateDiscount({cartSubtotal:subtotal,discount:{type,value},settings,currentUser});if(result.validationErrors.length)throw new Error(result.validationErrors[0]);return result.totalDiscount;}
export function calculateSaleTotal({subtotal,discount=0,settings,paymentMethod}){const safeSubtotal=money(Math.max(0,Number(subtotal)||0)),safeDiscount=settings?.discount?.enabled?clamp(discount,0,safeSubtotal):0,afterDiscount=money(safeSubtotal-safeDiscount),roundOff=settings?.roundOff?.enabled?calculateRoundOff(afterDiscount,settings.roundOff,paymentMethod):0;return{subtotal:safeSubtotal,discount:safeDiscount,roundOff,total:money(afterDiscount+roundOff)};}
