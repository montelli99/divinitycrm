#!/usr/bin/env node
/**
 * env-validator.js
 * Compares SECRETS.env (source of truth) vs backend/.env and frontend/.env (runtime).
 * Warns on any key mismatches before backend starts.
 *
 * Run: node src/scripts/env-validator.js
 * Exits 0 if all match, 1 if mismatches found.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const SECRETS_FILE = path.join(ROOT, 'SECRETS.env');
const BACKEND_ENV = path.join(ROOT, 'backend', '.env');
const FRONTEND_ENV = path.join(ROOT, 'frontend', '.env');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }
  return env;
}

function maskValue(value) {
  if (!value || value.length < 8) return '***';
  return value.slice(0, 4) + '***' + value.slice(-4);
}

function main() {
  console.log('🔍 Env Validator — checking for cross-file mismatches\n');
  
  if (!fs.existsSync(SECRETS_FILE)) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`⚠️  SECRETS.env not found at ${SECRETS_FILE} — skipping local file alignment check in production`);
      process.exit(0);
    }
    console.error(`❌ FATAL: SECRETS.env not found at ${SECRETS_FILE}`);
    console.error('   This is the source of truth. Create it first.');
    process.exit(1);
  }
  
  const secrets = parseEnvFile(SECRETS_FILE);
  const backend = parseEnvFile(BACKEND_ENV);
  const frontend = parseEnvFile(FRONTEND_ENV);
  
  console.log(`📁 SECRETS.env: ${Object.keys(secrets).length} keys (source of truth)`);
  console.log(`📁 backend/.env: ${Object.keys(backend).length} keys`);
  console.log(`📁 frontend/.env: ${Object.keys(frontend).length} keys\n`);
  
  // Keys that should be in BOTH secrets + backend (server-side secrets)
  const sharedBackendKeys = [
    'DATABASE_URL', 'RABBITSIGN_KEY_ID', 'RABBITSIGN_API_KEY', 'RABBITSIGN_TEMPLATE_PSA',
    'CLERK_SECRET_KEY', 'CLERK_WEBHOOK_SECRET',
    'BACKEND_URL',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET'
  ];
  
  // Keys that should be in BOTH secrets + frontend (public client-side)
  const sharedFrontendKeys = [
    'CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_PUBLISHABLE_KEY',
    'VITE_API_BASE'
  ];
  
  let mismatches = 0;
  let warnings = 0;
  
  console.log('=== Checking backend/.env against SECRETS.env ===');
  for (const key of sharedBackendKeys) {
    if (secrets[key] === undefined) continue;  // not in secrets, skip
    if (backend[key] === undefined) {
      console.log(`  ⚠️  ${key}: missing from backend/.env (secrets has ${maskValue(secrets[key])})`);
      warnings++;
      continue;
    }
    if (secrets[key] !== backend[key]) {
      console.log(`  ❌ MISMATCH: ${key}`);
      console.log(`     SECRETS.env:   ${maskValue(secrets[key])}`);
      console.log(`     backend/.env:  ${maskValue(backend[key])}`);
      mismatches++;
    } else {
      console.log(`  ✓ ${key}: ${maskValue(secrets[key])}`);
    }
  }
  
  console.log('\n=== Checking frontend/.env against SECRETS.env ===');
  for (const key of sharedFrontendKeys) {
    if (secrets[key] === undefined) continue;
    if (frontend[key] === undefined && frontend[key.replace('VITE_', '')] === undefined) {
      console.log(`  ⚠️  ${key}: missing from frontend/.env (secrets has ${maskValue(secrets[key])})`);
      warnings++;
      continue;
    }
    const fValue = frontend[key] || frontend[key.replace('VITE_', '')];
    if (secrets[key] !== fValue) {
      console.log(`  ❌ MISMATCH: ${key}`);
      console.log(`     SECRETS.env:    ${maskValue(secrets[key])}`);
      console.log(`     frontend/.env:  ${maskValue(fValue)}`);
      mismatches++;
    } else {
      console.log(`  ✓ ${key}: ${maskValue(secrets[key])}`);
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  if (mismatches > 0) {
    console.error(`❌ ${mismatches} KEY MISMATCH(ES) — fix .env files before starting server`);
    console.error(`   Run: cp SECRETS.env backend/.env   (then edit non-secret values)`);
    process.exit(1);
  } else if (warnings > 0) {
    console.warn(`⚠️  ${warnings} missing key(s) — non-fatal but check that backend has all needed env vars`);
  } else {
    console.log(`✅ All shared keys match between SECRETS.env and runtime .env files`);
  }
}

main();
