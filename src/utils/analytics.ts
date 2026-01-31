
type EventProperties = Record<string, any>;

export const trackEvent = (eventName: string, properties?: EventProperties) => {
  // In a real app, this would send data to Google Analytics, Mixpanel, etc.
  // For now, we'll log to console in development
  if (import.meta.env.DEV) {
    console.log(`[Analytics] ${eventName}`, properties);
  }
  
  // Placeholder for future analytics integration
  // window.gtag('event', eventName, properties);
};
