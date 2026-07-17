// Minimal config validator — production-safe stub
function enforceConfig() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'CLERK_SECRET_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('Missing required env vars:', missing.join(', '));
    process.exit(1);
  }
}

module.exports = { enforceConfig };
