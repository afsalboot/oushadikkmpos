import {sumMoney,money} from './money.js';
import {financialYear} from './gst-compliance.js';

// Invoice-time snapshots only. Payments and today's product/customer masters are irrelevant.
export function buildGstRegister(sales,{hsn=false}={}) {
  const rows=[];
  for(const sale of sales) {
    const status=sale.documentStatus||'FINALIZED',registered=Boolean(sale.customerSnapshot?.gstin);
    const category=sale.registrationSnapshot?.status==='UNREGISTERED'||!sale.gstEnabled?'NON_GST_SUPPLIER':registered?'B2B':sale.taxType==='IGST'&&Number(sale.total)>100000?'B2CL':'B2CS';
    for(const [index,item] of (sale.items||[]).entries()) {
      rows.push({invoice:sale.invoiceNumber,date:sale.invoiceDate||sale.createdAt,financialYear:sale.financialYear||financialYear(sale.createdAt),documentType:sale.documentType||'LEGACY_UNCLASSIFIED',status,category,customer:sale.customerSnapshot?.businessName||sale.customerSnapshot?.name||'Walk-in',gstin:sale.customerSnapshot?.gstin||'',placeOfSupply:sale.placeOfSupply||'',line:index+1,description:item.name,hsn:item.hsnCode||'',uqc:item.uqc||item.baseUnit||item.packageType||'',quantity:item.quantity,classification:item.taxClassification||((item.gstExempt||item.taxable===false)?'EXEMPT_UNVERIFIED':Number(item.gstRate)===0?'ZERO_RATE_UNCLASSIFIED':'TAXABLE'),rate:Number(item.gstRate||0),discount:money(item.discount||0),taxable:money(item.taxableValue||0),cgst:money(item.cgst||0),sgst:money(item.sgst||0),utgst:money(item.utgst||0),igst:money(item.igst||0),cess:money(item.cess||0),tax:money(item.totalTax??item.taxAmount??0),total:money(item.total||0),invoiceTotal:money(sale.total||0),paymentStatus:sale.paymentStatus||'',quality:!sale.registrationSnapshot||!item.uqc?'REVIEW_LEGACY_OR_UQC':'SNAPSHOT'});
    }
  }
  if(!hsn)return rows;
  const groups=new Map();
  for(const row of rows.filter(row=>row.status!=='CANCELLED')){
    const key=JSON.stringify([row.category,row.hsn,row.uqc,row.rate,row.classification,row.placeOfSupply]);
    const group=groups.get(key)||{category:row.category,hsn:row.hsn,uqc:row.uqc,rate:row.rate,classification:row.classification,placeOfSupply:row.placeOfSupply,quantity:0,taxable:0,cgst:0,sgst:0,utgst:0,igst:0,cess:0,tax:0,total:0};
    group.quantity+=Number(row.quantity||0);
    for(const field of ['taxable','cgst','sgst','utgst','igst','cess','tax','total'])group[field]=sumMoney([group[field],row[field]]);
    groups.set(key,group);
  }
  return [...groups.values()];
}

export const fiscalColumns=hsn=>[
  ...(!hsn?[{key:'invoice',label:'Invoice'},{key:'date',label:'Invoice date',type:'date'},{key:'financialYear',label:'Financial year'},{key:'documentType',label:'Document'},{key:'status',label:'Status'},{key:'customer',label:'Recipient'},{key:'gstin',label:'Recipient GSTIN'},{key:'description',label:'Description'}]:[]),
  {key:'category',label:'Supply category'},{key:'placeOfSupply',label:'Place of supply'},{key:'classification',label:'Tax classification'},{key:'hsn',label:'HSN/SAC'},{key:'uqc',label:'Unit/UQC'},{key:'quantity',label:'Quantity'},{key:'rate',label:'GST %'},
  ...['taxable','cgst','sgst','utgst','igst','cess','tax','total'].map(key=>({key,label:key.toUpperCase(),type:'money'})),
  ...(!hsn?[{key:'invoiceTotal',label:'Invoice total (do not sum repeated lines)',type:'money'},{key:'paymentStatus',label:'Payment status'},{key:'quality',label:'Data review'}]:[])
];
