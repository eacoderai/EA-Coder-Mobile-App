import { useState } from 'react';
import { getFunctionUrl } from '../utils/supabase/client';
import { Button } from './ui/button';

export function SupabaseTest() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testSupabaseFunctions = async () => {
    setLoading(true);
    try {
      // Create a simple test function call
  const url = getFunctionUrl('make-server-00a119be/strategies');
      console.log('[SupabaseTest] Request start', {
        url,
        payload: {
          strategy_name: 'Test Strategy',
          description: 'Test strategy',
          instrument: 'EURUSD',
          platform: 'mql4',
          risk_management: 'Max 2% risk per trade'
        }
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          strategy_name: 'Test Strategy',
          description: 'Test strategy',
          instrument: 'EURUSD',
          platform: 'mql4',
          risk_management: 'Max 2% risk per trade'
        })
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SupabaseTest] Response error', {
          url,
          status: response.status,
          statusText: response.statusText,
          contentType,
          bodyPreview: errorText.slice(0, 500)
        });
        throw new Error(`Request failed (${response.status}): ${errorText.slice(0, 200)}`);
      }
      console.log('[SupabaseTest] Response OK', { url, status: response.status, contentType });
      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: any) {
      console.error('[SupabaseTest] Exception', { errorMessage: error?.message, error });
      setResult(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-4">Supabase Functions Test</h1>
      
      <Button 
        onClick={testSupabaseFunctions}
        disabled={loading}
        className="mb-4"
      >
        {loading ? 'Testing...' : 'Test Supabase Functions'}
      </Button>
      
      {result && (
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto max-h-96">
          {result}
        </pre>
      )}
    </div>
  );
}
