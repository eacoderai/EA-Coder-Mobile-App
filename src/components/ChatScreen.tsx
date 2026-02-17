import React, { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { ArrowLeft, Send, Loader2, Bot, User as UserIcon, Copy, History, FileText, Save, Diff as DiffIcon, PanelLeft, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { projectId } from '../utils/supabase/info';
import { toast } from "../utils/tieredToast";
import { getFunctionUrl, functionsUrl } from '../utils/supabase/client';
import { NotificationBell } from "./ui/NotificationBell";
import { Textarea } from "./ui/textarea";
import type { StrategyRecord } from '../types/analysis';
import styles from './ChatInput.module.css';
import { Header } from "./Header";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatScreenProps {
  strategyId?: string;
  onNavigate: (screen: string) => void;
  accessToken: string | null;
  isProUser: boolean;
  remainingGenerations?: number;
}

export function ChatScreen({ strategyId, onNavigate, accessToken, isProUser, remainingGenerations }: ChatScreenProps) {
  const sid: string | undefined = React.useMemo(() => {
    if (strategyId) return strategyId;
    try {
      const s = typeof window !== 'undefined' ? window.localStorage.getItem('lastSelectedStrategyId') : null;
      return s ? JSON.parse(s) : undefined;
    } catch { return undefined; }
  }, [strategyId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendBarRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const userEditedRef = useRef<boolean>(false);
  const [strategy, setStrategy] = useState<StrategyRecord & { id?: string; generated_code?: string; platform?: string; strategy_name?: string } | null>(null);
  const [code, setCode] = useState<string>("");
  const [isCodeLoading, setIsCodeLoading] = useState<boolean>(false);
  const [isSavingCode, setIsSavingCode] = useState<boolean>(false);
  const [versions, setVersions] = useState<Array<{ id: string; code: string; timestamp: string }>>([]);
  const [showManagement, setShowManagement] = useState<boolean>(false);
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [sendOffsetPx, setSendOffsetPx] = useState<number>(74);
  const [contentBottomPadPx, setContentBottomPadPx] = useState<number>(120);
  const storageKeys = useMemo(() => ({
    strategy: sid ? `strategy:${sid}` : '',
    code: sid ? `strategy_code:${sid}` : '',
    versions: sid ? `strategy_code_versions:${sid}` : ''
  }), [sid]);

  const computeDiff = (a: string, b: string) => {
    const al = a.split(/\r?\n/);
    const bl = b.split(/\r?\n/);
    const m = al.length;
    const n = bl.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = al[i] === bl[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0, j = 0;
    const changes: Array<{ type: 'add' | 'del' | 'same'; line: string }> = [];
    while (i < m && j < n) {
      if (al[i] === bl[j]) { changes.push({ type: 'same', line: bl[j] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { changes.push({ type: 'del', line: al[i] }); i++; }
      else { changes.push({ type: 'add', line: bl[j] }); j++; }
    }
    while (i < m) { changes.push({ type: 'del', line: al[i++] }); }
    while (j < n) { changes.push({ type: 'add', line: bl[j++] }); }
    const added = changes.filter(c => c.type === 'add').length;
    const removed = changes.filter(c => c.type === 'del').length;
    return { added, removed, changes };
  };

  const persistLocal = (key: string, value: any) => {
    try { if (key) window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };
  const readLocal = (key: string) => {
    try { const s = key ? window.localStorage.getItem(key) : null; return s ? JSON.parse(s) : null; } catch { return null; }
  };

  const loadStrategyDetails = async () => {
    if (!sid) return;
    setIsCodeLoading(true);
    try {
      const cached = readLocal(storageKeys.strategy);
      if (cached) setStrategy(cached);
      const res = await fetch(getFunctionUrl(`strategies/${sid}`), { headers: { 'Authorization': `Bearer ${accessToken || ''}` } });
      if (res.ok) {
        const data = await res.json();
        setStrategy(data);
        persistLocal(storageKeys.strategy, data);
        const initialCode = String(data.generated_code || '');
        const existingLocal = readLocal(storageKeys.code);
        const domVal = codeRef.current?.value ?? '';
        const hasTyped = !!domVal && domVal.length > 0;
        if (existingLocal !== null && existingLocal !== undefined) {
          setCode(existingLocal);
        } else if (hasTyped || userEditedRef.current) {
          // Preserve user edits present in DOM; do not override
        } else {
          setCode(initialCode);
          persistLocal(storageKeys.code, initialCode);
        }
      }
      const localVersions = readLocal(storageKeys.versions) || [];
      setVersions(localVersions);
    } catch (e) {
    } finally {
      setIsCodeLoading(false);
    }
  };

  const saveCode = async (message?: string) => {
    setIsSavingCode(true);
    try {
      const domCandidate = (codeRef.current?.value ?? (typeof document !== 'undefined' ? ((document.querySelector('textarea') as HTMLTextAreaElement)?.value ?? '') : ''));
      const domVal = String(domCandidate).trimEnd();
      const effectiveCode = domVal !== '' ? domVal : code;
      const v = { id: crypto.randomUUID(), code: effectiveCode, timestamp: new Date().toISOString() };
      const next = [v, ...versions].slice(0, 20);
      setVersions(next);
      persistLocal(storageKeys.code, effectiveCode);
      persistLocal(storageKeys.versions, next);
      toast.success('Code saved');
      if (!sid) return;
      const body: any = { code: effectiveCode, message };
      const urlA = getFunctionUrl(`strategies/${sid}/code`);
      const respA = await fetch(urlA, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!respA.ok && respA.status === 404) {
        const urlB = `${functionsUrl}/strategies/${sid}/code`;
        await fetch(urlB, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken || ''}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).catch(() => {});
      }
    } catch (e: any) {
      toast.error(typeof e?.message === 'string' ? e.message : 'Save failed');
    } finally {
      setIsSavingCode(false);
    }
  };
  const checkAccess = async () => {
    if (!sid) return;
    try {
      const response = await fetch(
        getFunctionUrl(`strategies/${sid}`),
        { headers: { 'Authorization': `Bearer ${accessToken || ''}` } }
      );
      
      // Always allow chat for basic users; do not set restricted state
      // Server-level errors will be handled during send/load
    } catch (err) {
      console.error('Access check failed', err);
    }
  };

  useEffect(() => {
    if (sid) {
      checkAccess().then(() => { loadStrategyDetails(); loadMessages(); });
    }
  }, [sid]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (bottomRef.current && typeof (bottomRef.current as any).scrollIntoView === 'function') {
      (bottomRef.current as any).scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const loadMessages = async () => {
    if (!sid) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(
        getFunctionUrl(`strategies/${sid}/chat`),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateViewportMetrics = () => {
    try {
      const GAP_PX = 10;
      const vv = (typeof window !== 'undefined' ? window.visualViewport : undefined) as any;
      const keyboardInset = vv ? Math.max(0, (window.innerHeight - (vv.height + vv.offsetTop))) : 0;
      const navEl = (typeof document !== 'undefined' ? document.querySelector('nav.bottom-nav') : null) as HTMLElement | null;
      const navHeight = navEl ? Math.round(navEl.getBoundingClientRect().height) : 64;
      const sendH = sendBarRef.current ? Math.round(sendBarRef.current.getBoundingClientRect().height) : 56;
      const safePad = keyboardInset;
      const offset = navHeight + GAP_PX + safePad;
      setSendOffsetPx(offset);
      setContentBottomPadPx(offset + sendH + 8);
    } catch {}
  };

  useEffect(() => {
    updateViewportMetrics();
    const onResize = () => updateViewportMetrics();
    const onOrientation = () => updateViewportMetrics();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);
    const vv = (typeof window !== 'undefined' ? window.visualViewport : undefined) as any;
    if (vv && typeof vv.addEventListener === 'function') {
      vv.addEventListener('resize', onResize);
      vv.addEventListener('scroll', onResize);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
      if (vv && typeof vv.removeEventListener === 'function') {
        vv.removeEventListener('resize', onResize);
        vv.removeEventListener('scroll', onResize);
      }
    };
  }, []);

  useEffect(() => { updateViewportMetrics(); }, [messages.length, isLoading]);

  // Remove prefill; keep placeholder only

  const doSend = async () => {
    if (!isProUser) {
      toast.error('Upgrade to Pro to use AI Chat Assistant', { audience: 'free', tag: 'limit_reached' });
      return;
    }
    const userMessage = String(inputRef.current?.value ?? inputMessage).trim();
    if (!userMessage || !sid) return;
    setInputMessage("");
    setIsSending(true);
    const tempUserMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);
    try {
      const overrideCandidate = (codeRef.current?.value ?? (typeof document !== 'undefined' ? ((document.querySelector('textarea') as HTMLTextAreaElement)?.value ?? '') : ''));
      const fallbackLocal = readLocal(storageKeys.code) || '';
      const codeOverride = String(overrideCandidate) !== '' ? String(overrideCandidate) : (code || fallbackLocal);
      const baseCode = String((strategy?.generated_code ?? ''));
      const diffMeta = computeDiff(baseCode, codeOverride);
      const editSummary = {
        versionsCount: versions.length,
        recentTimestamps: versions.slice(0, 5).map(v => v.timestamp),
        diff: { added: diffMeta.added, removed: diffMeta.removed }
      };
      const versionsMeta = versions.slice(0, 5).map(v => ({ id: v.id, timestamp: v.timestamp }));
      const strat = strategy || readLocal(storageKeys.strategy) || null;
      const strategyContext = strat
        ? { id: strat.id || sid, name: strat.strategy_name || 'Strategy', platform: strat.platform || '', baseCode: String(strat.generated_code || '') }
        : { id: sid };
      const response = await fetch(
        getFunctionUrl(`strategies/${sid}/chat`),
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: userMessage, codeOverride, strategyId: sid, strategyContext, editSummary, versionsMeta })
        }
      );
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to get AI response');
      }
      const data = await response.json();
      const aiMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error: any) {
      console.error('Chat send error:', error);
      const message = typeof error?.message === 'string' && error.message.trim() ? error.message : 'Message failed — please try again.';
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSend();
  };
  const handleSubmit = (e: any) => {
    try { if (typeof e?.preventDefault === 'function') e.preventDefault(); } catch {}
    sendMessage(e as React.FormEvent);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard!");
  };

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        title="EACoder AI BOT"
        subtitle="Refine and tweak your strategy"
        onBack={() => onNavigate('home')}
        rightContent={<NotificationBell accessToken={accessToken} onNavigate={onNavigate} />}
      />

    {/* Removed default subscription banner for basic users.
        Free users see restrictions only when server denies access or quota is exhausted. */}

    {!sid && (
      <div className="app-container w-full px-[9px] pt-3 safe-nav-pad">
        <Card className="mt-8" style={glassCardStyle}>
          <CardContent className="p-8 text-center">
            <Bot className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-lg mb-2 text-gray-900 dark:text-white">No Strategy Selected</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Please select a strategy from the home screen to start chatting
            </p>
            <Button
              onClick={() => onNavigate('home')}
              className="px-6"
              style={{ borderRadius: '24px', width: '120px', height: '48px' }}
            >
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )}

    {sid && !isLoading && messages.length === 0 && (
      <div className="app-container w-full px-[9px] pt-3 safe-nav-pad">
        <Card style={glassCardStyle}>
          <CardContent className="p-6 text-center">
            <Bot className="w-12 h-12 text-blue-600 mx-auto mb-3" />
            <h3 className="text-[clamp(0.95rem,3.2vw,1rem)] mb-2 text-gray-900 dark:text-white">Start Chatting</h3>
            <p className="text-[clamp(0.8rem,2.8vw,0.9rem)] text-gray-600 dark:text-gray-400">
              Ask me to modify your code. For example:
            </p>
            <div className="mt-3 space-y-2 text-xs text-left">
              <p className="bg-white dark:bg-gray-800 p-2 rounded">
                "Add a trailing stop of 50 pips"
              </p>
              <p className="bg-white dark:bg-gray-800 p-2 rounded">
                "Change RSI period to 21"
              </p>
              <p className="bg-white dark:bg-gray-800 p-2 rounded">
                "Add MACD confirmation"
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )}

    {/* Strategy Management section removed per request */}

      {/* Messages */}
      <div
        className={
          `flex-1 app-container w-full px-[9px] pt-3 safe-nav-pad overflow-x-hidden flex flex-col min-h-0`
        }
      >
        {!sid ? (
          <div />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <ScrollArea className="flex-1 h-full scroll-smooth overscroll-y-contain" ref={scrollRef}>
            <div style={{ paddingBottom: Math.max(80, contentBottomPadPx), transition: 'padding-bottom 200ms ease' }}>
              {false && messages.length === 0}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 mb-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="bg-blue-600 rounded-full h-12 w-12 min-h-[48px] min-w-[48px] flex items-center justify-center flex-shrink-0">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[min(84vw,680px)] sm:max-w-[min(72vw,740px)] break-words rounded-lg px-3 py-2 sm:px-4 sm:py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                  {message.role === 'assistant' && message.content.includes('```') ? (
                    <div className="space-y-2">
                        <pre className="bg-gray-900 dark:bg-black p-3 rounded text-[clamp(0.75rem,2.6vw,0.875rem)] max-w-full overflow-auto">
                          <code className="text-gray-100 whitespace-pre-wrap break-words">
                            {message.content.replace(/```[\w]*\n?/g, '').trim()}
                          </code>
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-12 min-h-[48px]"
                          onClick={() => copyCode(message.content.replace(/```[\w]*\n?/g, '').trim())}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Updated Code
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[clamp(0.875rem,2.8vw,1rem)] leading-[clamp(1.25rem,3.6vw,1.5rem)] whitespace-pre-wrap break-words">{message.content}</p>
                    )}
                    <p
                      className={`mt-1 text-[clamp(0.65rem,2vw,0.75rem)] ${
                        message.role === 'user' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="bg-gray-600 rounded-full h-12 w-12 min-h-[48px] min-w-[48px] flex items-center justify-center flex-shrink-0">
                      <UserIcon className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              ))}
              
              {isSending && (
                <div className="flex gap-3 mb-3">
                  <div className="bg-blue-600 rounded-full h-12 w-12 min-h-[48px] min-w-[48px] flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}
        {sid && !isProUser ? (
          <div
            style={{
              position: 'fixed',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: sendOffsetPx + 12,
              zIndex: 50,
              width: 'min(720px, calc(100vw - 32px))'
            }}
          >
            <Button 
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg flex items-center justify-center gap-2 rounded-md"
              onClick={() => onNavigate('subscription', 'plan-pro')}
            >
              <Lock className="w-4 h-4" />
              Upgrade to Pro to Chat
            </Button>
          </div>
        ) : strategyId && (
          <form
            ref={sendBarRef}
            onSubmit={handleSubmit}
            className={`${styles.chatInputBar} max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto`}
            aria-label="Chat input bar"
            style={{
              position: 'fixed',
              left: '50%',
              right: 'auto',
              transform: 'translateX(-50%)',
              bottom: sendOffsetPx + 12,
              zIndex: 50,
              transition: 'bottom 200ms ease, transform 200ms ease',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              width: 'min(720px, calc(100vw - 32px))'
            }}
          >
            <input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onInput={(e) => setInputMessage((e.target as HTMLInputElement).value)}
              placeholder="Ask to modify your code..."
              disabled={isSending}
              className={styles.chatInput}
              ref={inputRef}
              aria-label="Chat message input"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={isSending}
              className={styles.sendButton}
              onClick={handleSubmit}
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
        )}
      </div>
      {/* Dynamic bottom padding to keep content above nav + send bar */}
    </div>
  );
}
