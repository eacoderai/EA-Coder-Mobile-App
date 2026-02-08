import React from "react";
import { Home, BarChart3, MessageSquare, RefreshCw, User } from "lucide-react";
import { motion } from "motion/react";

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: "home", label: "Home", icon: Home },
    { id: "analyze", label: "Analysis", icon: BarChart3 },
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "convert", label: "Convert", icon: RefreshCw },
    { id: "profile", label: "Profile", icon: User },
  ];

  const glassNavStyle: React.CSSProperties = {
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderTop: '1px solid rgba(255, 255, 255, 0.15)',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.3)',
    width: '100%',
  };

  const glassBubbleStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
    borderRadius: '50%',
  };

  return (
    <div className="nav-wrapper" style={{ backgroundColor: 'transparent' }}>
      <nav
        className="bottom-nav bg-transparent"
        role="navigation"
        aria-label="Main navigation"
      >
        <div
          className="flex items-center justify-around h-16 max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto"
          style={glassNavStyle}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  isActive ? "text-white" : "text-white/60 hover:text-white/80"
                }`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
              >
                <div className="relative flex items-center justify-center w-10 h-10 mb-1">
                  {isActive && (
                    <motion.div
                      layoutId="nav-bubble"
                      className="absolute inset-0 w-full h-full"
                      style={glassBubbleStyle}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <Icon className="w-5 h-5 relative z-10" />
                </div>
                <span className="text-xs">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
