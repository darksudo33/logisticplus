import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Circle,
  Download,
  Eye,
  FileIcon,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  Ship,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/src/components/EmptyState";
import { useAppStore } from "@/src/store/useAppStore";

type ChatParticipant = {
  id: string;
  userId: string;
  name: string;
  displayName: string;
  email: string;
  role: string;
  roleName: string;
  avatar?: string;
  isOnline?: boolean;
};

type ChatAttachment = {
  id: string;
  messageId: string;
  threadId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  fileSize: string;
  attachmentType: "image" | "document";
  createdAt: string;
  deletedAt?: string | null;
  deletedReason?: string | null;
  downloadUrl?: string;
  previewUrl?: string;
};

type ChatMessage = {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body?: string;
  content?: string;
  clientMessageId?: string;
  attachments?: ChatAttachment[];
  createdAt: string;
};

type ChatThread = {
  id: string;
  type: "DM" | "GROUP" | "SHIPMENT";
  threadType?: string;
  name: string;
  description?: string;
  shipmentId?: string;
  shipmentCode?: string;
  shipmentStatus?: string;
  customerName?: string;
  shipmentDetailUrl?: string;
  shipment?: {
    id: string;
    code: string;
    status?: string;
    customerName?: string;
    detailUrl?: string;
  };
  unreadCount?: number;
  lastReadAt?: string | null;
  members: ChatParticipant[];
  lastMessage?: ChatMessage | null;
  createdAt: string;
  updatedAt: string;
};

type ApiPayload<T> = {
  ok?: boolean;
  data?: T;
  error?: { code?: string; message?: string; retryAfterMs?: number };
};

type ChatRequestError = Error & {
  code?: string;
  retryAfterMs?: number;
};

type ChatCategory = ChatThread["type"];

const CHAT_MESSAGE_MAX_LENGTH = 3000;
const CHAT_MESSAGE_PAGE_SIZE = 20;
const CHAT_HISTORY_TOP_THRESHOLD_PX = 48;
const CHAT_BOTTOM_THRESHOLD_PX = 96;
const CHAT_TYPING_THROTTLE_MS = 2000;
const CHAT_RATE_LIMITED_MESSAGE = "تعداد پیام‌ها زیاد است. لطفاً چند لحظه صبر کنید.";
const CHAT_SEND_FAILED_MESSAGE = "پیام ارسال نشد. لطفاً دوباره تلاش کنید.";
const CHAT_FILE_DELETED_MESSAGE = "این فایل حذف شده است";
const CHAT_FILE_MANAGER_DELETED_MESSAGE = "فایل توسط مدیر حذف شده است";
const CHAT_FILE_TYPE_ERROR = "فرمت فایل مجاز نیست";
const CHAT_FILE_SIZE_ERROR = "حجم فایل بیش از حد مجاز است";
const CHAT_ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.csv";
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_FILE_MAX_BYTES = 15 * 1024 * 1024;
const CHAT_CATEGORIES: Array<{ type: ChatCategory; label: string; shortLabel: string }> = [
  { type: "DM", label: "پیام‌های مستقیم", shortLabel: "مستقیم" },
  { type: "GROUP", label: "گروه‌ها", shortLabel: "گروه" },
  { type: "SHIPMENT", label: "محموله‌ها", shortLabel: "محموله" },
];

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload<T>;
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error?.message || "Chat request failed.") as ChatRequestError;
    error.code = payload.error?.code;
    error.retryAfterMs = payload.error?.retryAfterMs;
    throw error;
  }
  return payload.data as T;
}

async function apiFormData<T>(url: string, body: FormData): Promise<T> {
  const response = await fetch(url, { method: "POST", body });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload<T>;
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error?.message || "Chat upload failed.") as ChatRequestError;
    error.code = payload.error?.code;
    error.retryAfterMs = payload.error?.retryAfterMs;
    throw error;
  }
  return payload.data as T;
}

function displayNameForThread(thread: ChatThread | null, currentUserId?: string) {
  if (!thread) return "";
  if (thread.type === "SHIPMENT") {
    return `محموله ${thread.shipmentCode || thread.shipment?.code || thread.name || thread.id}`;
  }
  if (thread.type === "DM") {
    const other = thread.members.find((member) => member.userId !== currentUserId);
    return other?.displayName || thread.name || "گفتگوی مستقیم";
  }
  return thread.name || "گروه";
}

function initials(name = "U") {
  return name.trim().slice(0, 2).toUpperCase() || "U";
}

function messageText(message: ChatMessage) {
  return message.body || message.content || "";
}

function messagePreviewText(message?: ChatMessage | null) {
  if (!message) return "";
  const body = messageText(message);
  if (body) return body;
  const firstAttachment = message.attachments?.[0];
  if (!firstAttachment) return "";
  return firstAttachment.attachmentType === "image" ? "تصویر" : firstAttachment.filename || "فایل";
}

function attachmentDeletedLabel(attachment: ChatAttachment) {
  return attachment.deletedReason === "deleted_by_manager"
    ? CHAT_FILE_MANAGER_DELETED_MESSAGE
    : CHAT_FILE_DELETED_MESSAGE;
}

function validateAttachmentFile(file: File) {
  const extension = `.${file.name.split(".").pop() || ""}`.toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(extension);
  const isDocument = [".pdf", ".docx", ".xlsx", ".txt", ".csv"].includes(extension);
  if (!isImage && !isDocument) return CHAT_FILE_TYPE_ERROR;
  if (isImage && file.size > CHAT_IMAGE_MAX_BYTES) return CHAT_FILE_SIZE_ERROR;
  if (file.size > CHAT_FILE_MAX_BYTES) return CHAT_FILE_SIZE_ERROR;
  return "";
}

function subtitleForThread(thread: ChatThread) {
  if (thread.type === "SHIPMENT") {
    if (thread.lastMessage) return messagePreviewText(thread.lastMessage);
    return [thread.customerName || thread.shipment?.customerName, thread.shipmentStatus || thread.shipment?.status]
      .filter(Boolean)
      .join(" · ") || "گفتگوی داخلی محموله";
  }
  return thread.lastMessage ? messagePreviewText(thread.lastMessage) : "هنوز پیامی ثبت نشده";
}

const MESSAGE_DATE_FORMATTER = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  minute: "2-digit",
});

function messageTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${MESSAGE_DATE_FORMATTER.format(date)}، ${MESSAGE_TIME_FORMATTER.format(date)}`;
}

export default function Chat() {
  const currentUser = useAppStore((state) => state.currentUser);
  const canManageGroups = Boolean(currentUser?.permissions?.includes("chat.manage_groups"));
  const canDeleteMedia = Boolean(currentUser?.permissions?.includes("chat.media.delete"));
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState(() => new URLSearchParams(window.location.search).get("threadId") || "");
  const [activeCategory, setActiveCategory] = useState<ChatCategory>("DM");
  const [searchTerm, setSearchTerm] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [selectedAttachmentPreviewUrl, setSelectedAttachmentPreviewUrl] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendLockedUntil, setSendLockedUntil] = useState(0);
  const [error, setError] = useState("");
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [isGroupPanelOpen, setIsGroupPanelOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupParticipantIds, setGroupParticipantIds] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSendIdRef = useRef<string | null>(null);
  const sendTimeoutRef = useRef<number | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const historyLoadingRef = useRef(false);
  const historyScrollRestoreRef = useRef<{
    previousHeight: number;
    previousTop: number;
    mode: "prepend" | "preserve";
  } | null>(null);
  const initialBottomScrollTimersRef = useRef<number[]>([]);
  const latestMessageBatchRef = useRef<{ length: number; lastMessageId: string }>({ length: 0, lastMessageId: "" });
  const pendingBottomScrollRef = useRef<ScrollBehavior | null>(null);
  const initialBottomScrolledThreadRef = useRef("");
  const [hasMoreMessages, setHasMoreMessages] = useState(false);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || null,
    [activeThreadId, threads]
  );

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    if (activeThread && activeThread.type !== activeCategory) {
      setActiveCategory(activeThread.type);
    }
  }, [activeCategory, activeThread]);

  useEffect(() => {
    return () => {
      if (selectedAttachmentPreviewUrl) {
        URL.revokeObjectURL(selectedAttachmentPreviewUrl);
      }
    };
  }, [selectedAttachmentPreviewUrl]);

  useEffect(() => {
    if (!sendLockedUntil) return;
    const delay = Math.max(0, sendLockedUntil - Date.now());
    const timer = window.setTimeout(() => setSendLockedUntil(0), delay);
    return () => window.clearTimeout(timer);
  }, [sendLockedUntil]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingUsers((items) => {
        const entries = Object.entries(items) as [string, number][];
        const next = Object.fromEntries(entries.filter(([, expiresAt]) => expiresAt > now)) as Record<string, number>;
        return Object.keys(next).length === Object.keys(items).length ? items : next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const directThreadsByUserId = useMemo(() => {
    const map = new Map<string, ChatThread>();
    for (const thread of threads) {
      if (thread.type !== "DM") continue;
      const other = thread.members.find((member) => member.userId !== currentUser?.id);
      if (other) map.set(other.userId, thread);
    }
    return map;
  }, [currentUser?.id, threads]);

  const threadCountsByCategory = useMemo(() => {
    return CHAT_CATEGORIES.reduce<Record<ChatCategory, { total: number; unread: number }>>(
      (counts, category) => {
        const categoryThreads = threads.filter((thread) => thread.type === category.type);
        counts[category.type] = {
          total: categoryThreads.length,
          unread: categoryThreads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0),
        };
        return counts;
      },
      {
        DM: { total: 0, unread: 0 },
        GROUP: { total: 0, unread: 0 },
        SHIPMENT: { total: 0, unread: 0 },
      }
    );
  }, [threads]);

  const filteredThreads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return threads.filter((thread) => {
      if (thread.type !== activeCategory) return false;
      if (!query) return true;
      const title = displayNameForThread(thread, currentUser?.id).toLowerCase();
      const shipmentText = `${thread.shipmentCode || ""} ${thread.customerName || ""} ${thread.shipmentStatus || ""}`.toLowerCase();
      return title.includes(query) || shipmentText.includes(query);
    });
  }, [activeCategory, currentUser?.id, searchTerm, threads]);

  const filteredParticipants = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return participants.filter((participant) => {
      if (participant.userId === currentUser?.id) return false;
      if (!query) return true;
      return `${participant.displayName} ${participant.email} ${participant.roleName}`.toLowerCase().includes(query);
    });
  }, [currentUser?.id, participants, searchTerm]);

  const isSendLocked = sendLockedUntil > Date.now();

  const activeTypingNames = useMemo(() => {
    const now = Date.now();
    return (Object.entries(typingUsers) as [string, number][])
      .filter(([key, expiresAt]) => key.startsWith(`${activeThreadId}:`) && expiresAt > now)
      .map(([key]) => key.slice(activeThreadId.length + 1))
      .filter((userId) => userId !== currentUser?.id)
      .map((userId) => participants.find((participant) => participant.userId === userId)?.displayName || "همکار")
      .slice(0, 2);
  }, [activeThreadId, currentUser?.id, participants, typingUsers]);

  const loadThreads = async () => {
    const data = await apiJson<ChatThread[]>("/api/chat/threads");
    setThreads(data || []);
    setActiveThreadId((current) => current || data?.[0]?.id || "");
  };

  const loadParticipants = async () => {
    const data = await apiJson<ChatParticipant[]>("/api/chat/participants?limit=100");
    setParticipants(data || []);
  };

  const loadMessages = async (threadId: string, options: { before?: string; mode?: "initial" | "history" } = {}) => {
    if (!threadId) {
      setMessages([]);
      setHasMoreMessages(false);
      return;
    }
    const params = new URLSearchParams({ limit: String(CHAT_MESSAGE_PAGE_SIZE) });
    if (options.before) params.set("before", options.before);
    const data = await apiJson<ChatMessage[]>(
      `/api/chat/threads/${encodeURIComponent(threadId)}/messages?${params.toString()}`
    );
    if (activeThreadIdRef.current !== threadId) return data || [];
    const nextMessages = data || [];
    setHasMoreMessages(nextMessages.length === CHAT_MESSAGE_PAGE_SIZE);
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
  };

  const isMessageListNearBottom = () => {
    const list = messageListRef.current;
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight <= CHAT_BOTTOM_THRESHOLD_PX;
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
    if (!activeThreadId || !oldestMessage || !hasMoreMessages || historyLoadingRef.current) return;
    clearInitialBottomScrollTimers();
    const list = messageListRef.current;
    historyScrollRestoreRef.current = list
      ? { previousHeight: list.scrollHeight, previousTop: list.scrollTop, mode: "prepend" }
      : null;
    historyLoadingRef.current = true;
    try {
      const olderMessages = await loadMessages(activeThreadId, { before: oldestMessage.id, mode: "history" });
      if (!olderMessages?.length) {
        historyScrollRestoreRef.current = null;
      }
    } catch (nextError: any) {
      historyScrollRestoreRef.current = null;
      setError(nextError?.message || "خطا در بارگذاری پیام‌های قبلی");
    } finally {
      historyLoadingRef.current = false;
    }
  };

  const handleMessageListScroll = () => {
    const list = messageListRef.current;
    if (!list || list.scrollHeight <= list.clientHeight) return;
    if (list.scrollTop <= CHAT_HISTORY_TOP_THRESHOLD_PX) {
      void loadOlderMessages();
    }
  };

  const sendSocketEvent = (event: unknown) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(event));
  };

  const clearSendTimeout = () => {
    if (sendTimeoutRef.current) {
      window.clearTimeout(sendTimeoutRef.current);
      sendTimeoutRef.current = null;
    }
  };

  const clearTypingStopTimer = () => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  };

  const applyChatError = (chatError?: { code?: string; message?: string; retryAfterMs?: number }) => {
    if (chatError?.code === "CHAT_RATE_LIMITED") {
      setError(CHAT_RATE_LIMITED_MESSAGE);
      const retryAfterMs = Math.max(250, Number(chatError.retryAfterMs || 0));
      setSendLockedUntil(Date.now() + retryAfterMs);
      return;
    }
    setError(chatError?.message || CHAT_SEND_FAILED_MESSAGE);
  };

  const sendTypingEvent = (type: "typing.start" | "typing.stop") => {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    sendSocketEvent({ type, payload: { threadId } });
  };

  const handleComposerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setNewMessage(value);
    if (!activeThreadIdRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;

    const now = Date.now();
    if (value.trim() && now - lastTypingSentAtRef.current >= CHAT_TYPING_THROTTLE_MS) {
      sendTypingEvent("typing.start");
      lastTypingSentAtRef.current = now;
    }
    clearTypingStopTimer();
    typingStopTimerRef.current = window.setTimeout(() => {
      sendTypingEvent("typing.stop");
    }, CHAT_TYPING_THROTTLE_MS);
  };

  const markActiveThreadRead = async (threadId: string, messageId?: string) => {
    if (!threadId) return;
    await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    }).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([loadThreads(), loadParticipants()])
      .catch((nextError) => {
        if (!cancelled) setError(nextError.message || "خطا در بارگذاری چت");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    clearTypingStopTimer();
    lastTypingSentAtRef.current = 0;
    historyLoadingRef.current = false;
    historyScrollRestoreRef.current = null;
    clearInitialBottomScrollTimers();
    pendingBottomScrollRef.current = activeThreadId ? "auto" : null;
    initialBottomScrolledThreadRef.current = "";
    setHasMoreMessages(false);
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    let cancelled = false;
    loadMessages(activeThreadId)
      .catch((nextError) => {
        if (!cancelled) setError(nextError.message || "خطا در بارگذاری پیام‌ها");
      });
    sendSocketEvent({ type: "thread.join", payload: { threadId: activeThreadId } });
    return () => {
      cancelled = true;
      clearInitialBottomScrollTimers();
      sendSocketEvent({ type: "thread.leave", payload: { threadId: activeThreadId } });
    };
  }, [activeThreadId]);

  useLayoutEffect(() => {
    latestMessageBatchRef.current = {
      length: messages.length,
      lastMessageId: messages[messages.length - 1]?.id || "",
    };
  }, [messages]);

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    if (!activeThreadId || messages.length === 0) return;
    if (initialBottomScrolledThreadRef.current !== activeThreadId) {
      clearInitialBottomScrollTimers();
      scrollMessageListToBottom("auto");
      const initialBatch = {
        threadId: activeThreadId,
        length: messages.length,
        lastMessageId: messages[messages.length - 1]?.id || "",
      };
      const scrollIfStillInitialBatch = () => {
        const currentBatch = latestMessageBatchRef.current;
        if (activeThreadIdRef.current !== initialBatch.threadId) return;
        if (historyLoadingRef.current) return;
        if (currentBatch.length !== initialBatch.length || currentBatch.lastMessageId !== initialBatch.lastMessageId) return;
        scrollMessageListToBottom("auto");
      };
      initialBottomScrollTimersRef.current = [50, 150, 300].map((delay) =>
        window.setTimeout(scrollIfStillInitialBatch, delay)
      );
      pendingBottomScrollRef.current = null;
      initialBottomScrolledThreadRef.current = activeThreadId;
      return;
    }
    const behavior = pendingBottomScrollRef.current;
    if (!behavior) return;
    scrollMessageListToBottom(behavior);
    pendingBottomScrollRef.current = null;
  }, [activeThreadId, messages]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (activeThreadId && lastMessage) {
      void markActiveThreadRead(activeThreadId, lastMessage.id);
    }
  }, [activeThreadId, messages]);

  useEffect(() => {
    if (!currentUser) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const incoming = JSON.parse(event.data);
      if (incoming.type === "connection.ready") {
        void loadThreads();
        if (activeThreadIdRef.current) {
          sendSocketEvent({ type: "thread.join", payload: { threadId: activeThreadIdRef.current } });
        }
        return;
      }
      if (incoming.type === "message.created") {
        const message = incoming.payload as ChatMessage;
        if (message.threadId === activeThreadIdRef.current) {
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
        }
        void loadThreads();
        return;
      }
      if (incoming.type === "message.updated") {
        const { threadId, messageId, attachment } = incoming.payload || {};
        if (threadId === activeThreadIdRef.current && messageId && attachment) {
          setMessages((items) => items.map((item) => {
            if (item.id !== messageId) return item;
            const attachments = item.attachments || [];
            return {
              ...item,
              attachments: attachments.some((current) => current.id === attachment.id)
                ? attachments.map((current) => current.id === attachment.id ? attachment : current)
                : [...attachments, attachment],
            };
          }));
        }
        void loadThreads();
        return;
      }
      if (incoming.type === "message.ack") {
        const acknowledgedId = incoming.payload?.clientMessageId || incoming.requestId;
        if (!pendingSendIdRef.current || pendingSendIdRef.current === acknowledgedId) {
          pendingSendIdRef.current = null;
          clearSendTimeout();
          clearTypingStopTimer();
          setIsSending(false);
          setNewMessage("");
          setError("");
        }
        return;
      }
      if (incoming.type === "thread.updated" || incoming.type === "participant.updated") {
        void loadThreads();
        void loadParticipants();
        return;
      }
      if (incoming.type === "typing.updated") {
        const { threadId, userId, isTyping } = incoming.payload || {};
        if (!threadId || !userId || userId === currentUser?.id) return;
        const key = `${threadId}:${userId}`;
        setTypingUsers((items) => {
          const next = { ...items };
          if (isTyping) {
            next[key] = Date.now() + CHAT_TYPING_THROTTLE_MS + 1500;
          } else {
            delete next[key];
          }
          return next;
        });
        return;
      }
      if (incoming.type === "presence.updated") {
        const { userId, isOnline } = incoming.payload || {};
        setParticipants((items) => items.map((item) => item.userId === userId ? { ...item, isOnline } : item));
        setThreads((items) => items.map((thread) => ({
          ...thread,
          members: thread.members.map((member) => member.userId === userId ? { ...member, isOnline } : member),
        })));
        return;
      }
      if (incoming.type === "error") {
        if (!incoming.requestId || pendingSendIdRef.current === incoming.requestId) {
          pendingSendIdRef.current = null;
          clearSendTimeout();
          setIsSending(false);
        }
        applyChatError(incoming.error);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      pendingSendIdRef.current = null;
      clearSendTimeout();
      setIsSending(false);
    };

    return () => {
      clearSendTimeout();
      clearTypingStopTimer();
      ws.close();
      wsRef.current = null;
    };
  }, [currentUser]);

  const clearSelectedAttachment = () => {
    setSelectedAttachmentFile(null);
    setSelectedAttachmentPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectThread = (threadId: string) => {
    const nextThread = threads.find((thread) => thread.id === threadId);
    if (nextThread && nextThread.type !== activeCategory) {
      setActiveCategory(nextThread.type);
    }
    clearSelectedAttachment();
    setActiveThreadId(threadId);
    window.history.replaceState(null, "", `/chat?threadId=${encodeURIComponent(threadId)}`);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const changeCategory = (category: ChatCategory) => {
    setActiveCategory(category);
    if (category !== "GROUP") setIsGroupPanelOpen(false);
    clearSelectedAttachment();
    const firstThread = threads.find((thread) => thread.type === category);
    if (firstThread) {
      selectThread(firstThread.id);
      return;
    }
    setActiveThreadId("");
    window.history.replaceState(null, "", `/chat`);
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    const validationError = validateAttachmentFile(file);
    if (validationError) {
      setError(validationError);
      clearSelectedAttachment();
      return;
    }
    setError("");
    setSelectedAttachmentFile(file);
    setSelectedAttachmentPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : "");
  };

  const openDirectThread = async (participant: ChatParticipant) => {
    setError("");
    const existing = directThreadsByUserId.get(participant.userId);
    if (existing) {
      selectThread(existing.id);
      return;
    }
    const data = await apiJson<{ id: string }>("/api/chat/direct", {
      method: "POST",
      body: JSON.stringify({ userId: participant.userId }),
    });
    await loadThreads();
    selectThread(data.id);
  };

  const createGroupThread = async () => {
    if (!groupName.trim() || groupParticipantIds.length === 0) return;
    setError("");
    const data = await apiJson<{ id: string }>("/api/chat/threads", {
      method: "POST",
      body: JSON.stringify({
        type: "GROUP",
        name: groupName.trim(),
        participantUserIds: groupParticipantIds,
      }),
    });
    setGroupName("");
    setGroupParticipantIds([]);
    setIsGroupPanelOpen(false);
    await loadThreads();
    selectThread(data.id);
  };

  const toggleGroupParticipant = (userId: string) => {
    setGroupParticipantIds((items) =>
      items.includes(userId) ? items.filter((item) => item !== userId) : [...items, userId]
    );
  };

  const applyAttachmentUpdate = (messageId: string, attachment: ChatAttachment) => {
    setMessages((items) => items.map((item) => {
      if (item.id !== messageId) return item;
      const attachments = item.attachments || [];
      return {
        ...item,
        attachments: attachments.some((current) => current.id === attachment.id)
          ? attachments.map((current) => current.id === attachment.id ? attachment : current)
          : [...attachments, attachment],
      };
    }));
  };

  const deleteAttachment = async (message: ChatMessage, attachment: ChatAttachment) => {
    if (!attachment.downloadUrl && !attachment.previewUrl) return;
    setError("");
    try {
      const data = await apiJson<{ attachment: ChatAttachment }>(
        `/api/chat/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachment.id)}`,
        { method: "DELETE" }
      );
      if (data?.attachment) {
        applyAttachmentUpdate(message.id, data.attachment);
      }
      await loadThreads();
    } catch (nextError: any) {
      setError(nextError?.message || CHAT_SEND_FAILED_MESSAGE);
    }
  };

  const renderMessageAttachments = (message: ChatMessage, isMine: boolean) => {
    const attachments = message.attachments || [];
    if (!attachments.length) return null;
    return (
      <div className="mt-2 flex flex-col gap-2" data-testid="chat-message-attachments">
        {attachments.map((attachment) => {
          const isDeleted = Boolean(attachment.deletedAt);
          const canDeleteAttachment = !isDeleted && (isMine || canDeleteMedia);
          if (isDeleted) {
            return (
              <div
                key={attachment.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold",
                  isMine ? "border-primary-foreground/30 bg-primary-foreground/10" : "border-border bg-muted/40"
                )}
                data-testid="chat-attachment-deleted"
              >
                <FileIcon className="h-4 w-4 shrink-0" />
                <span>{attachmentDeletedLabel(attachment)}</span>
              </div>
            );
          }

          if (attachment.attachmentType === "image" && attachment.previewUrl) {
            return (
              <div key={attachment.id} className="space-y-2" data-testid="chat-image-attachment">
                <a
                  href={attachment.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-border/60 bg-background"
                  aria-label={attachment.filename}
                >
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.filename}
                    className="max-h-64 w-full max-w-sm object-contain"
                    loading="lazy"
                  />
                </a>
                <div className="flex flex-wrap items-center gap-1">
                  <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                    <a href={attachment.previewUrl} target="_blank" rel="noreferrer" aria-label="Preview attachment">
                      <Eye className="h-4 w-4" />
                    </a>
                  </Button>
                  {attachment.downloadUrl && (
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                      <a href={attachment.downloadUrl} target="_blank" rel="noreferrer" aria-label="Download attachment">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {canDeleteAttachment && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                      onClick={() => void deleteAttachment(message, attachment)}
                      aria-label="Delete attachment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <span className="min-w-0 truncate px-1 text-[10px] font-bold opacity-80">
                    {attachment.filename} · {attachment.fileSize}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={attachment.id}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2",
                isMine ? "border-primary-foreground/30 bg-primary-foreground/10" : "border-border bg-muted/40"
              )}
              data-testid="chat-file-attachment"
            >
              <FileIcon className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-black">{attachment.filename}</p>
                <p className="text-[10px] font-bold opacity-75">{attachment.fileSize}</p>
              </div>
              {attachment.downloadUrl && (
                <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg">
                  <a href={attachment.downloadUrl} target="_blank" rel="noreferrer" aria-label="Download attachment">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {canDeleteAttachment && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg text-destructive hover:text-destructive"
                  onClick={() => void deleteAttachment(message, attachment)}
                  aria-label="Delete attachment"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = newMessage.trim();
    if ((!body && !selectedAttachmentFile) || !activeThread || isSending || isSendLocked) return;
    setIsSending(true);
    setError("");
    const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (selectedAttachmentFile) {
      try {
        clearTypingStopTimer();
        const formData = new FormData();
        formData.append("file", selectedAttachmentFile);
        formData.append("caption", body);
        formData.append("clientMessageId", clientMessageId);
        const message = await apiFormData<ChatMessage>(
          `/api/chat/threads/${encodeURIComponent(activeThread.id)}/attachments`,
          formData
        );
        pendingBottomScrollRef.current = "smooth";
        setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
        await loadThreads();
        setNewMessage("");
        clearSelectedAttachment();
      } catch (nextError: any) {
        applyChatError(nextError);
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        pendingSendIdRef.current = clientMessageId;
        clearSendTimeout();
        clearTypingStopTimer();
        wsRef.current.send(JSON.stringify({
          type: "message.send",
          requestId: clientMessageId,
          payload: { threadId: activeThread.id, body, clientMessageId },
        }));
        sendTimeoutRef.current = window.setTimeout(() => {
          if (pendingSendIdRef.current !== clientMessageId) return;
          pendingSendIdRef.current = null;
          setIsSending(false);
          setError(CHAT_SEND_FAILED_MESSAGE);
        }, 10000);
      } catch (nextError: any) {
        pendingSendIdRef.current = null;
        clearSendTimeout();
        setIsSending(false);
        applyChatError({ message: nextError?.message || CHAT_SEND_FAILED_MESSAGE });
      }
      return;
    }

    try {
      clearTypingStopTimer();
      const message = await apiJson<ChatMessage>(`/api/chat/threads/${encodeURIComponent(activeThread.id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, clientMessageId }),
      });
      pendingBottomScrollRef.current = "smooth";
      setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
      await loadThreads();
      setNewMessage("");
    } catch (nextError: any) {
      applyChatError(nextError);
    } finally {
      setIsSending(false);
    }
  };

  const renderParticipantAvatar = (participant: ChatParticipant, size = "h-10 w-10") => (
    <div className="relative shrink-0">
      <Avatar className={cn(size, "border border-border")}>
        <AvatarImage src={participant.avatar} />
        <AvatarFallback className="bg-muted text-xs font-black text-primary">{initials(participant.displayName)}</AvatarFallback>
      </Avatar>
      {participant.isOnline && (
        <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="h-[calc(100dvh-7.5rem)] max-h-[calc(100dvh-7.5rem)] min-h-0 max-w-full overflow-hidden bg-background font-sans lg:h-[calc(100dvh-3.5rem)] lg:max-h-[calc(100dvh-3.5rem)]"
      dir="rtl"
      data-testid="chat-page"
    >
      <div className="flex h-full min-h-0 max-w-full overflow-hidden">
        <aside
          className={cn(
            "absolute inset-0 z-30 flex w-full max-w-full flex-col overflow-hidden border-l border-border bg-card transition lg:relative lg:z-0 lg:w-[22rem] lg:max-w-[22rem]",
            isSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          )}
          data-testid="chat-sidebar"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="جستجوی گفتگو یا همکار"
                className="h-10 rounded-lg pr-10 text-xs font-bold"
              />
            </div>
            {canManageGroups && activeCategory === "GROUP" && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-lg"
                onClick={() => setIsGroupPanelOpen((value) => !value)}
                data-testid="chat-group-toggle"
                aria-label="ساخت گروه"
              >
                {isGroupPanelOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-lg lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="بستن فهرست"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="shrink-0 border-b border-border bg-muted/20 p-2" data-testid="chat-category-tabs">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1">
              {CHAT_CATEGORIES.map((category) => {
                const counts = threadCountsByCategory[category.type];
                const isActive = activeCategory === category.type;
                return (
                  <button
                    key={category.type}
                    type="button"
                    className={cn(
                      "flex h-9 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-black transition",
                      isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => changeCategory(category.type)}
                    data-testid={`chat-category-${category.type.toLowerCase()}`}
                    aria-pressed={isActive}
                  >
                    <span className="truncate">{category.shortLabel}</span>
                    {counts.unread > 0 ? (
                      <span className={cn("rounded-full px-1 text-[9px]", isActive ? "bg-primary-foreground/20" : "bg-primary/10 text-primary")}>
                        {counts.unread}
                      </span>
                    ) : (
                      <span className="text-[9px] opacity-60">{counts.total}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {isGroupPanelOpen && (
            <div className="shrink-0 border-b border-border bg-muted/20 p-3" data-testid="chat-group-panel">
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="نام گروه"
                className="mb-3 h-10 rounded-lg text-xs font-bold"
                maxLength={120}
              />
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background">
                {participants.slice(0, 30).map((participant) => (
                  <label key={participant.userId} className="flex cursor-pointer items-center gap-2 border-b border-border/50 p-2 text-xs font-bold last:border-b-0">
                    <input
                      type="checkbox"
                      checked={groupParticipantIds.includes(participant.userId)}
                      onChange={() => toggleGroupParticipant(participant.userId)}
                    />
                    <span className="truncate">{participant.displayName}</span>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                className="mt-3 h-10 w-full rounded-lg text-xs font-black"
                disabled={!groupName.trim() || groupParticipantIds.length === 0}
                onClick={createGroupThread}
              >
                ساخت گروه
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-black text-muted-foreground">
                <span>{CHAT_CATEGORIES.find((category) => category.type === activeCategory)?.label || "گفتگوها"}</span>
                <Badge variant="secondary" className="rounded-md text-[10px]">
                  {threadCountsByCategory[activeCategory].total}
                </Badge>
              </div>
              <div className="space-y-1" data-testid="chat-thread-list">
                {filteredThreads.map((thread) => {
                  const title = displayNameForThread(thread, currentUser?.id);
                  const isActive = thread.id === activeThreadId;
                  return (
                    <button
                      type="button"
                      key={thread.id}
                      onClick={() => selectThread(thread.id)}
                      className={cn(
                        "flex h-16 w-full items-center gap-3 rounded-lg border px-3 text-right transition",
                        isActive ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent hover:bg-muted"
                      )}
                      data-testid="chat-thread-item"
                    >
                      {thread.type === "DM" ? (
                        renderParticipantAvatar(thread.members.find((member) => member.userId !== currentUser?.id) || thread.members[0] || { displayName: title, userId: thread.id, id: thread.id, name: title, email: "", role: "", roleName: "" })
                      ) : thread.type === "SHIPMENT" ? (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
                          <Ship className="h-5 w-5" />
                        </span>
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Users className="h-5 w-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="block min-w-0 flex-1 truncate text-xs font-black">{title}</span>
                          {thread.type === "SHIPMENT" && (
                            <Badge variant="secondary" className="shrink-0 rounded-md text-[9px]" data-testid="chat-thread-shipment-badge">
                              محموله
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate text-[11px] font-bold text-muted-foreground">
                          {thread.lastMessage ? messagePreviewText(thread.lastMessage) : "هنوز پیامی ثبت نشده"}
                        </span>
                      </span>
                      {Number(thread.unreadCount || 0) > 0 && (
                        <Badge className="h-5 min-w-5 rounded-full px-1 text-[10px]">{thread.unreadCount}</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeCategory === "DM" && (
            <div>
              <div className="mb-2 px-1 text-[11px] font-black text-muted-foreground">همکاران</div>
              <div className="space-y-1" data-testid="chat-participant-list">
                {filteredParticipants.map((participant) => (
                  <button
                    type="button"
                    key={participant.userId}
                    onClick={() => openDirectThread(participant).catch((nextError) => setError(nextError.message))}
                    className="flex h-14 w-full items-center gap-3 rounded-lg px-3 text-right transition hover:bg-muted"
                    data-testid="chat-participant-item"
                  >
                    {renderParticipantAvatar(participant, "h-9 w-9")}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">{participant.displayName}</span>
                      <span className="block truncate text-[11px] font-bold text-muted-foreground">{participant.roleName}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 max-w-full flex-1 flex-col overflow-hidden" data-testid="chat-conversation">
          <header className="flex h-16 min-w-0 shrink-0 items-center justify-between border-b border-border bg-card px-3 md:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-lg lg:hidden"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="نمایش گفتگوها"
                data-testid="chat-mobile-back-button"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
              {activeThread ? (
                <>
                  {activeThread.type === "DM" ? (
                    renderParticipantAvatar(
                      activeThread.members.find((member) => member.userId !== currentUser?.id) ||
                        activeThread.members[0] ||
                        {
                          displayName: displayNameForThread(activeThread, currentUser?.id),
                          userId: activeThread.id,
                          id: activeThread.id,
                          name: activeThread.name,
                          email: "",
                          role: "",
                          roleName: "",
                        },
                      "h-10 w-10"
                    )
                  ) : activeThread.type === "SHIPMENT" ? (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
                      <Ship className="h-5 w-5" />
                    </span>
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Users className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <h1 className="truncate text-sm font-black text-foreground">{displayNameForThread(activeThread, currentUser?.id)}</h1>
                    {activeThread.type === "SHIPMENT" && (
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <Badge variant="secondary" className="shrink-0 rounded-md text-[10px]">
                          گفتگوی محموله
                        </Badge>
                        <span className="min-w-0 truncate text-[11px] font-bold text-muted-foreground">
                          {activeThread.shipmentCode || activeThread.shipment?.code}
                        </span>
                      </div>
                    )}
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                      <Circle className="h-2 w-2 fill-current text-emerald-500" />
                      {activeThread.type === "GROUP" ? `${activeThread.members.length} عضو` : "گفتگوی داخلی شرکت"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <h1 className="text-sm font-black text-foreground">چت شرکت</h1>
                </div>
              )}
            </div>
            {activeThread?.type === "SHIPMENT" && (activeThread.shipmentDetailUrl || activeThread.shipmentId) && (
              <Button
                type="button"
                variant="outline"
                className="hidden h-10 shrink-0 gap-2 rounded-lg text-xs font-black sm:inline-flex"
                onClick={() => {
                  window.location.href = activeThread.shipmentDetailUrl || `/shipments/${encodeURIComponent(activeThread.shipmentId || "")}`;
                }}
                data-testid="chat-open-shipment"
              >
                <ExternalLink className="h-4 w-4" />
                مشاهده محموله
              </Button>
            )}
          </header>

          {error && (
            <div className="mx-4 mt-3 shrink-0 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive" data-testid="chat-error">
              {error}
            </div>
          )}

          <div
            ref={messageListRef}
            className="min-h-0 max-w-full flex-1 overflow-y-auto px-4 py-5"
            data-testid="chat-message-list"
            onScroll={handleMessageListScroll}
          >
            {!activeThread ? (
              <EmptyState
                icon={MessageSquare}
                title="گفتگویی انتخاب نشده"
                description="از فهرست همکاران یک گفتگوی مستقیم شروع کنید یا یک گروه داخلی بسازید."
              />
            ) : messages.length === 0 ? (
              <div className="flex min-h-full items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p className="text-xs font-black">شروع گفتگو</p>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-4xl flex-col gap-3">
                {messages.map((message) => {
                  const isMine = message.senderId === currentUser?.id;
                  const bodyText = messageText(message);
                  return (
                    <div key={message.id} className={cn("flex min-w-0 max-w-full flex-col", isMine ? "items-start" : "items-end")}>
                      {!isMine && activeThread.type !== "DM" && (
                        <span className="mb-1 px-1 text-[11px] font-black text-muted-foreground">{message.senderName}</span>
                      )}
                      <div
                        className={cn(
                          "max-w-[min(34rem,85%)] whitespace-pre-wrap break-words rounded-lg px-4 py-2.5 text-xs font-bold leading-6 shadow-sm [overflow-wrap:anywhere]",
                          isMine
                            ? "rounded-br-none bg-primary text-primary-foreground"
                            : "rounded-bl-none border border-border bg-card text-foreground"
                        )}
                        data-testid="chat-message-bubble"
                      >
                        {bodyText && <div>{bodyText}</div>}
                        {renderMessageAttachments(message, isMine)}
                      </div>
                      <span className="mt-1 px-1 text-[10px] font-bold text-muted-foreground">{messageTimestamp(message.createdAt)}</span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {activeTypingNames.length > 0 && (
            <div className="shrink-0 border-t border-border/70 bg-card px-4 pt-2 text-[11px] font-bold text-muted-foreground" data-testid="chat-typing-indicator">
              {activeTypingNames.join("، ")} در حال نوشتن است
            </div>
          )}

          <form onSubmit={sendMessage} className="shrink-0 border-t border-border bg-card p-3 md:p-4" data-testid="chat-composer">
            <div className="mx-auto w-full max-w-4xl rounded-lg border border-border bg-background p-2 focus-within:border-primary/40">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={CHAT_ATTACHMENT_ACCEPT}
                onChange={handleAttachmentChange}
                data-testid="chat-attachment-input"
              />
              {selectedAttachmentFile && (
                <div className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2" data-testid="chat-selected-attachment">
                  {selectedAttachmentPreviewUrl ? (
                    <img
                      src={selectedAttachmentPreviewUrl}
                      alt={selectedAttachmentFile.name}
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-background text-primary">
                      <FileIcon className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black">{selectedAttachmentFile.name}</p>
                    <p className="text-[10px] font-bold text-muted-foreground">
                      {selectedAttachmentFile.type.startsWith("image/") ? "تصویر" : "فایل"} · {Math.ceil(selectedAttachmentFile.size / 1024)} KB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-lg"
                    onClick={clearSelectedAttachment}
                    aria-label="حذف فایل انتخاب‌شده"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-lg"
                  disabled={!activeThread || isSending || isSendLocked}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="chat-attach-button"
                  aria-label="پیوست فایل"
                  title="پیوست فایل"
                >
                  {selectedAttachmentFile?.type.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
                </Button>
                <Input
                  value={newMessage}
                  onChange={handleComposerChange}
                  disabled={!activeThread}
                  maxLength={CHAT_MESSAGE_MAX_LENGTH}
                  placeholder={activeThread ? "پیام داخلی خود را بنویسید..." : "ابتدا یک گفتگو انتخاب کنید"}
                  className="h-11 min-w-0 flex-1 border-0 bg-transparent text-xs font-bold focus-visible:ring-0"
                  data-testid="chat-message-input"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-lg"
                  disabled={!activeThread || (!newMessage.trim() && !selectedAttachmentFile) || isSending || isSendLocked}
                  data-testid="chat-send-button"
                  aria-label="ارسال پیام"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
