export function validateProductionEnv(env) {
  const errors = [];
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI || "")) errors.push("MONGODB_URI must be a MongoDB connection URI");
  for (const name of ["JWT_SECRET", "BACKUP_ENCRYPTION_KEY"]) {
    if (Buffer.byteLength(env[name] || "") < 32) errors.push(`${name} must contain at least 32 bytes`);
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.BACKUP_ENCRYPTION_KEY) errors.push("Use separate authentication and backup encryption keys");
  if (!env.BACKUP_DIR) errors.push("BACKUP_DIR must point to persistent backup storage");
  if (env.BOOTSTRAP_TOKEN && Buffer.byteLength(env.BOOTSTRAP_TOKEN) < 32) errors.push("BOOTSTRAP_TOKEN must contain at least 32 bytes when enabled");
  return errors;
}
