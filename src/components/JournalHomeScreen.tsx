import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { 
  Plus, 
  Upload, 
  FileText, 
  TrendingUp, 
  Activity, 
  ArrowRight, 
  Loader2, 
  Calendar,
  LayoutDashboard,
  ArrowLeft,
  Trash
} from "lucide-react";
import { getFunctionUrl } from '../utils/supabase/client';
import { Tier } from "../types/user";
import { NotificationBell } from "./ui/NotificationBell";
import { Header } from "./Header";
import { PullToRefresh } from "./ui/PullToRefresh";
import { toast } from "../utils/tieredToast";
import { apiFetch } from "../utils/api";

interface Trade {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  pnl: number;
  executed_at: string;
}

interface JournalAnalysis {
  id: string;
  report_data: {
    content: string;
    stats: {
      totalTrades: number;
      winRate: string;
      profitFactor: string;
      grossProfit: string;
      grossLoss: string;
    };
    period: {
      start: string;
      end: string;
    };
  };
  trades_count: number;
  created_at: string;
}

interface JournalHomeScreenProps {
  onNavigate: (screen: string, analysisId?: string) => void;
  accessToken: string | null;
  tier: Tier;
}

export function JournalHomeScreen({ onNavigate, accessToken, tier }: JournalHomeScreenProps) {
  const [analyses, setAnalyses] = useState<JournalAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tradesCount, setTradesCount] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid hsl(var(--border))',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };
  
  // Ref to prevent subsequent refresh sessions on re-renders
  const hasFetched = React.useRef(false);

  useEffect(() => {
    if (!hasFetched.current && accessToken) {
      loadJournalData();
      hasFetched.current = true;
    }
  }, [accessToken]);

  const loadJournalData = async (showLoadingState = true) => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    
    if (showLoadingState) {
      setIsLoading(true);
    }

    try {
      // Fetch past analyses
      const analysesResponse = await fetch(
        getFunctionUrl('make-server-00a119be/journal-analyses'),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (analysesResponse.ok) {
        const data = await analysesResponse.json();
        setAnalyses(data.analyses || []);
      }

      // Fetch trades count to check for analysis trigger (>= 5 trades)
      const tradesResponse = await fetch(
        getFunctionUrl('make-server-00a119be/trades/count'),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (tradesResponse.ok) {
        const data = await tradesResponse.json();
        setTradesCount(data.count || 0);
      }

    } catch (error) {
      console.error('Failed to load journal data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !accessToken) return;

    setSelectedFileName(file.name);
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const trades = parseCSV(text);
      
      if (trades.length === 0) {
        toast.error("No valid trades found in CSV");
        setIsLoading(false);
        return;
      }

      try {
        let successCount = 0;
        for (const trade of trades) {
          const response = await fetch(
            getFunctionUrl('make-server-00a119be/trades'),
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(trade)
            }
          );
          if (response.ok) successCount++;
        }
        
        toast.success(`Successfully imported ${successCount} trades`);
        loadJournalData(false);
      } catch (error) {
        console.error("CSV Import error:", error);
        toast.error("Failed to import trades");
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const trades: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < 3) continue;

      const trade: any = {};
      
      // Basic heuristic mapping for common headers (IBKR, OANDA, MT5)
      headers.forEach((h, idx) => {
        const val = values[idx];
        if (!val) return;

        if (h.includes('symbol') || h.includes('ticker') || h.includes('instrument')) trade.symbol = val;
        if (h.includes('type') || h.includes('direction') || h.includes('side')) {
          const lowerVal = val.toLowerCase();
          trade.direction = lowerVal.includes('buy') || lowerVal.includes('long') || lowerVal === 'l' ? 'long' : 'short';
        }
        if (h.includes('entry') || h.includes('open price') || h.includes('price')) {
          if (!trade.entry_price) trade.entry_price = parseFloat(val);
        }
        if (h.includes('exit') || h.includes('close price')) trade.exit_price = parseFloat(val);
        if (h.includes('pnl') || h.includes('profit') || h.includes('amount')) trade.pnl = parseFloat(val);
        if (h.includes('date') || h.includes('time')) {
          try { trade.executed_at = new Date(val).toISOString(); } catch { void 0; }
        }
        if (h.includes('note') || h.includes('comment')) trade.notes = val;
      });

      // Fallbacks and defaults
      if (!trade.direction && values[1]) {
        const lowerVal = values[1].toLowerCase();
        trade.direction = lowerVal.includes('buy') || lowerVal.includes('long') ? 'long' : 'short';
      }
      if (trade.entry_price && !trade.exit_price) trade.exit_price = trade.entry_price; // placeholder
      if (trade.pnl === undefined) trade.pnl = 0;

      if (trade.symbol && trade.direction) {
        trades.push(trade);
      }
    }
    return trades;
  };

  const renderAnalysesSection = () => {
    if (isLoading && !hasFetched.current) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-gray-500">EACoder AI is loading your trade history...</p>
        </div>
      );
    }
    if (analyses.length > 0) {
      return (
        <div className="space-y-3">
                {analyses.map((analysis) => (
                  <SwipeToDelete key={analysis.id} onDelete={() => deleteAnalysis(analysis.id)}>
                    <Card style={glassCardStyle} className="overflow-hidden hover:border-blue-300 dark:hover:border-blue-900 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {new Date(analysis.report_data.period.start).toLocaleDateString()} - {new Date(analysis.report_data.period.end).toLocaleDateString()}
                            </span>
                          </div>
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-none">
                            Win Rate: {analysis.report_data.stats.winRate}%
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t dark:border-gray-800">
                          <div className="flex gap-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-gray-500 uppercase font-bold">Profit Factor</span>
                              <span className="text-sm font-bold text-gray-900 dark:text-white">{analysis.report_data.stats.profitFactor}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] text-gray-500 uppercase font-bold">Total Trades</span>
                              <span className="text-sm font-bold text-gray-900 dark:text-white">{analysis.report_data.stats.totalTrades}</span>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate('journal-report', analysis.id);
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-0 h-auto font-bold"
                          >
                            View Report
                            <ArrowRight className="ml-1 w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </SwipeToDelete>
                ))}
        </div>
      );
    }
    return (
      <Card style={glassCardStyle} className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-full mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No analyses yet</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[200px]">
            Log at least 5 trades to generate your first AI performance report.
          </p>
        </CardContent>
      </Card>
    );
  };

  const SwipeToDelete: React.FC<{
    onDelete: () => Promise<void> | void;
    children: React.ReactNode;
  }> = ({ onDelete, children }) => {
    const [dragX, setDragX] = useState(0);
    const [startX, setStartX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const threshold = 80;
    const maxReveal = 120;
    
    const reset = () => {
      setDragX(0);
      setIsDragging(false);
      setStartX(null);
    };
    
    const onTouchStart = (e: React.TouchEvent) => {
      setStartX(e.touches[0].clientX);
      setIsDragging(true);
    };
    const onTouchMove = (e: React.TouchEvent) => {
      if (!isDragging || startX === null) return;
      const delta = e.touches[0].clientX - startX;
      if (delta < 0) {
        setDragX(Math.max(delta, -maxReveal));
      } else {
        setDragX(0);
      }
    };
    const onTouchEnd = async () => {
      if (dragX <= -threshold) {
        const ok = typeof window !== 'undefined' ? window.confirm('Delete this report?') : true;
        if (ok) await onDelete();
      }
      reset();
    };
    const onMouseDown = (e: React.MouseEvent) => {
      setStartX(e.clientX);
      setIsDragging(true);
      // Prevent text selection while dragging
      e.preventDefault();
    };
    const onMouseMove = (e: React.MouseEvent) => {
      if (!isDragging || startX === null) return;
      const delta = e.clientX - startX;
      if (delta < 0) {
        setDragX(Math.max(delta, -maxReveal));
      } else {
        setDragX(0);
      }
    };
    const onMouseUp = async () => {
      if (dragX <= -threshold) {
        const ok = typeof window !== 'undefined' ? window.confirm('Delete this report?') : true;
        if (ok) await onDelete();
      }
      reset();
    };
    
    return (
      <div
        className="relative rounded-xl overflow-hidden touch-pan-y select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={isDragging ? onMouseUp : undefined}
      >
        <div className="absolute inset-0 flex items-center justify-end pr-4 bg-red-50 dark:bg-red-900/30">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
            <span>Delete</span>
            <Trash className="w-5 h-5" />
          </div>
        </div>
        <div
          className="relative will-change-transform"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: isDragging ? 'none' : 'transform 200ms ease',
          }}
        >
          {children}
        </div>
      </div>
    );
  };

  const deleteAnalysis = async (id: string) => {
    if (!accessToken) {
      toast.info('Please sign in again to delete reports.');
      return;
    }
    try {
      await apiFetch(`make-server-00a119be/journal-analyses/${id}`, {
        method: 'DELETE',
        accessToken,
        retries: 0,
        toast: 'never',
      });
      setAnalyses(prev => prev.filter(a => a.id !== id));
      toast.success('Report deleted');
    } catch (e: any) {
      const status = e?.status;
      if (status === 404 || status === 405) {
        toast.error('Delete endpoint not available on server yet.');
      } else if (status === 403) {
        // No upsell toast by convention
      } else {
        toast.error('Failed to delete report');
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header
        title="AI Trade Journal"
        subtitle="Professional performance analysis"
        onBack={() => onNavigate('home')}
        leadingIcon={<LayoutDashboard className="w-5 h-5 text-white" />}
        rightContent={<NotificationBell accessToken={accessToken} onNavigate={onNavigate} />}
        fixed
      />

      <div
        className="h-full overflow-auto pt-32 md:pt-28"
        style={{
          paddingTop: 'calc(8rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
        }}
      >
        <PullToRefresh 
          className="flex-1 overflow-hidden"
          onRefresh={() => {
            hasFetched.current = true;
            return loadJournalData(false);
          }}
        >
          <div className="pb-20">
            <input 
               type="file" 
               ref={fileInputRef} 
               onChange={handleFileUpload} 
               accept=".csv" 
               className="hidden" 
             />
    
             <div className="px-4 py-6 space-y-4 md:space-y-6">
              <Card style={glassCardStyle}>
                <CardHeader>
                  <CardTitle className="text-gray-900 dark:text-white">AI Trade Journal Analyzer</CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    Upload your trades. Get AI insights on your edge, leaks, and optimizations.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      onClick={() => onNavigate('journal-entry')}
                      className="h-auto py-4 flex-col gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                    >
                      <Plus className="w-6 h-6" />
                      <span className="font-semibold pl-1">Log Trade</span>
                    </Button>
                    <Button 
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="h-auto py-4 flex-col gap-2 rounded-2xl border-gray-200/50 dark:border-gray-700"
                    >
                      <Upload className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      <span className="font-semibold pl-1">Upload CSV</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {tradesCount >= 5 && (
                <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 border-none text-white overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Activity size={80} />
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Ready for AI Analysis
                    </CardTitle>
                    <CardDescription className="text-blue-100">
                      You have {tradesCount} new trades logged.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      onClick={() => {
                        onNavigate('journal-report');
                      }}
                      variant="secondary" 
                      className="w-full bg-white text-blue-600 hover:bg-blue-50 font-bold"
                    >
                      <span className="pl-1">Generate AI Report</span>
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card style={glassCardStyle}>
                <CardContent className="space-y-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-1">
                    Selected CSV Folder/File
                  </label>
                  <Input 
                    readOnly 
                    value={selectedFileName || "No folder selected"} 
                    style={{ borderRadius: '30px' }}
                    className="bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 pointer-events-none"
                    placeholder="No folder selected"
                  />
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Past Analyses</h3>
                  {analyses.length > 0 && (
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {analyses.length} REPORTS
                    </Badge>
                  )}
                </div>
                {renderAnalysesSection()}
              </div>
              </div>
          </div>
        </PullToRefresh>
      </div>
    </div>
  );
}
