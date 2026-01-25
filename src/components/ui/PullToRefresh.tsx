import React, { useState, useRef, useEffect } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { cn } from './utils';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const PULL_THRESHOLD = 80; // Pixels to pull to trigger refresh
  const MAX_PULL = 120; // Max pixels to visually pull

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && !isRefreshing) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === 0 || isRefreshing) return;
    
    const y = e.touches[0].clientY;
    const diff = y - startY;
    
    // Only allow pulling if we are at the top and pulling down
    if (window.scrollY === 0 && diff > 0) {
      // Add resistance
      const damped = Math.min(diff * 0.5, MAX_PULL);
      setCurrentY(damped);
      setPullProgress(Math.min(damped / PULL_THRESHOLD, 1));
      
      // Prevent default pull-to-refresh behavior from browser if we are handling it
      // Note: e.preventDefault() might not work in passive listeners, but we try
      if (e.cancelable && diff < PULL_THRESHOLD * 2) {
         // e.preventDefault(); 
      }
    }
  };

  const handleTouchEnd = async () => {
    if (startY === 0 || isRefreshing) return;

    if (currentY >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      setCurrentY(PULL_THRESHOLD); // Snap to threshold
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setCurrentY(0);
        setPullProgress(0);
      }
    } else {
      // Snap back
      setCurrentY(0);
      setPullProgress(0);
    }
    setStartY(0);
  };

  return (
    <div 
      className={cn("relative min-h-full", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      ref={contentRef}
    >
      {/* Refresh Indicator */}
      <div 
        className="absolute left-0 right-0 flex justify-center items-center pointer-events-none z-10"
        style={{ 
          top: 0,
          height: currentY > 0 ? currentY : 0,
          opacity: Math.min(pullProgress, 1),
          transition: isRefreshing ? 'height 0.2s ease' : 'none',
          overflow: 'hidden'
        }}
      >
        <div className="flex items-center justify-center w-8 h-8 bg-white dark:bg-gray-800 rounded-full shadow-md border border-gray-100 dark:border-gray-700">
          {isRefreshing ? (
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          ) : (
            <ArrowDown 
              className="w-5 h-5 text-blue-600 transition-transform duration-200" 
              style={{ transform: `rotate(${pullProgress * 180}deg)` }} 
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div 
        style={{ 
          transform: `translateY(${currentY}px)`,
          transition: isRefreshing ? 'transform 0.2s ease' : 'transform 0.1s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
}
