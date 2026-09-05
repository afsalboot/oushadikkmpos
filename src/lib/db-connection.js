export function createConnectionManager(driver, cache) {
  return async function connectDb() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not configured");
    if (cache.connection) return cache.connection;
    if (!cache.promise) {
      cache.promise = driver.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
        .then((connection) => {
          cache.connection = connection;
          return connection;
        })
        .catch((error) => {
          cache.promise = null;
          throw error;
        });
    }
    return cache.promise;
  };
}
