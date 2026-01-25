import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info.tsx';

const env = (import.meta as any)?.env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || publicAnonKey;

// Create a single Supabase client instance to avoid multiple instances
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const functionsUrl = env.VITE_FUNCTIONS_URL || `https://${projectId}.supabase.co/functions/v1`;

// Helper function to get the full function URL
export const getFunctionUrl = (functionName: string) => {
  const normalized = functionName.replace(/^make-server-[^/]+\//, '');
  const path = normalized.startsWith('server/')
    ? normalized
    : `server/${normalized}`;
  return `${functionsUrl}/${path}`;
};
