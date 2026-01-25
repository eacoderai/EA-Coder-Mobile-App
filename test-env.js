// Simple test to verify environment configuration
console.log('Environment Variables:');
console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY);
console.log('VITE_FUNCTIONS_URL:', import.meta.env.VITE_FUNCTIONS_URL);
console.log('VITE_NODE_ENV:', import.meta.env.VITE_NODE_ENV);

// Test the getFunctionUrl helper
import { getFunctionUrl } from './src/utils/supabase/client.tsx';
console.log('getFunctionUrl test:', getFunctionUrl('test-endpoint'));