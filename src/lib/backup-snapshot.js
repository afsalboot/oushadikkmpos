export async function readBackupSnapshot(models, session) {
  let collections;
  await session.withTransaction(async () => {
    collections = {};
    // MongoDB does not support parallel operations within a transaction.
    for (const [name, Model] of Object.entries(models)) {
      collections[name] = await Model.find({}).session(session).lean();
    }
  }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  return collections;
}
