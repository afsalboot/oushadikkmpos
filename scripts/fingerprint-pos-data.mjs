// Authenticated database reads only. Raw BSON includes every persisted field.
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { databaseIdentity, matchesLegacyIdentity } from './fingerprint-identity.mjs';
process.loadEnvFile('.env.local');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
const previousPath = process.argv.find(arg => arg.startsWith('--compare='))?.slice(10);
if (!output) throw new Error('Specify --output=docs/filename.json');
const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db();
  const session = client.startSession({ snapshot: true, causalConsistency: false });
  const report = { measuredAt: new Date().toISOString(), method: 'MongoDB snapshot session; sorted raw BSON SHA256 including all persisted fields', collections: {}, databaseWrites: 0 };
  try {
    const settings = await db.collection('settings').findOne({ key: 'global' }, { session });
    if (!settings?._id) throw new Error('Reliable existing store identity is missing; stop before app benchmarking');
    report.identity = {
      databaseHash: databaseIdentity(client.options.hosts, db.databaseName),
      databaseIdentityVersion: 2,
      storeHash: createHash('sha256').update(String(settings._id)).digest('hex'),
      storeName: settings.store?.name || settings.storeName,
      checkoutEnabled: settings.checkout?.enabled !== false,
      paymentMethods: settings.payments?.enabledMethods,
      splitPayment: settings.payments?.splitPayment !== false,
      upiReferenceRequired: !!settings.payments?.upi?.requireReference,
      bankReferenceRequired: !!settings.payments?.bank?.requireReference,
    };
    for (const name of ['sales', 'inventorybatches', 'stocktransactions', 'products']) {
      const hash = createHash('sha256');
      let count = 0, bytes = 0;
      for await (const document of db.collection(name).find({}, { session, raw: true, sort: { _id: 1 }, batchSize: 250 })) {
        if (!Buffer.isBuffer(document)) throw new Error('Raw BSON cursor unavailable');
        const size = Buffer.alloc(4); size.writeUInt32LE(document.length);
        hash.update(size); hash.update(document); count++; bytes += document.length;
      }
      report.collections[name] = { count, bytes, sha256: hash.digest('hex') };
    }
    report.barcodeCount = await db.collection('products').countDocuments({ active: true, visibleInSales: { $ne: false }, barcode: { $type: 'string', $ne: '' } }, { session });
  } finally { await session.endSession(); }
  if (previousPath) {
    const previous = JSON.parse(readFileSync(previousPath, 'utf8'));
    const sameDatabase = previous.identity.databaseIdentityVersion === 2
      ? previous.identity.databaseHash === report.identity.databaseHash
      : matchesLegacyIdentity(previous.identity.databaseHash, client.options.hosts, db.databaseName);
    report.identityComparison = previous.identity.databaseIdentityVersion === 2 ? 'Canonical sorted MongoDB hosts and database plus store identity' : 'Original before identifier verified against permutations of the same SRV host set and database; before report preserved';
    report.sameIdentity = sameDatabase && previous.identity.storeHash === report.identity.storeHash;
    report.matches = Object.fromEntries(Object.entries(report.collections).map(([name, value]) => [name, JSON.stringify(value) === JSON.stringify(previous.collections[name])]));
    report.matchExactly = report.sameIdentity && Object.values(report.matches).every(Boolean);
  }
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(JSON.stringify({ error: error.name, code: error.code, message: error.code ? undefined : error.message.replace(/mongodb[^\s]*/gi, '[database]') })); process.exitCode = 1; }
finally { await client.close(); }
