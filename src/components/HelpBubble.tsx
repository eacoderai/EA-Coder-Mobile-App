import React from "react";
import { MessageCircleQuestion } from "lucide-react";
import { Button } from "./ui/button";
import { trackEvent } from "../utils/analytics";

export interface HelpBubbleProps {
  className?: string;
  activeTab?: string;
  onNavigate?: (screen: string) => void;
}

export const HelpBubble: React.FC<HelpBubbleProps> = ({ className, activeTab = "home", onNavigate }) => {

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    trackEvent("help_bubble_clicked", { context: activeTab });
    if (onNavigate) {
      onNavigate('help-center');
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes float-bubble {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
          @keyframes pulse-bubble {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
          }
          .help-bubble-wrapper {
            animation: float-bubble 3s ease-in-out infinite, pulse-bubble 2s ease-in-out infinite;
          }
        `}
      </style>
      <div 
        className="fixed z-[9999] flex items-center justify-center help-bubble-wrapper"
        style={{ 
          bottom: 'calc(4rem + 12px + env(safe-area-inset-bottom, 0px))',
          right: '1rem'
        }}
      >
        <div className="relative w-14 h-14">
          <div 
            className="absolute inset-0 w-full h-full" 
            style={{
              backdropFilter: 'blur(10px)',
              backgroundColor: 'rgba(37, 99, 235, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: 'rgba(37, 99, 235, 0.37) 0px 8px 32px 0px',
              borderRadius: '50%',
              transform: 'none',
              transformOrigin: '50% 50% 0px',
              opacity: 1
            }}
          />
          <Button
            type="button"
            className="relative z-10 rounded-full w-14 h-14 bg-transparent hover:bg-white/10 text-white transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center pointer-events-auto focus:outline-none focus:shadow-[0_0_0_4px_rgba(37,99,235,0.4)]"
            aria-label="Open Help Center"
            onClick={handleClick}
          >
            <MessageCircleQuestion className="w-7 h-7" />
          </Button>
        </div>
      </div>
    </>
  );
};
