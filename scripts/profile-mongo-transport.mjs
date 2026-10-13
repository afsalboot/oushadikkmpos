// Read-only comparison of driver reads, cursor batches, and aggregation output.
import mongoose from 'mongoose';
process.loadEnvFile('.env.local');
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, monitorCommands: true, compressors: ['zlib'], zlibCompressionLevel: 6, serverSelectionTimeoutMS: 10000 });
  const client = mongoose.connection.getClient();
  client.on('commandSucceeded', event => { if (['find', 'getMore', 'aggregate'].includes(event.commandName)) console.log(JSON.stringify({ command: event.commandName, durationMs: event.duration, rows: event.reply.cursor?.firstBatch?.length ?? event.reply.cursor?.nextBatch?.length })); });
  const hello = await mongoose.connection.db.admin().command({ hello: 1, compression: ['zlib'] });
  console.log(JSON.stringify({ compression: hello.compression || [] }));
  const collection = mongoose.connection.db.collection('products');
  for (const [name, query] of [
    ['native-small', () => collection.find({ active: true }).project({ name: 1 }).toArray()],
    ['native-full', () => collection.find({ active: true }).sort({ name: 1 }).toArray()],
    ['aggregate-full', () => collection.aggregate([{ $match: { active: true } }, { $sort: { name: 1 } }]).toArray()],
  ]) {
    const start = performance.now(); const rows = await query();
    console.log(JSON.stringify({ name, ms: Math.round(performance.now() - start), rows: rows.length, bytes: Buffer.byteLength(JSON.stringify(rows)) }));
  }
} catch (error) { console.error(JSON.stringify({ error: error.name, code: error.code })); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
