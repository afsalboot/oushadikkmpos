// Authenticated, snapshot, read-only audit. No Mongoose models or auto-indexing.
import mongoose from 'mongoose';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {saleAnalyticsFacts,dailyContribution,productContributions,businessDay,saleExpiry,saleSourceHash,invoiceIdentity} from '../src/lib/sale-retention.js';
process.loadEnvFile('.env.local');
const output=process.argv.find(value=>value.startsWith('--output='))?.slice(9);
if(!output||!/^docs[/\\][\w.-]+\.json$/.test(output))throw new Error('Use --output=docs/<report>.json');
const client=new mongoose.mongo.MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
try{
  await client.connect();const db=client.db(),session=client.startSession({snapshot:true,causalConsistency:false});
  try{
    const settings=await db.collection('settings').findOne({key:'global'},{session});if(!settings?._id)throw new Error('Persisted store identity is missing');
    const now=new Date(),cutoff=new Date(+now-90*86400000),report={measuredAt:now.toISOString(),databaseWrites:0,storeHash:createHash('sha256').update(String(settings._id)).digest('hex'),cutoff:cutoff.toISOString(),scope:'One global settings identity; this database has no sale tenant or branch field',counts:{sales:0,olderThan60Days:0,olderThan90Days:0,futureDates:0,invalidDates:0},bytes:{detailedSales:0,projectedCompactLedger:0,eligibleDetailedSales:0,eligibleProjectedLedger:0},indexes:{},permanentCollections:{},storage:{},dateRange:{oldest:null,newest:null}};
    for await(const sale of db.collection('sales').find({},{session,batchSize:100})){
      report.counts.sales++;const detailed=mongoose.mongo.BSON.calculateObjectSize(sale);report.bytes.detailedSales+=detailed;
      let date;try{date=new Date(sale.invoiceDate??sale.createdAt);if(!Number.isFinite(+date))throw Error();}catch{report.counts.invalidDates++;continue;}
      if(date>now)report.counts.futureDates++;if(date<new Date(+now-60*86400000))report.counts.olderThan60Days++;
      report.dateRange.oldest=!report.dateRange.oldest||date<new Date(report.dateRange.oldest)?date.toISOString():report.dateRange.oldest;report.dateRange.newest=!report.dateRange.newest||date>new Date(report.dateRange.newest)?date.toISOString():report.dateRange.newest;
      const facts=saleAnalyticsFacts(sale),ledger={_id:sale._id,storeId:String(settings._id),date:businessDay(sale),saleDate:date,sourceHash:saleSourceHash(sale),version:1,facts,metrics:dailyContribution(facts),productMetrics:productContributions(facts),actorId:sale.actorId,invoiceHash:invoiceIdentity(settings._id,sale.invoiceNumber),expiresAt:saleExpiry(sale),purgedAt:now,dashboardCost:0,...(sale.requestKey?{requestKey:sale.requestKey,requestHash:sale.requestHash}:{})};
      const size=mongoose.mongo.BSON.calculateObjectSize(ledger);report.bytes.projectedCompactLedger+=size;
      if(date<cutoff){report.counts.olderThan90Days++;report.bytes.eligibleDetailedSales+=detailed;report.bytes.eligibleProjectedLedger+=size;}
    }
    for(const name of ['sales','inventorybatches','stocktransactions','settings'])report.indexes[name]=await db.collection(name).listIndexes().toArray();
    for(const name of ['saleshistoryledgers','dailysalessummaries','dailyproductsalessummaries','dailycustomersalessummaries','salesretentionstates','salesretentionruns'])report.permanentCollections[name]=await db.collection(name).countDocuments({},{session});
    for(const name of ['sales','inventorybatches','stocktransactions']){try{const stats=await db.command({collStats:name});report.storage[name]={count:stats.count,size:stats.size,storageSize:stats.storageSize,totalIndexSize:stats.totalIndexSize};}catch(error){report.storage[name]={available:false,errorCode:error.code||null};}}
    report.saleTTLPresent=report.indexes.sales.some(index=>index.expireAfterSeconds!==undefined);
    report.projectionNote='Projected BSON ledger bytes are hypothetical. Daily/product/customer summaries and indexes add storage. No production backfill, cleanup, compaction or storage reduction occurred.';
    writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({counts:report.counts,bytes:report.bytes,dateRange:report.dateRange,saleTTLPresent:report.saleTTLPresent,permanentCollections:report.permanentCollections,databaseWrites:0},null,2));
  }finally{await session.endSession();}
}finally{await client.close();}
