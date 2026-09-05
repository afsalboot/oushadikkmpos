import nextEnv from "@next/env";
import { validateProductionEnv } from "../src/lib/production-env.js";

nextEnv.loadEnvConfig(process.cwd(), false);
const errors = validateProductionEnv(process.env);
if (errors.length) {
  console.error("Production configuration needs attention:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Production environment checks passed. Storage durability, database topology, HTTPS, and recovery still require deployment verification.");
}
