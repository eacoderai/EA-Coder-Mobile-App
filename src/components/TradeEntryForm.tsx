import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "./ui/select";
import { ArrowLeft, Loader2, Save, Calculator } from "lucide-react";
import { getFunctionUrl } from '../utils/supabase/client';
import { toast } from "../utils/tieredToast";

interface Strategy {
  id: string;
  strategy_name: string;
  strategy_type?: 'automated' | 'manual';
}

interface TradeEntryFormProps {
  onNavigate: (screen: string) => void;
  accessToken: string | null;
}

const SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
  "XAUUSD", "BTCUSD", "US30", "SPX500", "GBPJPV"
];

export function TradeEntryForm({ onNavigate, accessToken }: TradeEntryFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  
  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid hsl(var(--border))',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };
  
  const [formData, setFormData] = useState({
    executed_at: new Date().toISOString().slice(0, 16),
    symbol: "EURUSD",
    direction: "long" as "long" | "short",
    entry_price: "",
    exit_price: "",
    pnl: "",
    notes: "",
    strategy_id: ""
  });

  useEffect(() => {
    loadStrategies();
  }, [accessToken]);

  const loadStrategies = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        getFunctionUrl('make-server-00a119be/strategies'),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        // Include both manual and automated strategies in the dropdown
        setStrategies(data.strategies || []);
      }
    } catch (error) {
      console.error('Failed to load strategies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculatePnL = () => {
    const entry = parseFloat(formData.entry_price);
    const exit = parseFloat(formData.exit_price);
    
    if (isNaN(entry) || isNaN(exit)) return;

    // Simplified PnL calculation (difference * direction)
    // In a real app, this would account for lot size and contract specs
    const diff = formData.direction === 'long' ? exit - entry : entry - exit;
    setFormData(prev => ({ ...prev, pnl: diff.toFixed(5) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    if (!formData.entry_price || !formData.exit_price) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Auto-calculate PnL if not set
    let finalPnl = formData.pnl;
    if (!finalPnl) {
      const entry = parseFloat(formData.entry_price);
      const exit = parseFloat(formData.exit_price);
      const diff = formData.direction === 'long' ? exit - entry : entry - exit;
      finalPnl = diff.toFixed(5);
    }

    setIsSaving(true);
    try {
      // Ensure executed_at is valid ISO string
      let finalExecutedAt = new Date().toISOString();
      if (formData.executed_at) {
        try {
          finalExecutedAt = new Date(formData.executed_at).toISOString();
        } catch (e) {
          console.warn("Invalid date format, using current time");
        }
      }

      const response = await fetch(
        getFunctionUrl('make-server-00a119be/trades'),
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...formData,
            strategy_id: (formData.strategy_id === "" || formData.strategy_id === "none") ? null : formData.strategy_id,
            entry_price: parseFloat(formData.entry_price),
            exit_price: parseFloat(formData.exit_price),
            pnl: parseFloat(finalPnl),
            executed_at: finalExecutedAt
          })
        }
      );

      if (response.ok) {
        toast.success("Trade logged successfully");
        onNavigate('journal');
      } else {
        let errorMessage = "Failed to save trade";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        toast.error(errorMessage);
      }
    } catch (error: any) {
      console.error('Failed to save trade:', error);
      toast.error(error.message || "An error occurred while saving");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-10">
      {/* Header */}
      <div 
        className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 rounded-b-[30px]"
        style={{ borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }}
      >
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => onNavigate('journal')}
            className="rounded-full text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Log New Trade</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-4 py-6">
        <div className="space-y-6 p-4" style={glassCardStyle}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="executed_at" className="text-gray-900 dark:text-white">Date & Time</Label>
              <Input 
                id="executed_at"
                type="datetime-local"
                value={formData.executed_at}
                onChange={e => setFormData(prev => ({ ...prev, executed_at: e.target.value }))}
                required
                style={{ borderRadius: '30px' }}
                className="bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="symbol" className="text-gray-900 dark:text-white">Symbol</Label>
              <Select 
                value={formData.symbol} 
                onValueChange={v => setFormData(prev => ({ ...prev, symbol: v }))}
              >
                <SelectTrigger 
                  id="symbol" 
                  className="pl-4 bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white"
                  style={{ borderRadius: '30px' }}
                >
                  <SelectValue placeholder="Select symbol" />
                </SelectTrigger>
                <SelectContent>
                  {SYMBOLS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900 dark:text-white">Direction</Label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-[30px]">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, direction: 'long' }))}
                className={`py-2 text-sm font-semibold rounded-md transition-all ${
                  formData.direction === 'long' 
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                    : 'text-gray-500'
                }`}
              >
                Long
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, direction: 'short' }))}
                className={`py-2 text-sm font-semibold rounded-md transition-all ${
                  formData.direction === 'short' 
                    ? 'bg-white dark:bg-gray-700 text-red-600 shadow-sm' 
                    : 'text-gray-500'
                }`}
              >
                Short
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entry_price" className="text-gray-900 dark:text-white">Entry Price</Label>
              <Input 
                id="entry_price"
                type="number"
                step="any"
                placeholder="1.0850"
                value={formData.entry_price}
                onChange={e => setFormData(prev => ({ ...prev, entry_price: e.target.value }))}
                required
                style={{ borderRadius: '30px' }}
                className="bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exit_price" className="text-gray-900 dark:text-white">Exit Price</Label>
              <Input 
                id="exit_price"
                type="number"
                step="any"
                placeholder="1.0920"
                value={formData.exit_price}
                onChange={e => setFormData(prev => ({ ...prev, exit_price: e.target.value }))}
                required
                style={{ borderRadius: '30px' }}
                className="bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pnl" className="text-gray-900 dark:text-white">PnL (Profit/Loss)</Label>
              <button
                type="button"
                onClick={calculatePnL}
                className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 transition-colors hover:bg-blue-100"
                style={{ borderRadius: '30px' }}
              >
                <Calculator className="w-3 h-3" />
                AUTO
              </button>
            </div>
            <Input 
              id="pnl"
              type="number"
              step="any"
              placeholder="0.00"
              value={formData.pnl}
              onChange={e => setFormData(prev => ({ ...prev, pnl: e.target.value }))}
              required
              style={{ borderRadius: '30px' }}
              className="bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="strategy_id" className="text-gray-900 dark:text-white">Link to Strategy (Optional)</Label>
            <Select 
              value={formData.strategy_id} 
              onValueChange={v => setFormData(prev => ({ ...prev, strategy_id: v }))}
            >
              <SelectTrigger 
                id="strategy_id" 
                className="pl-4 bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white"
                style={{ borderRadius: '30px' }}
              >
                <SelectValue placeholder={isLoading ? "Loading plans..." : "Which plan did you follow?"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None / No specific plan</SelectItem>
                {strategies.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.strategy_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-gray-900 dark:text-white">Notes (Optional)</Label>
            <Textarea 
              id="notes"
              placeholder="e.g. Entered on RSI bounce, followed trend..."
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="min-h-[100px] resize-none bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500"
              style={{ borderRadius: '30px' }}
            />
          </div>
        </div>

        <Button 
          type="submit" 
          disabled={isSaving}
          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-lg font-bold shadow-lg shadow-blue-500/20 mt-8 mb-10"
        >
          {isSaving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Save className="mr-2 w-5 h-5" />
              Save Trade
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
