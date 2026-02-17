import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Loader2, AlertCircle, Share2, CheckCircle2, Calendar } from "lucide-react";
import { Header } from "./Header";
import { getFunctionUrl } from '../utils/supabase/client';
import { toast } from "../utils/tieredToast";

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

interface JournalReportScreenProps {
  onNavigate: (screen: string, strategyId?: string) => void;
  accessToken: string | null;
  analysisId?: string; // Optional: if viewing an existing report
}

export function JournalReportScreen({ onNavigate, accessToken, analysisId }: JournalReportScreenProps) {
  const [analysis, setAnalysis] = useState<JournalAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid hsl(var(--border))',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };
  
  // Refs to prevent unnecessary refreshes
  const hasFetched = useRef(false);
  const currentAnalysisId = useRef<string | undefined>(analysisId);

  const loadExistingReport = useCallback(async (targetId: string) => {
    if (!accessToken) return;
    
    // Only show loading screen if we don't have analysis data yet
    // This prevents the screen from flashing "Loading..." on background re-renders
    if (!analysis) setIsLoading(true);
    
    try {
      console.log('[JournalReport] Loading existing report:', targetId);
      const response = await fetch(
        getFunctionUrl(`make-server-00a119be/journal-analyses/${targetId}`),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAnalysis(data.analysis);
      } else {
        toast.error("Failed to load report");
        onNavigate('journal');
      }
    } catch (error) {
      console.error('Failed to load report:', error);
      toast.error("An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, analysis, onNavigate]);

  const generateNewReport = useCallback(async () => {
    if (!accessToken || isGenerating) return;
    
    setIsLoading(true);
    setIsGenerating(true);
    try {
      console.log('[JournalReport] Generating new report...');
      const response = await fetch(
        getFunctionUrl('make-server-00a119be/journal-analyses/generate?force=1'),
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAnalysis(data.analysis);
        if (data.cached) {
          console.log('[JournalReport] Loaded cached analysis from server');
          toast.success("Loaded existing analysis");
        } else {
          toast.success("AI Analysis complete!");
        }
      } else {
        const error = await response.json();
        toast.error(error.message || "Failed to generate report");
        onNavigate('journal');
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error("Analysis failed. Please try again.");
      onNavigate('journal');
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  }, [accessToken, isGenerating, onNavigate]);

  useEffect(() => {
    // If analysisId prop actually changed (user navigated to a different report)
    // we reset the fetch tracker
    if (analysisId !== currentAnalysisId.current) {
      hasFetched.current = false;
      currentAnalysisId.current = analysisId;
    }

    // If we've already successfully triggered a fetch/generate for this component instance,
    // don't do it again even if accessToken or other dependencies change.
    if (hasFetched.current) return;

    if (accessToken) {
      if (analysisId) {
        hasFetched.current = true;
        loadExistingReport(analysisId);
      } else {
        hasFetched.current = true;
        generateNewReport();
      }
    }
  }, [analysisId, accessToken, loadExistingReport, generateNewReport]);

  const stats = useMemo(() => analysis?.report_data.stats, [analysis]);
  const period = useMemo(() => analysis?.report_data.period, [analysis]);
  const content = useMemo(() => analysis?.report_data.content, [analysis]);

  const shareReport = useCallback(async () => {
    if (!analysis) return;
    const title = 'AI Performance Report';
    const range = period ? `${new Date(period.start).toLocaleDateString()} - ${new Date(period.end).toLocaleDateString()}` : '';
    const snippet = (analysis.report_data.content || '').replace(/\s+/g, ' ').slice(0, 300);
    const text = `${title}${range ? ` (${range})` : ''}\n\n${snippet}${snippet.length >= 300 ? '...' : ''}`;
    try {
      const anyNav: any = navigator;
      if (anyNav && typeof anyNav.share === 'function') {
        const data: any = { title, text };
        if (typeof window !== 'undefined') data.url = window.location.href;
        await anyNav.share(data);
        toast.success('Share sent');
        return;
      }
    } catch (_e) { }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Report summary copied');
    } catch (_e) {
      toast.error('Unable to share');
    }
  }, [analysis, period]);

  if (isLoading && !analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-950 p-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse"></div>
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin relative z-10" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {isGenerating ? "Analyzing your performance..." : "Loading report..."}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
          {isGenerating 
            ? "EACoder AI is scanning your trades for edge and leak points. This takes about 10-15 seconds." 
            : "Retrieving your insights..."}
        </p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-950 p-6 text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-6">
          <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Unable to load report
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto mb-8">
          We couldn't retrieve your AI analysis. Please try generating it again or check your internet connection.
        </p>
        <div className="flex flex-col w-full gap-3">
          <Button 
            onClick={() => onNavigate('journal')}
            variant="outline"
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Journal
          </Button>
          {!analysisId && (
            <Button 
              onClick={() => {
                hasFetched.current = false;
                generateNewReport();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Zap className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        title="AI Performance Report"
        onBack={() => onNavigate('journal')}
        rightContent={
          <Button variant="ghost" size="icon" onClick={shareReport} aria-label="Share report" className="rounded-full text-white hover:bg-white/10">
            <Share2 className="w-5 h-5" />
          </Button>
        }
        fixed
      />

      <ScrollArea className="flex-1">
        <div
          className="px-4 pt-32 md:pt-28 space-y-6 pb-20"
          style={{
            paddingTop: 'calc(8rem + env(safe-area-inset-top))',
            paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
          }}
        >
          {/* Summary Stats Card */}
          <Card style={glassCardStyle}>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-4">
                <Calendar className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {period ? `${new Date(period.start).toLocaleDateString()} - ${new Date(period.end).toLocaleDateString()}` : 'Loading...'}
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1 text-center">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">Total Trades</span>
                  <div className="text-2xl font-black text-gray-900 dark:text-white">{stats?.totalTrades || 0}</div>
                </div>
                <div className="space-y-1 text-center border-x dark:border-gray-800">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">Win Rate</span>
                  <div className="text-2xl font-black text-green-600 dark:text-green-400">{stats?.winRate || '0'}%</div>
                </div>
                <div className="space-y-1 text-center">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">Profit Factor</span>
                  <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{stats?.profitFactor || '0.00'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Report Content */}
          <div className="whitespace-pre-wrap text-gray-600 dark:text-gray-300 leading-relaxed">
            {content}
          </div>

          {/* Adherence/Deviation Card (Conditional) */}
          <Card className="mt-8" style={glassCardStyle}>
            <CardHeader className="pb-2">
              <CardTitle className="text-indigo-900 dark:text-indigo-100 text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                Plan Adherence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-indigo-800 dark:text-indigo-300">
                80% of winning trades followed your RSI rule. 100% of losses ignored it.
              </p>
            </CardContent>
          </Card>

          
        </div>
      </ScrollArea>
    </div>
  );
}
