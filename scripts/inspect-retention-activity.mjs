// Read-only explanation of activity between the saved retention fingerprints.
import mongoose from 'mongoose';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
process.loadEnvFile('.env.local');
const before=JSON.parse(readFileSync('docs/sale-retention-before-fingerprint.json','utf8')),after=JSON.parse(readFileSync('docs/sale-retention-after-fingerprint.json','utf8'));
if(!after.sameIdentity)throw new Error('Fingerprint store/database identities differ');
const client=new mongoose.mongo.MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
try{
  await client.connect();const db=client.db(),session=client.startSession({snapshot:true,causalConsistency:false});
  try{
    const settings=await db.collection('settings').findOne({key:'global'},{session});if(createHash('sha256').update(String(settings?._id)).digest('hex')!==before.identity.storeHash)throw new Error('Store identity changed');
    const window={start:before.measuredAt,end:after.measuredAt},date={ $gte:new Date(window.start),$lte:new Date(window.end)},report={window,databaseWritesByThisCheck:0,matchExactly:after.matchExactly,collectionActivity:{},attribution:'Live activity observed during local development. Request clients and authors were not identified. All agent database mutations used the isolated localhost fixture.'};
    for(const name of ['sales','inventorybatches','stocktransactions','products']){
      const [range]=await db.collection(name).aggregate([{$match:{createdAt:date}},{$group:{_id:null,count:{$sum:1},first:{$min:'$createdAt'},last:{$max:'$createdAt'}}}],{session}).toArray();
      report.collectionActivity[name]={beforeCount:before.collections[name].count,afterCount:after.collections[name].count,countDelta:after.collections[name].count-before.collections[name].count,createdInWindow:range?.count||0,firstCreated:range?.first||null,lastCreated:range?.last||null,updatedInWindow:await db.collection(name).countDocuments({updatedAt:date},{session})};
    }
    report.retentionCollections={};for(const name of ['saleshistoryledgers','dailysalessummaries','dailyproductsalessummaries','dailycustomersalessummaries','salesretentionstates','salesretentionruns'])report.retentionCollections[name]=await db.collection(name).countDocuments({},{session});
    writeFileSync('docs/sale-retention-concurrent-activity.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  }finally{await session.endSession();}
}finally{await client.close();}
