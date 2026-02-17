import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Copy, Download, RefreshCw, Loader2, AlertTriangle, Lock } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { Alert, AlertDescription } from "./ui/alert";
import { projectId } from '../utils/supabase/info';
import { toast } from "../utils/tieredToast";
import { getFunctionUrl } from '../utils/supabase/client';
import { NotificationBell } from "./ui/NotificationBell";
import { Header } from "./Header";

interface ConvertScreenProps {
  onNavigate: (screen: string) => void;
  accessToken: string | null;
  isProUser: boolean;
  isEliteUser: boolean;
  remainingGenerations: number;
}

const PLATFORMS = [
  { value: "mql4", label: "MQL4 (MetaTrader 4)" },
  { value: "mql5", label: "MQL5 (MetaTrader 5)" },
  { value: "pinescript", label: "Pine Script v5 TradingView", isElite: true }
];

// Build a robust, efficient conversion prompt for compile-ready output
function buildConversionPrompt(fromLang: string, toLang: string): string {
  const langName = (v: string) => (
    v === 'mql4' ? 'MQL4 (MetaTrader 4)' :
    v === 'mql5' ? 'MQL5 (MetaTrader 5)' :
    v === 'pinescript' ? 'Pine Script v5 TradingView' : v
  );

  const commonDirectives = [
    'Task: Convert the provided source code preserving exact trading logic, signal conditions, risk management, and parameterization.',
    'Output: Return ONLY the final converted code. No explanations, no markdown, no placeholders unless absolutely required.',
    'Style: Keep variable/function names when possible and follow idiomatic conventions for the target language.',
    'Dependencies: Use only standard built-ins/APIs of the target platform. No external libraries.',
    'Completeness: Produce a fully compilable artifact including required boilerplate for the target platform.',
  ];

  const targetDirectives: Record<string, string[]> = {
    mql4: [
      '#property strict at top; produce an Expert Advisor (.mq4).',
      'Provide int OnInit(), void OnDeinit(const int), and void OnTick() entry points.',
      'Execution: Use OrderSend/OrderClose; round lots via NormalizeDouble; respect Digits(), Point, and slippage.',
      'Indicators: Use built-ins (iMA, iRSI, iCustom when necessary) and ensure handles/buffers managed correctly.',
      'Risk: Include inputs for lot size, SL/TP in points or price; normalize to symbol precision.',
      'State: Manage a single position per symbol unless the source code explicitly supports multiple.',
      'Compilation: Avoid warnings; ensure strict typing and initialize variables; no print spam.',
    ],
    mql5: [
      '#property strict at top; produce an Expert Advisor (.mq5).',
      'Provide int OnInit(), void OnDeinit(), and void OnTick() entry points.',
      'Execution: Use the standard library CTrade for trade operations (trade.Buy/trade.Sell).',
      'Positions: Use PositionSelect/HistorySelect as needed and SymbolInfo* for symbol properties.',
      'Indicators: Prefer built-ins via handle creation and CopyBuffer; manage resource release.',
      'Risk: Inputs for lot size, SL/TP; normalize to tick size and digits of the symbol.',
      'Compilation: Strong typing, no implicit conversions; avoid warnings; no external dependencies.',
    ],
    pinescript: [
      'Add //@version=5 and a complete strategy() declaration with sensible defaults.',
      'Use ta.* functions for indicators; avoid repaint: request.security with lookahead_off when used.',
      'Orders: Use strategy.entry and strategy.exit; ensure one-position logic unless multi-position is explicit in source.',
      'Inputs: Expose tunable parameters via input() with appropriate types and defaults.',
      'Runtime: Prefer calc_on_every_tick, overlay=true (if plotting on chart), and avoid non-deterministic behavior.',
      'Safety: Avoid using future-looking functions; operate on confirmed bar data unless explicitly intrabar logic is needed.',
    ],
  };

  const header = `Convert ${langName(fromLang)} → ${langName(toLang)}. Produce compile-ready ${langName(toLang)} code.`;
  const body = [
    ...commonDirectives,
    ...(targetDirectives[toLang] || []),
    'If the source uses APIs not available in the target, implement minimal equivalents inline using standard constructs.',
    'Return the entire final code file content only.',
  ].join('\n- ');

  return `${header}\n- ${body}`;
}

// Removed RestrictedBanner for convert screen
import { addLocalNotification } from '../utils/notifications';
export function ConvertScreen({ onNavigate, accessToken, isProUser, isEliteUser, remainingGenerations }: ConvertScreenProps) {
  const [sourceCode, setSourceCode] = useState("");
  const [convertedCode, setConvertedCode] = useState("");
  const [sourceLang, setSourceLang] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);

  const fetchUsage = async () => {
    if (!accessToken) return;
    setUsageLoading(true);
    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      headers['Authorization'] = `Bearer ${accessToken}`;
      const url = getFunctionUrl('make-server-00a119be/usage');
      await fetch(url, { headers });
    } catch (err) {
      console.warn('[Usage] Failed to fetch usage', err);
    } finally {
      setUsageLoading(false);
    }
  };

  // Load strategies for selection (basic users must pick a free strategy)
  const loadStrategies = async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(
        getFunctionUrl('make-server-00a119be/strategies'),
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setStrategies(data.strategies || []);
      }
    } catch (err) {
      console.error('Failed to load strategies for convert', err);
    }
  };

  // On mount, load strategies if user is basic
  useEffect(() => {
    if (!isProUser) loadStrategies();
  }, [isProUser, accessToken]);

  const handleConvert = async () => {
    if (!isProUser) {
      toast.error('Upgrade to Pro for code conversion', { audience: 'free', tag: 'limit_reached' });
      return;
    }

    if ((sourceLang === 'pinescript' || targetLang === 'pinescript') && !isEliteUser) {
      toast.error('Upgrade to Elite for TradingView conversion', { audience: 'upgrade-to-elite', tag: 'limit_reached' });
      return;
    }

    if (!sourceCode.trim()) {
      toast.error("Please enter source code");
      return;
    }
    
    if (!sourceLang || !targetLang) {
      toast.error("Please select both source and target languages");
      return;
    }
    
    if (sourceLang === targetLang) {
      toast.error("Source and target languages must be different");
      return;
    }
    // Allow request to proceed; server will enforce free strategy requirement for basic users
    
    setIsConverting(true);
    
    try {
      const conversionPrompt = buildConversionPrompt(sourceLang, targetLang);
      // Use Supabase Edge Function
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      const url = getFunctionUrl('make-server-00a119be/convert');
      console.log('[Convert] Request start', {
        url,
        headers,
        payload: {
          code: sourceCode,
          from_lang: sourceLang,
          to_lang: targetLang,
          conversion_prompt: conversionPrompt,
          strategyId: selectedStrategyId || undefined
        }
      });

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: sourceCode,
          from_lang: sourceLang,
          to_lang: targetLang,
          conversion_prompt: conversionPrompt,
          strategyId: selectedStrategyId || undefined
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const errorText = await response.text();
        console.error('[Convert] Response error', {
          url,
          status: response.status,
          statusText: response.statusText,
          contentType,
          bodyPreview: errorText.slice(0, 500)
        });
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || `Conversion failed (${response.status})`);
        } catch {
          throw new Error(`Conversion failed (${response.status}): ${errorText.slice(0, 200)}`);
        }
      }

      console.log('[Convert] Response OK', {
        url,
        status: response.status,
        contentType: response.headers.get('content-type') || ''
      });
      const data = await response.json();
      setConvertedCode(data.converted_code || '');
      toast.success("Code converted successfully!");
      
    } catch (error: any) {
      console.error('[Convert] Exception', { errorMessage: error?.message, error });
      toast.error(error.message || "Failed to convert code");
    } finally {
      setIsConverting(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(convertedCode);
    toast.success("Code copied to clipboard!");
  };

  const downloadCode = () => {
    const extensions: Record<string, string> = {
      mql4: 'mq4',
      mql5: 'mq5',
      pinescript: 'pine'
    };
    
    const ext = extensions[targetLang] || 'txt';
    const filename = `converted_strategy.${ext}`;
    
    const blob = new Blob([convertedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(`Downloaded ${filename}`);
  };

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        title="Code Converter"
        subtitle="Convert between MQL4, MQL5, and Pine Script"
        onBack={() => onNavigate('home')}
        rightContent={<NotificationBell accessToken={accessToken} onNavigate={onNavigate} />}
        bgClassName="bg-gradient-to-r from-blue-600 to-blue-800"
        textClassName="text-white"
        borderClassName=""
        paddingClassName="p-6 pb-8"
        fixed
      />

      {/* Removed RestrictedBanner for basic users */}

      <div className="app-container flex-1 px-[9px] py-4 safe-nav-pad space-y-4">
        {/* Warning */}
        <Alert className="bg-amber-100 dark:bg-amber-900/40 border-amber-200/50 dark:border-amber-800/50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-900 dark:text-amber-100">
            <strong>Important:</strong> Language semantics differ. Always verify the converted logic manually 
            and test thoroughly before use.
          </AlertDescription>
        </Alert>

        {/* Language Selection */}
        <Card style={glassCardStyle}>
          <CardHeader>
            <CardTitle className="text-base">Select Languages</CardTitle>
            <CardDescription>Choose source and target platforms</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Source Language</Label>
              <Select value={sourceLang} onValueChange={setSourceLang}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source language" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((platform) => {
                    const isLocked = platform.isElite && !isEliteUser;
                    return (
                      <SelectItem 
                        key={platform.value} 
                        value={platform.value}
                        disabled={isLocked}
                      >
                        <div className="flex items-center gap-2">
                          {platform.label}
                          {isLocked && <span className="text-xs text-amber-500 font-medium">(Elite feature)</span>}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-gray-400" />
            </div>

            <div className="space-y-2">
              <Label>Target Language</Label>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target language" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.filter(p => p.value !== sourceLang).map((platform) => {
                    const isLocked = platform.isElite && !isEliteUser;
                    return (
                      <SelectItem 
                        key={platform.value} 
                        value={platform.value}
                        disabled={isLocked}
                      >
                        <div className="flex items-center gap-2">
                          {platform.label}
                          {isLocked && <span className="text-xs text-amber-500 font-medium">(Elite feature)</span>}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Source Code Input */}
        <Card style={glassCardStyle}>
          <CardHeader>
            <CardTitle className="text-base">Source Code</CardTitle>
            <CardDescription>Paste your code here</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Paste your MQL4, MQL5, or Pine Script code here..."
              rows={12}
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>

        {/* Removed basic-only strategy selection gating; strategy selection optional */}

        {/* Convert Button */}
        {!isProUser ? (
          <Button
            onClick={() => onNavigate('subscription', 'plan-pro')}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
          >
            <Lock className="w-4 h-4 mr-2" />
            Upgrade to Pro to Convert
          </Button>
        ) : (
          <Button
            onClick={handleConvert}
            className="w-full"
            disabled={
              isConverting ||
              !sourceCode.trim() ||
              !sourceLang ||
              !targetLang
            }
          >
            {isConverting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Convert Code
              </>
            )}
          </Button>
        )}

        {/* Converted Code */}
        {convertedCode && (
          <Card style={glassCardStyle}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Converted Code</CardTitle>
                  <CardDescription>
                    {PLATFORMS.find(p => p.value === targetLang)?.label}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={copyCode}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadCode}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[180px] sm:h-[240px] md:h-[300px] lg:h-[360px] w-full rounded-md border border-gray-200 dark:border-gray-700">
                <pre className="p-4 text-xs max-w-full overflow-x-auto">
                  <code className="text-gray-800 dark:text-gray-200 whitespace-pre">
                    {convertedCode}
                  </code>
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Tips */}
        <Card style={glassCardStyle}>
          <CardHeader>
            <CardTitle className="text-sm">Conversion Tips</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-blue-900 dark:text-blue-100 space-y-2">
            <p>• Some platform-specific features may not have direct equivalents</p>
            <p>• Order execution methods differ between MetaTrader and TradingView</p>
            <p>• Always test converted code in a demo environment first</p>
            <p>• Review variable names and function calls for accuracy</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
