import { dashboardInventoryPipeline } from './dashboard-inventory-pipeline.js';

export function productCataloguePipeline(filter, parameters, now = new Date()) {
  const page=Math.max(1,Math.floor(Number(parameters.get('page'))||1)),limit=Math.min(100,Math.max(1,Math.floor(Number(parameters.get('limit'))||20)));
  const pipeline=dashboardInventoryPipeline([]).slice(0,-1);
  pipeline[0]={$match:filter};
  Object.assign(pipeline[1].$project,{manufacturer:1,active:1,visibleInSales:1,allowPackageSale:1});
  const today=new Date(now);today.setHours(0,0,0,0);
  const stockGroup=pipeline[2].$lookup.pipeline.at(-1).$group;
  Object.assign(stockGroup,{
    batches:{$sum:1},expired:{$max:{$cond:[{$and:[{$ne:[{$ifNull:['$expiryDate',null]},null]},{$lt:['$expiryDate',today]}]},1,0]}},
    expiring:{$max:{$cond:[{$and:[{$ne:[{$ifNull:['$expiryDate',null]},null]},{$gt:['$expiryDate',new Date(now.getTime()-86400000)]},{$lte:['$expiryDate',new Date(now.getTime()+90*86400000)]}]},1,0]}},
  });
  pipeline.push({$set:{
    brandLabel:{$reduce:{input:{$regexFindAll:{input:{$ifNull:['$manufacturer','']},regex:'\\S+'}},initialValue:'',in:{$concat:['$$value',{$cond:[{$eq:['$$value','']},'',' ']},'$$this.match']}}},
    lowStock:{$and:[{$gt:['$reorderLevel',0]},{$lte:['$equivalent','$reorderLevel']}]},
  }});
  pipeline.push({$set:{brandKey:{$cond:[{$eq:['$brandLabel','']},'__unbranded__',{$toLower:'$brandLabel'}]}}});
  const clauses=[];
  const union=(key,map)=>{
    const values=parameters.getAll(key);
    if(values.some(value=>!Object.hasOwn(map,value))) throw Object.assign(new Error('Invalid product filter'),{status:422});
    if(values.length)clauses.push({$or:values.map(value=>map[value])});
  };
  if(parameters.get('category')&&parameters.get('category')!=='ALL')clauses.push({categoryId:filter.categoryId});
  const brands=parameters.getAll('brand');if(brands.length)clauses.push({brandKey:{$in:brands}});
  union('stock',{IN:{$or:[{'stock.sealed':{$gt:0}},{'stock.open':{$gt:0}}]},OUT:{$and:[{'stock.sealed':{$lte:0}},{'stock.open':{$lte:0}}]},LOW:{lowStock:true},OPEN:{'stock.open':{$gt:0}}});
  union('capability',{PACKAGE:{allowPackageSale:true},LOOSE:{allowLooseSale:true},MIX:{allowMixture:true}});
  union('visibility',{VISIBLE:{visibleInSales:{$ne:false}},HIDDEN:{visibleInSales:false}});
  union('more',{ACTIVE:{active:{$ne:false}},INACTIVE:{active:false},EXPIRING:{'stock.expiring':1},EXPIRED:{'stock.expired':1},MULTI:{'stock.batches':{$gte:2}}});
  const match={$match:clauses.length?{$and:clauses}:{}},sort={$sort:{name:1,_id:1}};
  pipeline.push({$facet:{
    ids:[match,sort,{$skip:(page-1)*limit},{$limit:limit},{$project:{_id:1}}],
    total:[match,{$count:'count'}],
    selection:[match,sort,{$limit:201},{$project:{_id:1}}],
    brands:[{$group:{_id:'$brandKey',label:{$first:'$brandLabel'}}},{$sort:{label:1}}],
    metrics:[{$group:{_id:null,total:{$sum:1},low:{$sum:{$cond:['$lowStock',1,0]}},opened:{$sum:{$cond:[{$gt:['$stock.open',0]},1,0]}},expiring:{$sum:{$cond:[{$eq:['$stock.expiring',1]},1,0]}},inactive:{$sum:{$cond:[{$eq:['$active',false]},1,0]}},sellingValue:{$sum:{$divide:[{$floor:{$add:[{$multiply:[{$add:['$stock.sellingValue',Number.EPSILON]},100]},0.5]}},100]}}}}],
  }});
  return pipeline;
}
