
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
  console.log('You can find it in your Supabase Dashboard > Project Settings > API.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listSubscriptions() {
  console.log('Fetching subscriptions from kv_store_00a119be...');

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

  const subscriptions = data.map(row => {
    const keyParts = row.key.split(':');
    const userId = keyParts[1];
    const plan = row.value.plan;
    const updatedAt = row.value.updatedAt;
    return { 
      user_id: userId, 
      plan: plan, 
      updated_at: updatedAt 
    };
  });

  // Sort by updated_at desc
  subscriptions.sort((a, b) => {
    // Custom sort order: elite > pro > free
    const tierOrder = { elite: 3, pro: 2, free: 1 };
    const tierA = tierOrder[a.plan as keyof typeof tierOrder] || 0;
    const tierB = tierOrder[b.plan as keyof typeof tierOrder] || 0;
    
    if (tierA !== tierB) {
      return tierB - tierA; // Higher tier first
    }
    
    const dateA = new Date(a.updated_at || 0).getTime();
    const dateB = new Date(b.updated_at || 0).getTime();
    return dateB - dateA;
  });

  console.table(subscriptions);

  // Summary
  const summary = subscriptions.reduce((acc, curr) => {
    const plan = curr.plan || 'unknown';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, { free: 0, pro: 0, elite: 0 } as Record<string, number>); // Initialize with defaults

  console.log('\nPlan Distribution:');
  console.table(summary);
}

listSubscriptions();
