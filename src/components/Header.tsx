import React from "react";
import { Button } from "./ui/button";
import { ArrowLeft } from "lucide-react";

export type HeaderAction = {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  variant?: "ghost" | "outline" | "default" | "secondary" | "destructive" | "link";
  disabled?: boolean;
  className?: string;
};

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backAriaLabel?: string;
  leadingIcon?: React.ReactNode;
  leftActions?: HeaderAction[];
  rightActions?: HeaderAction[];
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  titleRightContent?: React.ReactNode;
  bgClassName?: string;
  textClassName?: string;
  className?: string;
  sticky?: boolean;
  rounded?: boolean;
  borderClassName?: string;
  paddingClassName?: string;
}

export function Header({
  title,
  subtitle,
  onBack,
  backAriaLabel,
  leadingIcon,
  leftActions,
  rightActions,
  leftContent,
  rightContent,
  titleRightContent,
  bgClassName = "bg-gradient-to-r from-blue-600 to-blue-800",
  textClassName = "text-white",
  className = "",
  sticky = true,
  rounded = true,
  borderClassName = "",
  paddingClassName = "p-6",
}: HeaderProps) {
  const safeTitle = typeof title === "string" && title.trim() ? title : "";
  const safeSubtitle = typeof subtitle === "string" && subtitle.trim() ? subtitle : "";
  const containerClasses = [
    sticky ? "sticky top-0 z-50" : "",
    bgClassName,
    textClassName,
    borderClassName,
    paddingClassName,
    rounded ? "rounded-b-[30px]" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const renderAction = (a: HeaderAction, key: number) => (
    <Button
      key={key}
      variant={a.variant || "outline"}
      onClick={() => {
        try {
          a.onClick && a.onClick();
        } catch {}
      }}
      aria-label={a.ariaLabel || a.label || "Action"}
      disabled={a.disabled}
      className={a.className}
    >
      {a.icon}
      {a.label && <span className="ml-2">{a.label}</span>}
    </Button>
  );

  return (
    <div role="region" aria-label={safeTitle || "Header"} className={containerClasses} style={rounded ? { borderBottomLeftRadius: 30, borderBottomRightRadius: 30 } : undefined}>
      <div className="app-container flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label={backAriaLabel || "Go back"}
              className="mr-1 text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          {leadingIcon && <div className="p-2 bg-white/20 rounded-lg">{leadingIcon}</div>}
          {leftContent}
          {(safeTitle || safeSubtitle) && (
            <div>
              {safeTitle && (
                <div className="flex items-center gap-2">
                  <h1 className="text-lg">{safeTitle}</h1>
                  {titleRightContent}
                </div>
              )}
              {safeSubtitle && <p className="text-xs opacity-80">{safeSubtitle}</p>}
            </div>
          )}
          {Array.isArray(leftActions) && leftActions.length > 0 && (
            <div className="ml-2 flex items-center gap-2">{leftActions.map(renderAction)}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rightContent}
          {Array.isArray(rightActions) && rightActions.length > 0 && (
            <div className="flex items-center gap-2">{rightActions.map(renderAction)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
