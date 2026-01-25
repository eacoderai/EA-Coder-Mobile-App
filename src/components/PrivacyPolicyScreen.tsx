import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

interface PrivacyPolicyScreenProps {
  onNavigate: (screen: string) => void;
}

export function PrivacyPolicyScreen({ onNavigate }: PrivacyPolicyScreenProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 sticky top-0 z-10">
          <div className="app-container flex items-center">
            <Button variant="ghost" size="icon" onClick={() => onNavigate('profile')} className="mr-3">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg text-gray-900 dark:text-white">Privacy & Security</h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">Learn how we protect your data</p>
            </div>
          </div>
        </div>

        <div className="app-container flex-1 p-4 space-y-4">
          <div className="text-sm text-gray-800 dark:text-gray-200 space-y-3">
            <p>Your privacy matters. EA Coder uses industry-standard encryption and secure storage practices to protect your account and strategies.</p>
            <p>We do not sell your data. Access is limited to necessary service operations, and you can request data deletion at any time.</p>
            <p>For detailed information, contact support via the Subscription page.</p>
          </div>
        </div>
      </div>
  );
}
