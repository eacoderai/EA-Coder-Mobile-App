import { supabase } from './supabase/client';

export async function runDiagnostics() {
  const results = {
    network: false,
    supabase_api: false,
    auth_service: false,
    latency: 0,
    errors: [] as string[]
  };

  const start = Date.now();

  // 1. Check basic network connectivity
  try {
    const res = await fetch('https://google.com', { mode: 'no-cors' });
    results.network = true;
  } catch (e) {
    results.errors.push("Cannot reach external internet (check your DNS/WiFi)");
  }

  // 2. Check Supabase API availability
  try {
    const { error } = await supabase.from('_non_existent_table').select('id').limit(1);
    // We expect a 404 or table not found, which means the API is reachable
    results.supabase_api = true;
  } catch (e: any) {
    if (e.name === 'AbortError' || e.message.includes('timeout')) {
      results.errors.push("Supabase API timed out (likely a firewall/VPN issue)");
    } else {
      results.supabase_api = true; // Any response is a good sign
    }
  }

  // 3. Check Auth Service
  try {
    const { error } = await supabase.auth.getSession();
    if (!error) results.auth_service = true;
  } catch (e: any) {
    results.errors.push(`Auth service unreachable: ${e.message}`);
  }

  results.latency = Date.now() - start;
  return results;
}

export async function verifyPlanSync(accessToken: string, expectedTier?: string) {
  const logPrefix = '[DiagSync]';
  console.log(`${logPrefix} Starting Plan Sync Verification...`);
  const start = performance.now();
  
  try {
    const res = await fetch(`https://iixyfjipzvrfuzlxaneb.supabase.co/functions/v1/server/subscription`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    const duration = (performance.now() - start).toFixed(2);
    
    if (res.ok) {
      const data = await res.json();
      const plan = data?.subscription?.plan || 'free';
      console.log(`${logPrefix} Verification successful in ${duration}ms. Server plan: ${plan}`);
      
      if (expectedTier && plan !== expectedTier) {
        console.warn(`${logPrefix} Mismatch! Expected: ${expectedTier}, Got: ${plan}`);
        return { success: false, plan, duration };
      }
      return { success: true, plan, duration };
    } else {
      console.error(`${logPrefix} Failed to fetch plan. Status: ${res.status}`);
      return { success: false, error: `Status ${res.status}`, duration };
    }
  } catch (err: any) {
    console.error(`${logPrefix} Exception during verification:`, err);
    return { success: false, error: err.message, duration: (performance.now() - start).toFixed(2) };
  }
}
