
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Simple .env parser
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\x1b[31mError: SUPABASE_SERVICE_ROLE_KEY is missing.\x1b[0m');
  console.log('Please add SUPABASE_SERVICE_ROLE_KEY to your .env file to run this script.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateSubscriptions() {
  console.log('Starting subscription migration (premium -> pro)...');
  console.log('Scanning kv_store_00a119be for user:%:subscription keys...');

  const { data, error } = await supabase
    .from('kv_store_00a119be')
    .select('key, value')
    .like('key', 'user:%:subscription');

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No subscriptions found.');
    return;
  }

  console.log(`Found ${data.length} subscription records.`);

  let updatedCount = 0;
  let alreadyValidCount = 0;
  let unknownCount = 0;
  
  const updates = [];

  for (const row of data) {
    const key = row.key;
    const value = row.value;
    const currentPlan = value.plan;

    if (currentPlan === 'premium') {
      console.log(`Migrating ${key}: premium -> pro`);
      
      const newValue = {
        ...value,
        plan: 'pro',
        updatedAt: new Date().toISOString(),
        migratedAt: new Date().toISOString(),
        originalPlan: 'premium'
      };

      updates.push({ key, value: newValue });
      updatedCount++;
    } else if (currentPlan === 'basic') {
      console.log(`Migrating ${key}: basic -> free`);
      
      const newValue = {
        ...value,
        plan: 'free',
        updatedAt: new Date().toISOString(),
        migratedAt: new Date().toISOString(),
        originalPlan: 'basic'
      };

      updates.push({ key, value: newValue });
      updatedCount++;
    } else if (['free', 'pro', 'elite'].includes(currentPlan)) {
      alreadyValidCount++;
    } else {
      console.warn(`Warning: Unknown plan "${currentPlan}" for key ${key}`);
      unknownCount++;
    }
  }

  if (updates.length > 0) {
    console.log(`\nApplying ${updates.length} updates...`);
    
    // Process updates in batches to avoid hitting limits if many
    const BATCH_SIZE = 50;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const { error: updateError } = await supabase
        .from('kv_store_00a119be')
        .upsert(batch);
      
      if (updateError) {
        console.error('Error updating batch:', updateError);
      } else {
        console.log(`Processed batch ${i / BATCH_SIZE + 1} (${batch.length} records)`);
      }
    }
    console.log('\nMigration completed.');
  } else {
    console.log('\nNo "premium" plans found. No updates needed.');
  }

  console.log('\nSummary:');
  console.log(`- Total records: ${data.length}`);
  console.log(`- Migrated (premium/basic -> pro/free): ${updatedCount}`);
  console.log(`- Already valid (free/pro/elite): ${alreadyValidCount}`);
  console.log(`- Unknown/Other: ${unknownCount}`);
}

migrateSubscriptions();
