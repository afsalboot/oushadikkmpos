import mongoose from "mongoose";
import { createConnectionManager } from "./db-connection.js";

const cached = globalThis.mongooseConnection || (globalThis.mongooseConnection = { connection: null, promise: null });
export const connectDb = createConnectionManager(mongoose, cached);
