import React from "react";

type Props = {
  children: React.ReactNode;
  debug?: boolean;
};

/**
 * MobileContainer
 * - Safe-area aware, responsive container for mobile and tablet.
 * - Uses modern viewport units to avoid iOS Safari 100vh issues.
 * - Adds bottom padding equal to bottom nav height + safe area.
 */
export default function MobileContainer({ children, debug }: Props) {
  const isDev = import.meta.env.DEV;
  const showDebug = debug ?? isDev;

  return (
    <div className="mobile-container" data-debug={showDebug ? "true" : "false"}>
      <div className="mobile-scroll no-scrollbar">{children}</div>
    </div>
  );
}