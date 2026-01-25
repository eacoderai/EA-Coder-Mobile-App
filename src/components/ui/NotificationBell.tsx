import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getFunctionUrl } from "../../utils/supabase/client";

interface NotificationBellProps {
  accessToken?: string | null;
  onNavigate?: (screen: string) => void;
  className?: string;
}

export function NotificationBell({ accessToken, onNavigate, className = "" }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    const loadUnreadCount = async () => {
      if (!accessToken) {
        setUnreadCount(0);
        return;
      }
      try {
        const response = await fetch(
          getFunctionUrl('make-server-00a119be/notifications/unread-count'),
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (response.ok) {
          const data = await response.json();
          if (active) setUnreadCount(data.count || 0);
        }
      } catch (err) {
        console.error('[Notifications] Failed to load unread count', err);
      }
    };
    loadUnreadCount();
    return () => { active = false; };
  }, [accessToken]);

  const handleClick = () => {
    if (onNavigate) {
      onNavigate('notifications');
    } else {
      try {
        window.location.hash = 'notifications';
      } catch (_) {
        // noop
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      aria-label="Open notifications"
      className={`ml-auto self-center relative p-2 hover:bg-white/10 rounded-full transition-colors ${className}`}
    >
      <Bell className="w-6 h-6 text-white" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
