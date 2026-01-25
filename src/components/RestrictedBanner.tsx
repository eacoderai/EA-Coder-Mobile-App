import { useEffect, useState } from 'react';
import { Crown, ShieldAlert, X } from 'lucide-react';

interface RestrictedBannerProps {
  onNavigate: (screen: string) => void;
  remainingFree?: number;
}

export function RestrictedBanner({ onNavigate, remainingFree }: RestrictedBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    console.log('[RestrictedBanner] mounted'); // log 1
  }, []);

  if (dismissed) return null;

  const handleGoToSubscription = () => {
    console.log('[RestrictedBanner] navigate to subscription'); // log 2
    onNavigate('subscription');
  };

  const handleDismiss = () => {
    console.log('[RestrictedBanner] dismissed'); // log 3
    setDismissed(true);
  };

  return (
    <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Pro plan required to use this feature. Complete subscription to unlock full access.
            </p>
            {typeof remainingFree === 'number' && (
              <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                {remainingFree > 0
                  ? `${remainingFree} of 1 free EA generation remaining on Free plan.`
                  : 'You have used your 1 free EA Generation — upgrade for more strategy creation and weekly analysis.'}
              </p>
            )}
            <button
              onClick={handleGoToSubscription}
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline"
            >
              <Crown className="w-4 h-4" /> Go to Subscription
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-yellow-700 dark:text-yellow-300 hover:text-yellow-900"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}