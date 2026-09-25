import {money, sumMoney, multiplyMoney, allocateMoney} from './money.js';
import {calculateLineGST} from '../services/gst.service.js';
export const purchaseMoney=money;
export function receivedPackageQuantity(item){return Number(item.packageQuantity||0)+Number(item.freeQuantity||0);}
export function calculatePurchaseTotals(items,{additionalCharges=0,discountType="FIXED",discountValue=0,additionalChargesGstRate=0,additionalChargesTaxType="NONE"}={}){
  const gross=items.map(item=>multiplyMoney(item.packageQuantity||0,item.unitCost||0)),subtotal=sumMoney(gross),charges=money(additionalCharges),value=money(discountValue);
  if(charges<0||value<0)throw new Error("Charges and discount cannot be negative");
  if(discountType==="PERCENTAGE"&&value>100)throw new Error("Percentage discount cannot exceed 100%");
  const discount=discountType==="PERCENTAGE"?multiplyMoney(subtotal,value/100):value;
  if(discount>subtotal)throw new Error("Discount cannot exceed the purchase item value");
  const discounts=allocateMoney(discount,gross);
  function taxLine(item,amount,discount){
    const rate=Number(item.gstRate||0),type=item.taxType||"NONE";
    if(rate>0&&!["CGST_SGST","CGST_UTGST","IGST"].includes(type))throw new Error("Select a supplier GST tax type for taxable purchase lines");
    const state=type==="CGST_UTGST"?"04":"32";
    const tax=calculateLineGST({amount,gstRate:rate,useDefaultGstRate:false,gstPriceMode:item.gstPriceMode||"INCLUSIVE"},{discount,settings:{store:{stateCode:state},gst:{enabled:rate>0,priceMode:item.gstPriceMode||"INCLUSIVE"}},placeOfSupply:type==="IGST"?"33":state});
    return {...item,discount:tax.discount,taxableAmount:tax.taxableAmount,cgst:tax.cgst,sgst:tax.sgst,utgst:tax.utgst,igst:tax.igst,totalGst:tax.totalGST,lineTotal:tax.total};
  }
  const taxLines=items.map((item,index)=>taxLine(item,gross[index],discounts[index]));
  const chargeLine=taxLine({gstRate:additionalChargesGstRate,taxType:additionalChargesTaxType,gstPriceMode:"EXCLUSIVE"},charges,0);
  const all=[...taxLines,chargeLine],sum=key=>sumMoney(all.map(line=>line[key]||0));
  return {subtotal,additionalCharges:charges,additionalChargesGstRate:Number(additionalChargesGstRate),additionalChargesTaxType,additionalChargesTax:chargeLine.totalGst,discountType:discountType==="PERCENTAGE"?"PERCENTAGE":"FIXED",discountValue:value,discount,taxableAmount:sum("taxableAmount"),totalGst:sum("totalGst"),cgst:sum("cgst"),sgst:sum("sgst"),utgst:sum("utgst"),igst:sum("igst"),total:sum("lineTotal"),taxLines};
}
