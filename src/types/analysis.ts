export interface StrategyCreateRequest {
  strategy_name: string;
  description: string;
  risk_management?: string;
  instrument?: string;
  // Canonical instrument or multi-currency label chosen for analysis display
  analysis_instrument?: string;
  platform: string;
  indicators?: string[];
  indicator_mode?: 'single' | 'multiple';
}

export interface StrategyCreateResponse {
  strategyId: string;
}

// Optional backtest results integrated into analysis output
export interface BacktestResults {
  equityCurve: { date: string; equity: number }[];
  trades: Array<{
    pair: string;
    entryDate: string; exitDate: string;
    entryPrice: number; exitPrice: number;
    pnl: number; returnPct: number;
  }>;
  metrics: {
    sharpe: number; maxDrawdownPct: number; winRatePct: number; totalReturnPct: number; profitFactor?: number; tStatistic?: number; pValue?: number;
  };
  comparisons?: Array<{
    pair: string; sharpe: number; maxDrawdownPct: number; winRatePct: number; totalReturnPct: number; profitFactor?: number;
  }>;
  walkforward?: Array<{ window: number; trades: number; returnPct: number; sharpe: number }>;
}

export interface AnalysisMetrics {
  win_rate?: number; // percent 0-100
  total_trades?: number;
  profit_factor?: number;
  max_drawdown?: number; // percent 0-100
  expected_return?: number; // percent 0-100
  [key: string]: unknown;
}

export interface StrategyRecord {
  id?: string;
  strategy_name?: string;
  description?: string;
  instrument?: string;
  platform?: string;
  // Store the user-selected instrument for analysis UI (may be multi-currency label)
  analysis_instrument?: string;
  indicators?: string[];
  indicator_mode?: 'single' | 'multiple';
  analysis?: {
    metrics?: AnalysisMetrics;
    improvements?: string[];
    backtest?: BacktestResults; // Optional backtest payload when available
  };
  generated_code?: string;
}

export interface CodeVersion {
  id: string;
  code: string;
  timestamp: string;
}

export interface AnalysisNotification {
  type: 'analysis_update';
  strategyId: string | number;
  improvements: string[];
  timestamp: string;
}

export interface ApiError extends Error {
  status?: number;
  statusText?: string;
  bodyPreview?: string;
}
