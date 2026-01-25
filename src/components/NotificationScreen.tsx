import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Bell, CheckCircle2, Clock, TrendingUp, X } from "lucide-react";
import { toast } from "../utils/tieredToast";
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { getFunctionUrl } from '../utils/supabase/client';
import { PullToRefresh } from "./ui/PullToRefresh";

interface Notification {
  id: string;
  type: 'analysis_update' | 'subscription' | 'system' | 'payment' | 'strategy_creation';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  strategyId?: string;
  strategyName?: string;
  improvements?: string[];
}

interface NotificationScreenProps {
  onNavigate: (screen: string, strategyId?: string) => void;
  accessToken: string | null;
  isProUser: boolean;
  onRefreshSubscription?: () => void;
}

import { RestrictedBanner } from './RestrictedBanner';
export function NotificationScreen({ onNavigate, accessToken, isProUser, onRefreshSubscription }: NotificationScreenProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const hasPurgedRef = useRef(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Typed navigation target helper for notifications
  type NavigationTarget =
    | { screen: 'analyze'; strategyId: string }
    | { screen: 'code'; strategyId: string }
    | { screen: 'subscription' };

  const getNavigationTarget = (notification: Notification): NavigationTarget | null => {
    // Strategy creation notifications go to code result
    if (notification.type === 'strategy_creation' && notification.strategyId) {
      return { screen: 'code', strategyId: notification.strategyId };
    }
    // If a strategy is associated, take the user to full analysis details
    if (notification.strategyId) {
      return { screen: 'analyze', strategyId: notification.strategyId };
    }
    // Subscription-related notifications lead to subscription details
    if (notification.type === 'subscription') {
      return { screen: 'subscription' };
    }
    return null;
  };

  useEffect(() => {
    // Purge all placeholder/local notifications so we only show fresh items
    if (!hasPurgedRef.current) {
      try {
        const keys = Object.keys(window.localStorage).filter(k => k.startsWith('local-notifications:'));
        keys.forEach(k => {
          try { window.localStorage.removeItem(k); } catch {}
        });
        hasPurgedRef.current = true;
      } catch {}
    }
    fetchNotifications();
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch(
        getFunctionUrl('make-server-00a119be/notifications'),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();
      const serverNotifs: Notification[] = data.notifications || [];
      const allowedTypes = new Set<Notification['type']>(['analysis_update', 'subscription', 'payment', 'strategy_creation']);
      const filtered = serverNotifs.filter(n => allowedTypes.has(n.type));
      const list = filtered.sort((a, b) => (new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setNotifications(list);

      // If we see a subscription notification, ensure app state is in sync
      if (onRefreshSubscription && list.some(n => n.type === 'subscription')) {
        onRefreshSubscription();
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(
        getFunctionUrl(`server/make-server-00a119be/notifications/${notificationId}/read`),
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }

      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      
      await Promise.all(
        unreadIds.map(id => 
          fetch(
            getFunctionUrl(`server/make-server-00a119be/notifications/${id}/read`),
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            }
          )
        )
      );

      setNotifications(notifications.map(n => ({ ...n, read: true })));
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const response = await fetch(
        getFunctionUrl(`server/make-server-00a119be/notifications/${notificationId}`),
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }

      setNotifications(notifications.filter(n => n.id !== notificationId));
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    setNavigatingId(notification.id);
    markAsRead(notification.id);

    const target = getNavigationTarget(notification);
    if (!target) {
      toast.error('Missing details for this notification');
      // Briefly keep loading state to indicate action handling
      setTimeout(() => setNavigatingId(null), 600);
      return;
    }

    try {
      if (target.screen === 'analyze') {
        onNavigate('analyze', target.strategyId);
      } else if (target.screen === 'code') {
        onNavigate('code', target.strategyId);
      } else {
        onNavigate('subscription');
      }
    } finally {
      // Allow UI to show loading briefly; unmount will clear if route changes
      setTimeout(() => setNavigatingId(null), 300);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'analysis_update':
        return <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'subscription':
        return <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : notifications.filter(n => !n.read);

  const unreadCount = notifications.filter(n => !n.read).length;

  if (isLoading) {
    return (
      // Ensure full viewport coverage while loading
      <div className="min-h-screen w-screen bg-background flex flex-col">
        <div className="app-container flex-1 px-[9px] py-6 safe-nav-pad flex flex-col">
          <div className="flex-1 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Full viewport coverage for all content states
    <div className="min-h-screen w-screen bg-background flex flex-col">
      <div className="app-container flex-1 px-[9px] py-6 safe-nav-pad flex flex-col">
        <PullToRefresh className="flex-1 flex flex-col" onRefresh={fetchNotifications}>
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  aria-label="Back to Home"
                  onClick={() => onNavigate('home')}
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-gray-900 dark:text-white mb-1">Notifications</h1>
                  <p className="text-gray-600 dark:text-gray-400">
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                  </p>
                </div>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="px-3 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  filter === 'all'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  filter === 'unread'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
          </div>

          {/* Removed RestrictedBanner for basic users */}

          {/* Notifications List */}
          {filteredNotifications.length === 0 ? (
            // Centered empty state content within full-height area
            <div className="flex-1 w-full flex items-center justify-center px-4">
              <div className="text-center max-w-md">
                <Bell className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-gray-900 dark:text-white mb-2">No notifications</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {filter === 'unread' 
                    ? "You're all caught up!" 
                    : "We'll notify you when something happens"}
                </p>
              </div>
            </div>
          ) : (
            // Scrollable list area that fills remaining viewport space
            <div className="flex-1 w-full overflow-y-auto space-y-2">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`bg-white dark:bg-gray-800 rounded-lg border transition-all ${
                    !notification.read
                      ? 'border-blue-200 dark:border-blue-800 shadow-sm'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                        !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-700'
                      }`}>
                        {getNotificationIcon(notification.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className={`${
                            !notification.read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {notification.title}
                          </h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                          {notification.message}
                        </p>

                        {notification.strategyName && notification.type !== 'strategy_creation' && (
                          <div className="mb-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded inline-block">
                            <span className="text-blue-700 dark:text-blue-300">
                              {notification.strategyName}
                            </span>
                          </div>
                        )}

                        {notification.improvements && notification.improvements.length > 0 && (
                          <div className="mb-2 space-y-1">
                            <p className="text-gray-700 dark:text-gray-300">Key improvements:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {notification.improvements.slice(0, 3).map((improvement, idx) => (
                                <li key={idx} className="text-gray-600 dark:text-gray-400">
                                  {improvement}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span title={new Date(notification.timestamp).toLocaleString()}>
                              {new Date(notification.timestamp).toLocaleString()}
                            </span>
                            <span>
                              ({formatTimestamp(notification.timestamp)})
                            </span>
                          </div>

                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                          )}
                        </div>

                        {(notification.strategyId || notification.type === 'subscription') && (
                          <button
                            onClick={() => handleNotificationClick(notification)}
                            disabled={navigatingId === notification.id}
                            className={`mt-3 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${
                              navigatingId === notification.id ? 'opacity-70 cursor-not-allowed' : ''
                            }`}
                            style={{ width: 'calc(100% - 8px)' }}
                          >
                            {navigatingId === notification.id ? (
                              <span className="inline-flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                                <span>Opening…</span>
                              </span>
                            ) : (
                              notification.type === 'strategy_creation' ? 'View Strategy' : (notification.strategyId ? 'View Analysis' : 'View Details')
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PullToRefresh>
      </div>
    </div>
  );
}

export default NotificationScreen;
