
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupOrphanedSubscriptions() {
  console.log('Fetching valid users from Auth...');
  
  // List all users from Auth (handles pagination if needed, but for <50 users one page is fine)
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  
  if (authError) {
    console.error('Error fetching users:', authError);
    return;
  }

  if (!users) {
    console.log('No users found in Auth.');
    return;
  }

  const validUserIds = new Set(users.map(u => u.id));
  console.log(`Found ${validUserIds.size} valid users in Auth.`);

  console.log('Scanning kv_store_00a119be for subscriptions...');
  const { data: kvData, error: kvError } = await supabase
    .from('kv_store_00a119be')
    .select('key')
    .like('key', 'user:%:subscription');

  if (kvError) {
    console.error('Error fetching KV data:', kvError);
    return;
  }

  const keysToDelete = [];
  
  for (const row of kvData) {
    const key = row.key;
    const parts = key.split(':');
    // Key format: user:USER_ID:subscription
    if (parts.length >= 2) {
      const userId = parts[1];
      if (!validUserIds.has(userId)) {
        console.log(`Marking orphan for deletion: ${key} (User ${userId} not found)`);
        keysToDelete.push(key);
      }
    }
  }

  if (keysToDelete.length === 0) {
    console.log('No orphaned subscriptions found.');
    return;
  }

  console.log(`\nFound ${keysToDelete.length} orphaned subscriptions to delete.`);
  
  // Delete in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < keysToDelete.length; i += BATCH_SIZE) {
    const batch = keysToDelete.slice(i, i + BATCH_SIZE);
    const { error: delError } = await supabase
      .from('kv_store_00a119be')
      .delete()
      .in('key', batch);
    
    if (delError) {
      console.error('Error deleting batch:', delError);
    } else {
      console.log(`Deleted batch ${i/BATCH_SIZE + 1}`);
    }
  }
  
  console.log('Cleanup complete.');
}

cleanupOrphanedSubscriptions();
