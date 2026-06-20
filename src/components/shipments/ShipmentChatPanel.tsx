import React from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/src/store/useAppStore";

type ShipmentChatThread = {
  id: string;
  shipmentCode?: string;
};

type ShipmentChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body?: string;
  content?: string;
  createdAt: string;
};

const shipmentChatMessageText = (message: ShipmentChatMessage) => message.body || message.content || "";
const SHIPMENT_CHAT_MESSAGE_DATE_FORMATTER = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const SHIPMENT_CHAT_MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  minute: "2-digit",
});
const SHIPMENT_CHAT_MESSAGE_PAGE_SIZE = 20;
const SHIPMENT_CHAT_HISTORY_TOP_THRESHOLD_PX = 48;
const SHIPMENT_CHAT_BOTTOM_THRESHOLD_PX = 80;

function shipmentChatMessageTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${SHIPMENT_CHAT_MESSAGE_DATE_FORMATTER.format(date)}، ${SHIPMENT_CHAT_MESSAGE_TIME_FORMATTER.format(date)}`;
}

export function ShipmentChatPanel({ shipmentId, shipmentCode }: { shipmentId: string; shipmentCode: string }) {
  const navigate = useNavigate();
  const currentUser = useAppStore((state) => state.currentUser);
  const canUseChat = Boolean(currentUser?.permissions?.includes("chat.use"));
  const [thread, setThread] = React.useState<ShipmentChatThread | null>(null);
  const [messages, setMessages] = React.useState<ShipmentChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [hasMoreMessages, setHasMoreMessages] = React.useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const messageListRef = React.useRef<HTMLDivElement | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const historyLoadingRef = React.useRef(false);
  const historyScrollRestoreRef = React.useRef<{
    previousHeight: number;
    previousTop: number;
    mode: "prepend" | "preserve";
  } | null>(null);
  const initialBottomScrollTimersRef = React.useRef<number[]>([]);
  const latestMessageBatchRef = React.useRef<{ length: number; lastMessageId: string }>({ length: 0, lastMessageId: "" });
  const pendingBottomScrollRef = React.useRef<ScrollBehavior | null>(null);
  const initialBottomScrolledThreadRef = React.useRef("");

  const loadMessages = React.useCallback(async (
    threadId: string,
    options: { before?: string; mode?: "initial" | "history" } = {}
  ) => {
    const params = new URLSearchParams({ limit: String(SHIPMENT_CHAT_MESSAGE_PAGE_SIZE) });
    if (options.before) params.set("before", options.before);
    const response = await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/messages?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not load shipment chat messages.");
    const nextMessages = (payload.data || []) as ShipmentChatMessage[];
    setHasMoreMessages(nextMessages.length === SHIPMENT_CHAT_MESSAGE_PAGE_SIZE);
    if (options.mode === "history") {
      setMessages((items) => {
        const existingIds = new Set(items.map((item) => item.id));
        const olderMessages = nextMessages.filter((message) => !existingIds.has(message.id));
        return olderMessages.length ? [...olderMessages, ...items] : items;
      });
      return nextMessages;
    }
    pendingBottomScrollRef.current = "auto";
    setMessages(nextMessages);
    return nextMessages;
  }, []);

  const isMessageListNearBottom = () => {
    const list = messageListRef.current;
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight <= SHIPMENT_CHAT_BOTTOM_THRESHOLD_PX;
  };

  const scrollMessageListToBottom = (behavior: ScrollBehavior) => {
    const applyScroll = () => {
      const list = messageListRef.current;
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
      if (!list) return;
      if (behavior === "smooth") {
        list.scrollTo({ top: list.scrollHeight, behavior });
        return;
      }
      list.scrollTop = list.scrollHeight;
    };
    applyScroll();
    window.requestAnimationFrame(() => {
      applyScroll();
      window.requestAnimationFrame(applyScroll);
    });
  };

  const clearInitialBottomScrollTimers = () => {
    for (const timer of initialBottomScrollTimersRef.current) {
      window.clearTimeout(timer);
    }
    initialBottomScrollTimersRef.current = [];
  };

  const loadOlderMessages = async () => {
    const oldestMessage = messages[0];
    if (!thread?.id || !oldestMessage || !hasMoreMessages || historyLoadingRef.current) return;
    clearInitialBottomScrollTimers();
    const list = messageListRef.current;
    historyScrollRestoreRef.current = list
      ? { previousHeight: list.scrollHeight, previousTop: list.scrollTop, mode: "prepend" }
      : null;
    historyLoadingRef.current = true;
    try {
      const olderMessages = await loadMessages(thread.id, { before: oldestMessage.id, mode: "history" });
      if (!olderMessages?.length) {
        historyScrollRestoreRef.current = null;
      }
    } catch (nextError) {
      historyScrollRestoreRef.current = null;
      setError(nextError instanceof Error ? nextError.message : "Could not load older shipment chat messages.");
    } finally {
      historyLoadingRef.current = false;
    }
  };

  const handleMessageListScroll = () => {
    const list = messageListRef.current;
    if (!list || list.scrollHeight <= list.clientHeight) return;
    if (list.scrollTop <= SHIPMENT_CHAT_HISTORY_TOP_THRESHOLD_PX) {
      void loadOlderMessages();
    }
  };

  React.useEffect(() => {
    if (!canUseChat) return;
    let cancelled = false;
    setIsLoading(true);
    setError("");
    setMessages([]);
    setHasMoreMessages(false);
    historyLoadingRef.current = false;
    historyScrollRestoreRef.current = null;
    clearInitialBottomScrollTimers();
    pendingBottomScrollRef.current = "auto";
    initialBottomScrolledThreadRef.current = "";
    fetch(`/api/shipments/${encodeURIComponent(shipmentId)}/chat-thread`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not open shipment chat.");
        if (cancelled) return null;
        setThread(payload.data);
        await loadMessages(payload.data.id);
        return payload.data;
      })
      .catch((nextError) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : "Could not open shipment chat.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      clearInitialBottomScrollTimers();
    };
  }, [canUseChat, loadMessages, shipmentId]);

  React.useEffect(() => {
    if (!canUseChat || !thread?.id) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const incoming = JSON.parse(event.data);
      if (incoming.type === "connection.ready") {
        ws.send(JSON.stringify({ type: "thread.join", payload: { threadId: thread.id } }));
        return;
      }
      if (incoming.type === "message.created" && incoming.payload?.threadId === thread.id) {
        const message = incoming.payload as ShipmentChatMessage;
        const shouldScrollToBottom = message.senderId === currentUser?.id || isMessageListNearBottom();
        const list = messageListRef.current;
        const preserveReaderScroll = !shouldScrollToBottom && list
          ? { previousHeight: list.scrollHeight, previousTop: list.scrollTop, mode: "preserve" as const }
          : null;
        setMessages((items) => {
          if (items.some((item) => item.id === message.id)) return items;
          if (shouldScrollToBottom) {
            pendingBottomScrollRef.current = "smooth";
          } else {
            pendingBottomScrollRef.current = null;
            historyScrollRestoreRef.current = preserveReaderScroll;
          }
          return [...items, message];
        });
        return;
      }
      if (incoming.type === "message.ack") {
        setIsSending(false);
        setDraft("");
        setError("");
        return;
      }
      if (incoming.type === "error") {
        setIsSending(false);
        setError(incoming.error?.message || "Shipment chat action failed.");
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
      setIsSending(false);
    };
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "thread.leave", payload: { threadId: thread.id } }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [canUseChat, currentUser?.id, thread?.id]);

  React.useLayoutEffect(() => {
    latestMessageBatchRef.current = {
      length: messages.length,
      lastMessageId: messages[messages.length - 1]?.id || "",
    };
  }, [messages]);

  React.useLayoutEffect(() => {
    const list = messageListRef.current;
    if (!list || messages.length === 0) return;
    const restore = historyScrollRestoreRef.current;
    if (restore) {
      const applyRestore = () => {
        const currentList = messageListRef.current;
        if (!currentList) return;
        currentList.scrollTop = restore.mode === "prepend"
          ? currentList.scrollHeight - restore.previousHeight + restore.previousTop
          : restore.previousTop;
      };
      applyRestore();
      window.requestAnimationFrame(() => {
        applyRestore();
        window.requestAnimationFrame(applyRestore);
      });
      historyScrollRestoreRef.current = null;
    }
  }, [messages]);

  React.useLayoutEffect(() => {
    if (!thread?.id || messages.length === 0) return;
    if (initialBottomScrolledThreadRef.current !== thread.id) {
      clearInitialBottomScrollTimers();
      scrollMessageListToBottom("auto");
      const initialBatch = {
        threadId: thread.id,
        length: messages.length,
        lastMessageId: messages[messages.length - 1]?.id || "",
      };
      const scrollIfStillInitialBatch = () => {
        const currentBatch = latestMessageBatchRef.current;
        if (thread?.id !== initialBatch.threadId) return;
        if (historyLoadingRef.current) return;
        if (currentBatch.length !== initialBatch.length || currentBatch.lastMessageId !== initialBatch.lastMessageId) return;
        scrollMessageListToBottom("auto");
      };
      initialBottomScrollTimersRef.current = [50, 150, 300].map((delay) =>
        window.setTimeout(scrollIfStillInitialBatch, delay)
      );
      pendingBottomScrollRef.current = null;
      initialBottomScrolledThreadRef.current = thread.id;
      return;
    }
    const behavior = pendingBottomScrollRef.current;
    if (!behavior) return;
    scrollMessageListToBottom(behavior);
    pendingBottomScrollRef.current = null;
  }, [messages, thread?.id]);

  React.useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!thread?.id || !lastMessage) return;
    fetch(`/api/chat/threads/${encodeURIComponent(thread.id)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: lastMessage.id }),
    }).catch(() => {});
  }, [messages, thread?.id]);

  if (!canUseChat) return null;

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !thread?.id || isSending) return;
    setIsSending(true);
    setError("");
    const clientMessageId = `shipment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "message.send",
        requestId: clientMessageId,
        payload: { threadId: thread.id, body, clientMessageId },
      }));
      return;
    }
    try {
      const response = await fetch(`/api/chat/threads/${encodeURIComponent(thread.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, clientMessageId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Could not send shipment chat message.");
      pendingBottomScrollRef.current = "smooth";
      setMessages((items) => items.some((item) => item.id === payload.data.id) ? items : [...items, payload.data]);
      setDraft("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not send shipment chat message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm" data-testid="shipment-chat-panel">
      <CardHeader className="border-b border-border/50 bg-muted/20 p-4">
        <CardTitle className="flex items-center justify-between gap-3 text-sm font-black">
          <span className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">گفتگوی محموله</span>
          </span>
          {thread?.id && (
            <Button
              type="button"
              variant="outline"
              className="h-8 shrink-0 rounded-lg px-3 text-[11px] font-black"
              onClick={() => navigate(`/chat?threadId=${encodeURIComponent(thread.id)}`)}
              data-testid="shipment-chat-full-link"
            >
              مشاهده گفتگوی کامل
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="rounded-xl bg-muted/25 p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-bold text-muted-foreground">
            <span className="truncate">محموله {thread?.shipmentCode || shipmentCode}</span>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <div
            ref={messageListRef}
            className="max-h-48 space-y-2 overflow-y-auto pr-1"
            data-testid="shipment-chat-message-list"
            onScroll={handleMessageListScroll}
          >
            {!isLoading && messages.length === 0 && (
              <p className="py-6 text-center text-xs font-bold text-muted-foreground">هنوز پیامی ثبت نشده است.</p>
            )}
            {messages.map((message) => {
              const isMine = message.senderId === currentUser?.id;
              return (
                <div key={message.id} className={cn("flex flex-col", isMine ? "items-start" : "items-end")}>
                  {!isMine && <span className="mb-1 text-[10px] font-black text-muted-foreground">{message.senderName}</span>}
                  <div
                    className={cn(
                      "max-w-[90%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-[11px] font-bold leading-5 [overflow-wrap:anywhere]",
                      isMine ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground"
                    )}
                    data-testid="shipment-chat-message-bubble"
                  >
                    {shipmentChatMessageText(message)}
                  </div>
                  <span className="mt-1 px-1 text-[10px] font-bold text-muted-foreground">
                    {shipmentChatMessageTimestamp(message.createdAt)}
                  </span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-[11px] font-bold text-destructive">
            {error}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!thread?.id || isLoading}
            maxLength={3000}
            placeholder="پیام داخلی محموله..."
            className="h-10 min-w-0 flex-1 rounded-lg text-xs font-bold"
            data-testid="shipment-chat-message-input"
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-lg"
            disabled={!thread?.id || !draft.trim() || isSending || isLoading}
            data-testid="shipment-chat-send-button"
            aria-label="ارسال پیام محموله"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
