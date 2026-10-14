import { Sale, Expense, Purchase, InventoryBatch } from '../models/index.js';
import { reportOverviewPipeline, reportInventoryUnitsPipeline } from '../lib/report-overview-pipeline.js';
import { getAccountData } from './account-data.service.js';
import {historicalSalesAggregate} from './sale-history.service.js';

const round=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const dateFilter = (parameters, field) => {
  const from=parameters.get('dateFrom'),to=parameters.get('dateTo');
  return from||to ? { [field]: { ...(from?{$gte:new Date(from+'T00:00:00+05:30')}:{}), ...(to?{$lte:new Date(to+'T23:59:59.999+05:30')}:{}) } } : {};
};
export async function getReportOverview(parameters) {
  const options=Object.fromEntries(['dateFrom','dateTo','search','paymentMethod','sort','order','page','limit'].map(key=>[key,parameters.get(key)||'']));
  options.inferPaymentMethods=true;
  const [sales,purchases,expenses,ledger,units]=await Promise.all([
    historicalSalesAggregate(reportOverviewPipeline({ documentStatus: { $ne:'CANCELLED' }, ...dateFilter(parameters,'createdAt') })),
    Purchase.aggregate([{ $match:{purchaseStatus:'RECEIVED',...dateFilter(parameters,'purchasedAt')} },{$group:{_id:null,total:{$sum:'$total'}}}]),
    Expense.aggregate([{ $match:{status:{$ne:'VOID'},source:'MANUAL',...dateFilter(parameters,'expenseDate')} },{$group:{_id:null,total:{$sum:'$amount'}}}]),
    getAccountData(options), InventoryBatch.aggregate(reportInventoryUnitsPipeline()),
  ]);
  const summary=sales[0]?.summary?.[0]||{},items=sales[0]?.items?.[0]||{};
  const revenue=round(summary.revenue),wholesaleRevenue=round(summary.wholesaleRevenue),purchaseValue=round(purchases[0]?.total),operatingExpenses=round(expenses[0]?.total);
  const externalRevenue=round(items.externalRevenue),externalCost=round(items.externalCost),externalProfit=items.unknownExternalCost?null:round(externalRevenue-externalCost);
  const byUnit=Object.fromEntries(['ml','g','tablets','pcs'].map(unit=>[unit,round(units.find(row=>row._id===unit)?.quantity)]));
  return { title:'Reports',description:'Analyze retail and wholesale sales, inventory, purchases, expenses and business performance.',
    kpis:[{label:'Inventory Product Sales',value:round(items.inventoryRevenue),type:'money'}, {label:'External Purchase Sales',value:externalRevenue,type:'money'}, {label:'External Purchase Cost',value:externalCost,type:'money'}, {label:'External Purchase Profit',value:externalProfit,type:externalProfit===null?'unavailable':'money',note:externalProfit===null?'Purchase cost is not recorded for selling-price-only items':undefined},
      {label:'Total Sales',value:revenue,type:'money'},{label:'Wholesale Sales',value:wholesaleRevenue,type:'money'},{label:'Gross Profit',value:null,type:'unavailable',note:'Reliable sold-batch cost is unavailable'}, {label:'Purchases',value:purchaseValue,type:'money'}, {label:'Operating Expenses',value:operatingExpenses,type:'money'}, {label:'Net Cash Flow',value:ledger.summary.netCashFlow,type:'money'}],
    columns:[],rows:[],pagination:{page:1,limit:0,total:0,pages:1},
    charts:{trend:(sales[0]?.trend||[]).map(row=>({date:row._id,revenue:round(row.revenue),wholesaleRevenue:round(row.wholesaleRevenue),orders:row.orders,averageBill:row.orders?round(row.revenue/row.orders):0})),movement:[{label:'Retail Sales',value:round(revenue-wholesaleRevenue)},{label:'Wholesale Sales',value:wholesaleRevenue},{label:'Purchases',value:purchaseValue},{label:'Operating Expenses',value:operatingExpenses}],inventoryByUnit:byUnit},
  };
}
