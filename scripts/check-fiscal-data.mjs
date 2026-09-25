// Read-only: uses the raw MongoDB driver, not Mongoose model initialization/index writes.
// Run with: node --env-file=.env.local scripts/check-fiscal-data.mjs
import mongoose from 'mongoose';
const uri=process.env.MONGODB_URI;
if(!uri){console.log(JSON.stringify({verified:false,reason:'MONGODB_URI is not configured'}));process.exit(1);}
const client=new mongoose.mongo.MongoClient(uri,{serverSelectionTimeoutMS:10000,connectTimeoutMS:10000});
try {
  await client.connect();
  const db=client.db(),sales=db.collection('sales');
  const [settings,collections,total,taxed,missingSnapshots,overlong]=await Promise.all([
    db.collection('settings').findOne({key:'global'},{projection:{gst:1,'store.gstin':1,_id:0}}),
    db.listCollections({},{nameOnly:true}).toArray(),
    sales.countDocuments(),sales.countDocuments({gstEnabled:true}),
    sales.countDocuments({$or:[{storeSnapshot:{$exists:false}},{customerSnapshot:{$exists:false}}]}),
    sales.countDocuments({invoiceNumber:{$regex:'.{17}'}})
  ]);
  const indexes={};
  for(const name of ['sales','documentcounters','fiscalguards'])indexes[name]=collections.some(c=>c.name===name)?(await db.collection(name).listIndexes().toArray()).map(i=>({key:i.key,unique:!!i.unique,partialFilterExpression:i.partialFilterExpression})):[];
  console.log(JSON.stringify({verified:true,readOnly:true,gstEnabled:settings?.gst?.enabled??false,registrationStatus:settings?.gst?.registrationStatus??'NOT_RECORDED',gstinPresent:Boolean(settings?.store?.gstin),invoiceCount:total,invoicesWithGstEnabled:taxed,missingHeaderSnapshots:missingSnapshots,invoiceNumbersOver16Characters:overlong,indexes},null,2));
} catch(error) {
  console.log(JSON.stringify({verified:false,reason:'Database read-only verification could not complete',errorType:error.name}));process.exitCode=1;
} finally {await client.close();}
