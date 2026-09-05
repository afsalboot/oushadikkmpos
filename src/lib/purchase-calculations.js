export const purchaseMoney=(value)=>Math.round((Number(value)+Number.EPSILON)*100)/100;

export function receivedPackageQuantity(item){return Number(item.packageQuantity||0)+Number(item.freeQuantity||0);}

export function calculatePurchaseTotals(items,{additionalCharges=0,discountType="FIXED",discountValue=0}={}){
  const subtotal=purchaseMoney(items.reduce((sum,item)=>sum+Number(item.packageQuantity||0)*Number(item.unitCost||0),0));
  const charges=purchaseMoney(additionalCharges);const value=purchaseMoney(discountValue);
  if(charges<0)throw new Error("Additional charges cannot be negative");
  if(value<0)throw new Error("Discount cannot be negative");
  if(discountType==="PERCENTAGE"&&value>100)throw new Error("Percentage discount cannot exceed 100%");
  const discount=purchaseMoney(discountType==="PERCENTAGE"?subtotal*value/100:value);
  if(discount>subtotal+charges)throw new Error("Discount cannot exceed the purchase value");
  const taxableAmount=purchaseMoney(Math.max(0,subtotal-discount));
  const taxLines=items.map((item)=>{
    const gross=purchaseMoney(Number(item.packageQuantity||0)*Number(item.unitCost||0));
    const rate=Math.max(0,Number(item.gstRate||0));
    const included=item.gstPriceMode!=="EXCLUSIVE";
    const taxable=purchaseMoney(included&&rate?gross/(1+rate/100):gross);
    const gst=purchaseMoney(included?gross-taxable:taxable*rate/100);
    return{taxable,gst,rate,taxType:item.taxType||"NONE",included};
  });
  const totalGst=purchaseMoney(taxLines.reduce((sum,line)=>sum+line.gst,0));
  const cgst=purchaseMoney(taxLines.filter((line)=>line.taxType==="CGST_SGST").reduce((sum,line)=>sum+line.gst/2,0));
  const sgst=cgst;
  const igst=purchaseMoney(taxLines.filter((line)=>line.taxType==="IGST").reduce((sum,line)=>sum+line.gst,0));
  const exclusiveGst=purchaseMoney(taxLines.filter((line)=>!line.included).reduce((sum,line)=>sum+line.gst,0));
  return{subtotal,additionalCharges:charges,discountType:discountType==="PERCENTAGE"?"PERCENTAGE":"FIXED",discountValue:value,discount,taxableAmount,totalGst,cgst,sgst,igst,total:purchaseMoney(subtotal+exclusiveGst+charges-discount)};
}
