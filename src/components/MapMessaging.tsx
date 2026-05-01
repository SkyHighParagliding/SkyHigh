import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Send, ThumbsUp, ThumbsDown, Mic, MicOff, MessageCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/apiClient';

interface MapMessage {
  id: number;
  senderPilotId: string;
  senderName: string;
  recipientPilotId: string;
  recipientName: string;
  message: string;
  thumbsUp: number;
  createdAt: string;
}

interface ReactionNotification {
  id: number;
  recipientName: string;
  thumbsUp: number;
  createdAt: string;
}

interface QueuedMessage {
  tempId: string;
  recipientPilotId: string;
  recipientName: string;
  message: string;
  retryCount: number;
  status: 'sending' | 'queued' | 'failed';
}

interface ComposeTarget {
  pilotId: string;
  name: string;
}

interface SentReaction {
  type: 'up' | 'down';
  senderName: string;
  expiresAt: number;
}

interface MapMessagingProps {
  pilotId: string | null;
  pilotName: string | null;
  pilotToken: string | null;
  composeTarget: ComposeTarget | null;
  onCloseCompose: () => void;
  apiPrefix?: string;
  demoSession?: string | null;
}

const POLL_INTERVAL = 5000;
const MAX_RETRIES = 50;
const BASE_RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 30000;
const REACTION_DISPLAY_MS = 5000;

function getRetryDelay(retryCount: number): number {
  const delay = Math.min(BASE_RETRY_DELAY * Math.pow(1.5, retryCount), MAX_RETRY_DELAY);
  return delay + Math.random() * 1000;
}

export function MapMessaging({ pilotId, pilotName, pilotToken, composeTarget, onCloseCompose, apiPrefix = '/api/map-messages', demoSession }: MapMessagingProps) {
  const [incomingMessages, setIncomingMessages] = useState<MapMessage[]>([]);
  const [reactionNotifs, setReactionNotifs] = useState<ReactionNotification[]>([]);
  const [sendQueue, setSendQueue] = useState<QueuedMessage[]>([]);
  const [composeText, setComposeText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [sentReaction, setSentReaction] = useState<SentReaction | null>(null);
  const recognitionRef = useRef<any>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reactionAutoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (pilotToken) h['x-pilot-token'] = pilotToken;
    if (demoSession) h['x-demo-session'] = demoSession;
    return h;
  }, [pilotToken, demoSession]);

  const apiOpts = useCallback(() => ({ headers: mapHeaders() }), [mapHeaders]);

  useEffect(() => {
    if (!pilotId || !pilotToken) return;

    const poll = async () => {
      try {
        const data = await api.get<any>(`${apiPrefix}/inbox`, null, apiOpts());
        if (data.messages?.length) {
          setIncomingMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = data.messages.filter((m: MapMessage) => !existingIds.has(m.id) && !dismissedIds.has(m.id));
            return newMsgs.length ? [...prev, ...newMsgs] : prev;
          });
        }
        if (data.thumbsUps?.length) {
          setReactionNotifs(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const newReactions = data.thumbsUps.filter((t: ReactionNotification) => !existingIds.has(t.id));
            return newReactions.length ? [...prev, ...newReactions] : prev;
          });
        }
      } catch {}
    };

    poll();
    const interval = setInterval(() => {
      if (!document.hidden) poll();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [pilotId, pilotToken, apiOpts, dismissedIds]);

  const sendingRef = useRef(false);

  const attemptSend = useCallback(async (queued: QueuedMessage): Promise<boolean> => {
    try {
      await api.post(apiPrefix, {
        recipientPilotId: queued.recipientPilotId,
        recipientName: queued.recipientName,
        message: queued.message,
      }, null, apiOpts());
      return true;
    } catch {
      return false;
    }
  }, [apiOpts, apiPrefix]);

  const processQueue = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;

    try {
      setSendQueue(prev => {
        const queuedItems = prev.filter(q => q.status === 'queued');
        if (!queuedItems.length) return prev;
        return prev.map(q => q.status === 'queued' ? { ...q, status: 'sending' as const } : q);
      });

      const snapshot = sendQueue.filter(q => q.status === 'queued' || q.status === 'sending');
      let needsRetry = false;
      let maxRetryCount = 0;

      for (const q of snapshot) {
        const ok = await attemptSend(q);
        if (ok) {
          setSendQueue(prev => prev.filter(item => item.tempId !== q.tempId));
        } else {
          const newCount = q.retryCount + 1;
          if (newCount < MAX_RETRIES) {
            needsRetry = true;
            maxRetryCount = Math.max(maxRetryCount, newCount);
            setSendQueue(prev =>
              prev.map(item =>
                item.tempId === q.tempId
                  ? { ...item, status: 'queued' as const, retryCount: newCount }
                  : item
              )
            );
          } else {
            setSendQueue(prev => prev.filter(item => item.tempId !== q.tempId));
          }
        }
      }

      if (needsRetry) {
        const delay = getRetryDelay(maxRetryCount);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          sendingRef.current = false;
          processQueue();
        }, delay);
        return;
      }
    } finally {
      sendingRef.current = false;
    }
  }, [sendQueue, attemptSend]);

  useEffect(() => {
    const hasQueued = sendQueue.some(q => q.status === 'queued');
    if (hasQueued && !sendingRef.current) {
      processQueue();
    }
  }, [sendQueue.length]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (reactionAutoTimerRef.current) clearTimeout(reactionAutoTimerRef.current);
    };
  }, []);

  const handleSend = useCallback(() => {
    if (!composeTarget || !composeText.trim() || !pilotId) return;

    const queued: QueuedMessage = {
      tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      recipientPilotId: composeTarget.pilotId,
      recipientName: composeTarget.name,
      message: composeText.trim(),
      retryCount: 0,
      status: 'queued',
    };

    setSendQueue(prev => [...prev, queued]);
    setComposeText('');
    onCloseCompose();
  }, [composeTarget, composeText, pilotId, onCloseCompose]);

  const handleDismiss = useCallback(async (msg: MapMessage) => {
    setIncomingMessages(prev => prev.filter(m => m.id !== msg.id));
    setDismissedIds(prev => new Set(prev).add(msg.id));
    try {
      await api.patch(`${apiPrefix}/${msg.id}/delivered`, {}, null, apiOpts());
    } catch {}
  }, [apiOpts, apiPrefix]);

  const handleReaction = useCallback(async (msg: MapMessage, type: 'up' | 'down') => {
    setIncomingMessages(prev => prev.filter(m => m.id !== msg.id));
    setDismissedIds(prev => new Set(prev).add(msg.id));

    setSentReaction({ type, senderName: msg.senderName, expiresAt: Date.now() + REACTION_DISPLAY_MS });

    if (reactionAutoTimerRef.current) clearTimeout(reactionAutoTimerRef.current);
    reactionAutoTimerRef.current = setTimeout(() => {
      setSentReaction(null);
    }, REACTION_DISPLAY_MS);

    try {
      const endpoint = type === 'up' ? 'thumbsup' : 'thumbsdown';
      await api.patch(`${apiPrefix}/${msg.id}/${endpoint}`, {}, null, apiOpts());
    } catch {}
  }, [apiOpts, apiPrefix]);

  const handleDismissReaction = useCallback(async (notif: ReactionNotification) => {
    setReactionNotifs(prev => prev.filter(t => t.id !== notif.id));
    try {
      await api.patch(`${apiPrefix}/${notif.id}/delivered`, {}, null, apiOpts());
    } catch {}
  }, [apiOpts, apiPrefix]);

  useEffect(() => {
    const current = reactionNotifs[0];
    if (!current) return;

    const timer = setTimeout(() => {
      handleDismissReaction(current);
    }, REACTION_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, [reactionNotifs, handleDismissReaction]);

  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-AU';

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setComposeText(prev => prev ? `${prev} ${transcript}` : transcript);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const hasSpeechRecognition = typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const pendingCount = sendQueue.length;
  const currentMessage = incomingMessages[0] || null;
  const currentReaction = reactionNotifs[0] || null;

  return (
    <>
      {pendingCount > 0 && (
        <div className="absolute top-3 left-3 z-[1100]">
          <div className="flex items-center gap-1.5 bg-amber-500/90 text-white text-xs font-medium px-2.5 py-1 rounded-full shadow-lg backdrop-blur-sm">
            <Loader2 className="w-3 h-3 animate-spin" />
            Sending{pendingCount > 1 ? ` (${pendingCount})` : ''}...
          </div>
        </div>
      )}

      {composeTarget && (
        <div className="absolute bottom-4 left-3 right-3 z-[1200]">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-w-sm mx-auto">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-sky-500" />
                <span className="text-sm font-medium text-gray-800 truncate">
                  To: {composeTarget.name}
                </span>
              </div>
              <button onClick={onCloseCompose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-2">
              <input
                ref={inputRef}
                type="text"
                value={composeText}
                onChange={e => setComposeText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..."
                maxLength={500}
                autoFocus
                className="flex-1 px-3 py-2 text-sm bg-gray-100 rounded-full outline-none focus:bg-gray-50 focus:ring-1 focus:ring-sky-400 transition-colors"
              />
              {hasSpeechRecognition && (
                <button
                  onClick={toggleVoice}
                  className={`p-2 rounded-full transition-colors ${
                    isListening ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!composeText.trim()}
                className="p-2 bg-sky-500 text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed hover:bg-sky-600 active:scale-95 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {currentMessage && !composeTarget && (
        <div className="absolute bottom-4 left-3 right-3 z-[1100] animate-slide-up">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-w-sm mx-auto">
            <div className="px-3.5 py-2.5">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">
                    {currentMessage.senderName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{currentMessage.senderName}</p>
                  <p className="text-sm text-gray-700 mt-0.5 break-words">{currentMessage.message}</p>
                </div>
              </div>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => handleDismiss(currentMessage)}
                className="flex-1 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                Dismiss
              </button>
              <div className="w-px bg-gray-100" />
              <button
                onClick={() => handleReaction(currentMessage, 'up')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-sky-600 hover:bg-sky-50 active:bg-sky-100 transition-colors"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <div className="w-px bg-gray-100" />
              <button
                onClick={() => handleReaction(currentMessage, 'down')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
              <div className="w-px bg-gray-100" />
              <button
                onClick={() => {
                  handleDismiss(currentMessage);
                  onCloseCompose();
                  setTimeout(() => {
                    const evt = new CustomEvent('map-message-reply', {
                      detail: {
                        pilotId: currentMessage.senderPilotId,
                        name: currentMessage.senderName,
                      },
                    });
                    window.dispatchEvent(evt);
                  }, 100);
                }}
                className="flex-1 py-2.5 text-xs font-medium text-sky-600 hover:bg-sky-50 active:bg-sky-100 transition-colors"
              >
                Reply
              </button>
            </div>
          </div>
        </div>
      )}

      {sentReaction && !currentMessage && !composeTarget && (
        <div className="absolute bottom-4 left-3 right-3 z-[1100] animate-slide-up">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-w-sm mx-auto">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                sentReaction.type === 'up' ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {sentReaction.type === 'up'
                  ? <ThumbsUp className="w-4 h-4 text-white" />
                  : <ThumbsDown className="w-4 h-4 text-white" />
                }
              </div>
              <p className="text-sm text-gray-700">
                {sentReaction.type === 'up' ? 'Thumbs up' : 'Thumbs down'} sent to{' '}
                <span className="font-semibold">{sentReaction.senderName}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {currentReaction && !sentReaction && !currentMessage && !composeTarget && (
        <div className="absolute bottom-4 left-3 right-3 z-[1100] animate-slide-up">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-w-sm mx-auto">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                currentReaction.thumbsUp === 2 ? 'bg-red-500' : 'bg-green-500'
              }`}>
                {currentReaction.thumbsUp === 2
                  ? <ThumbsDown className="w-4 h-4 text-white" />
                  : <ThumbsUp className="w-4 h-4 text-white" />
                }
              </div>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">{currentReaction.recipientName}</span>
                {currentReaction.thumbsUp === 2
                  ? ' reacted with thumbs down'
                  : ' acknowledged your message'
                }
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
