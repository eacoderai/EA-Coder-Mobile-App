import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

interface TermsScreenProps {
  onNavigate: (screen: string) => void;
}

export function TermsScreen({ onNavigate }: TermsScreenProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 sticky top-0 z-10">
          <div className="app-container flex items-center">
            <Button variant="ghost" size="icon" onClick={() => onNavigate('profile')} className="mr-3">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg text-gray-900 dark:text-white">Terms & Conditions</h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">EA Coder usage and limitations</p>
            </div>
          </div>
        </div>

        <div className="app-container flex-1 p-4 space-y-4">
          <div className="text-sm text-gray-800 dark:text-gray-200 space-y-3">
            <p>EA Coder generates code for educational and research purposes. Trading involves risk. You are responsible for testing strategies thoroughly in demo environments before real use.</p>
            <p>By using EA Coder, you agree to comply with platform terms (MetaTrader, TradingView) and local regulations.</p>
            <p>Pro and Elite features are subject to Fair Use policies and service availability.</p>
          </div>
        </div>
      </div>
  );
}
