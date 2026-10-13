import mongoose from 'mongoose';
import { Product } from '../models/index.js';
import { productCataloguePipeline } from '../lib/product-catalogue-pipeline.js';
import { getProducts } from './product.service.js';

export async function getProductCatalogue(parameters, timing) {
  const measure=(name,fn)=>timing?timing.measure(name,fn):fn();
  const search=(parameters.get('q')||'').trim();
  if(search.length>100)throw Object.assign(new Error('Search is too long'),{status:422});
  const literal=search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const filter=search?{$or:['name','sku','barcode','manufacturer'].map(field=>({[field]:{$regex:literal,$options:'i'}}))}:{};
  const category=parameters.get('category');
  // Category belongs to the filtered facets; global metrics/brand options remain search-wide.
  const categoryId=category&&category!=='ALL'?new mongoose.Types.ObjectId(category):undefined;
  const pipeline=productCataloguePipeline({...filter,...(categoryId?{categoryId}:{})},parameters);
  if(categoryId) pipeline[0].$match=filter;
  const selectedIds=parameters.getAll('selected');
  if(selectedIds.length>200||selectedIds.some(id=>!mongoose.isValidObjectId(id)))throw Object.assign(new Error('Invalid product selection'),{status:422});
  pipeline.at(-1).$facet.availableSelection=[{$match:{_id:{$in:selectedIds.map(id=>new mongoose.Types.ObjectId(id))}}},{$project:{_id:1}}];
  const [facets]=await measure('catalogue_summary',()=>Product.aggregate(pipeline));
  const ids=(facets?.ids||[]).map(row=>row._id);
  const rows=ids.length?await getProducts({_id:{$in:ids}},{timing}):[];
  const order=new Map(ids.map((id,index)=>[String(id),index]));rows.sort((a,b)=>order.get(String(a._id))-order.get(String(b._id)));
  const total=facets?.total?.[0]?.count||0,page=Math.max(1,Math.floor(Number(parameters.get('page'))||1)),limit=Math.min(100,Math.max(1,Math.floor(Number(parameters.get('limit'))||20)));
  return {rows,pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},availableSelectionIds:(facets?.availableSelection||[]).map(row=>String(row._id)),selectionIds:(facets?.selection||[]).map(row=>String(row._id)),brandOptions:(facets?.brands||[]).map(row=>({value:row._id,label:row.label||'No brand'})),metrics:facets?.metrics?.[0]||{total:0,low:0,opened:0,expiring:0,inactive:0,sellingValue:0}};
}
