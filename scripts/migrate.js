import 'dotenv/config';
import { ensureSchema } from '../lib/schema.js';

async function migrate() {
  console.log('Running migrations…');
  await ensureSchema();
  console.log('✅ Migrations complete');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
