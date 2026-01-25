export const MAJOR_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"];
export const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
export const MULTI_CURRENCY_LABEL = 'Multi-Currency (Majors)';

export function buildBacktestPayload(
  description: string,
  instrument: string | undefined,
  startDate: Date,
  endDate: Date
) {
  return {
    backtest: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      pairs: !instrument || instrument === MULTI_CURRENCY_LABEL ? MAJOR_PAIRS : [instrument],
      metrics: [
        'sharpe',
        'max_drawdown',
        'win_rate',
        'equity_curve',
        'trade_log'
      ],
      rules_hint: description,
    }
  };
}