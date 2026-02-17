import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info.tsx';

const env = (import.meta as any)?.env || {};
const sanitizeUrl = (url: string | undefined) => {
  if (!url) return '';
  // Trim spaces and handle common malformed patterns
  let sanitized = url.trim();
  // If it starts with " http", remove the leading space (browser might have added it)
  sanitized = sanitized.replace(/^\s+/, '');
  return sanitized;
};

const supabaseUrl = sanitizeUrl(env.VITE_SUPABASE_URL) || `https://${projectId}.supabase.co`;
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || publicAnonKey).trim();

// Create a single Supabase client instance to avoid multiple instances
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: window.localStorage,
    storageKey: `sb-${projectId}-auth-token`,
  },
  global: {
    headers: { 'x-application-name': 'ea-coder-mobile' },
  }
});

const rawFunctionsUrl = env.VITE_FUNCTIONS_URL || `https://${projectId}.supabase.co/functions/v1`;
export const functionsUrl = sanitizeUrl(rawFunctionsUrl);

// Helper function to get the full function URL
export const getFunctionUrl = (functionName: string) => {
  const normalized = functionName.replace(/^make-server-[^/]+\//, '');
  const path = normalized.startsWith('server/')
    ? normalized
    : `server/${normalized}`;
  
  // Ensure we don't have double slashes if functionsUrl ends with one
  const baseUrl = functionsUrl.endsWith('/') ? functionsUrl.slice(0, -1) : functionsUrl;
  return `${baseUrl}/${path}`;
};
