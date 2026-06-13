import React from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  CornerDownLeft,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AiActiveEntity = {
  type: "shipment" | "customer";
  id: string;
  code?: string;
  label?: string;
};

type AiSource = {
  type:
    | "shipment"
    | "customer"
    | "document"
    | "malvani"
    | "captain"
    | "workflow"
    | "task"
    | "cheque"
    | "tariff"
    | "rate"
    | "public_tracking"
    | "chat"
    | "archive"
    | "audit"
    | "user"
    | "system";
  id?: string;
  label: string;
  url?: string;
};

type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: "direct" | "conversational" | "clarification";
  responseMode?: "direct_answer" | "short_summary" | "report";
  sources?: AiSource[];
  suggestions?: string[];
  activeEntity?: AiActiveEntity;
  createdAt?: string;
};

const suggestedPrompts = [
  "تو کی هستی؟",
  "وضعیت بار 14051102036 چیه؟",
  "مشتری بار 14051102036 کیه؟",
  "شماره تماس مشتری رو بده",
  "پرونده 14051102036 چی شد؟",
];

function createChatMessageId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function hasPersianText(value: string) {
  return /[\u0600-\u06ff]/.test(value);
}

function messageTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sourceKey(source: AiSource, index: number) {
  return `${source.type}-${source.id || source.label}-${index}`;
}

function HamyarMessageBubble({
  message,
  isLatestAssistant,
  isSubmitting,
  onSourceClick,
  onSuggestionClick,
}: {
  message: AiChatMessage;
  isLatestAssistant: boolean;
  isSubmitting: boolean;
  onSourceClick: (source: AiSource) => void;
  onSuggestionClick: (suggestion: string) => void;
  key?: React.Key;
}) {
  const isUser = message.role === "user";
  const isPersianAssistantText = !isUser && hasPersianText(message.content);

  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5", isUser ? "items-end" : "items-start")}
      data-testid={isUser ? "hamyar-user-message" : "hamyar-assistant-message"}
    >
      <div className={cn("flex max-w-[min(46rem,92%)] items-end gap-2", isUser && "flex-row-reverse")}>
        {!isUser ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </span>
        ) : null}
        <div
          className={cn(
            "ai-chat-message-text min-w-0 rounded-xl px-4 py-3 text-sm font-bold leading-7 shadow-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground",
            !isUser && (isPersianAssistantText ? "ai-chat-message-text-rtl" : "ai-chat-message-text-ltr")
          )}
          dir={!isUser ? (isPersianAssistantText ? "rtl" : "ltr") : "rtl"}
          data-testid={isLatestAssistant ? "hamyar-latest-answer" : undefined}
        >
          {message.content}
        </div>
      </div>

      <div className={cn("flex max-w-[min(46rem,92%)] items-center gap-2 px-10 text-[10px] font-bold text-muted-foreground", isUser && "justify-end")}>
        <span>{isUser ? "شما" : "همیار"}</span>
        {message.createdAt ? <span>{messageTime(message.createdAt)}</span> : null}
      </div>

      {!isUser && message.sources?.length ? (
        <div className="flex max-w-[min(46rem,92%)] flex-wrap gap-1.5 px-10" data-testid="hamyar-source-chips">
          {message.sources.map((sourceItem, index) => (
            <button
              key={sourceKey(sourceItem, index)}
              type="button"
              className={cn(
                "min-h-8 max-w-full truncate rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-black text-muted-foreground transition-colors",
                sourceItem.url ? "hover:border-primary/40 hover:text-primary" : "cursor-default"
              )}
              onClick={() => onSourceClick(sourceItem)}
              disabled={!sourceItem.url}
              data-testid="hamyar-source-chip"
            >
              {sourceItem.label}
            </button>
          ))}
        </div>
      ) : null}

      {!isUser && isLatestAssistant && message.suggestions?.length ? (
        <div className="flex max-w-[min(46rem,92%)] flex-wrap gap-1.5 px-10" data-testid="hamyar-followup-suggestions">
          {message.suggestions.slice(0, 4).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="min-h-8 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-black leading-5 text-primary transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-60"
              onClick={() => onSuggestionClick(suggestion)}
              disabled={isSubmitting}
              data-testid="hamyar-followup-suggestion"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function HamyarPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = React.useState("");
  const [messages, setMessages] = React.useState<AiChatMessage[]>([]);
  const [activeEntity, setActiveEntity] = React.useState<AiActiveEntity | null>(null);
  const [conversationId, setConversationId] = React.useState(() => createChatMessageId("hamyar"));
  const [error, setError] = React.useState("");
  const [lastFailedPrompt, setLastFailedPrompt] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = React.useState(false);
  const threadEndRef = React.useRef<HTMLDivElement | null>(null);

  const latestAssistantId = React.useMemo(
    () => [...messages].reverse().find((item) => item.role === "assistant")?.id,
    [messages]
  );

  React.useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isSubmitting]);

  const sendMessage = React.useCallback(async (rawMessage: string) => {
    const trimmedMessage = rawMessage.trim();
    if (isSubmitting) return;

    setError("");
    setLastFailedPrompt("");

    if (!trimmedMessage) {
      setError("متن سوال را وارد کنید.");
      return;
    }

    const recentMessages = messages.slice(-8).map((item) => ({
      role: item.role,
      content: item.content,
    }));
    const userMessage: AiChatMessage = {
      id: createChatMessageId("user"),
      role: "user",
      content: trimmedMessage,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage,
          context: "dashboard",
          conversationId,
          recentMessages,
          ...(activeEntity ? { activeEntity } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        navigate("/login");
        return;
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(payload?.error?.message || "پاسخ همیار آماده نشد.");
      }

      const responseData = payload.data || {};
      const assistantMessage: AiChatMessage = {
        id: responseData.id || createChatMessageId("assistant"),
        role: "assistant",
        content: responseData.answer || "همیار هنوز پاسخی برای این سوال ندارد.",
        tone: responseData.tone || "direct",
        responseMode: responseData.responseMode || "direct_answer",
        sources: Array.isArray(responseData.sources) ? responseData.sources : [],
        suggestions: Array.isArray(responseData.suggestions) ? responseData.suggestions : [],
        activeEntity: responseData.activeEntity,
        createdAt: responseData.createdAt || new Date().toISOString(),
      };
      setMessages((current) => [...current, assistantMessage]);
      setActiveEntity(responseData.activeEntity || null);
    } catch (submitError) {
      setLastFailedPrompt(trimmedMessage);
      setError(submitError instanceof Error ? submitError.message : "پاسخ همیار آماده نشد.");
    } finally {
      setIsSubmitting(false);
    }
  }, [activeEntity, conversationId, isSubmitting, messages, navigate]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(draft);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void sendMessage(draft);
  };

  const resetConversation = () => {
    setMessages([]);
    setDraft("");
    setError("");
    setLastFailedPrompt("");
    setActiveEntity(null);
    setConversationId(createChatMessageId("hamyar"));
    setIsSubmitting(false);
    setIsResetDialogOpen(false);
  };

  const openSource = (sourceItem: AiSource) => {
    if (!sourceItem.url) return;
    navigate(sourceItem.url);
  };

  return (
    <div className="app-page flex min-h-full max-w-[1500px] flex-col gap-4 overflow-x-hidden font-sans" dir="rtl" data-testid="hamyar-page">
      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-foreground md:text-2xl">همیار</h1>
              <Badge variant="outline" className="h-6 rounded-lg px-2 text-[11px] font-black">
                چت هوش مصنوعی
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs font-bold leading-6 text-muted-foreground md:text-sm">
              برای جستجوی امن در محموله‌ها، مشتری‌ها، اسناد، وظایف و وضعیت پرونده‌ها سوال بپرسید. دسترسی همیار همان دسترسی امن داشبورد است.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full gap-2 rounded-lg text-xs font-black sm:w-fit"
          onClick={() => setIsResetDialogOpen(true)}
          disabled={isSubmitting && messages.length === 0}
          data-testid="hamyar-reset-open"
        >
          <Trash2 className="h-4 w-4" />
          پاک کردن گفتگو
        </Button>
      </section>

      <section className="grid min-h-[calc(100dvh-13rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4" data-testid="hamyar-thread">
            {messages.length === 0 ? (
              <div className="grid min-h-[22rem] place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
                <div className="max-w-xl">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Bot className="h-7 w-7" />
                  </span>
                  <h2 className="mt-4 text-lg font-black text-foreground">از همیار سوال بپرسید</h2>
                  <p className="mt-2 text-sm font-bold leading-7 text-muted-foreground">
                    همیار پاسخ را از ابزارهای امن برنامه و داده‌های مجاز سازمانی می‌سازد. برای ادامه گفتگو، سوال بعدی را طبیعی و کوتاه بنویسید.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {suggestedPrompts.slice(0, 3).map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="min-h-9 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-black text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
                        onClick={() => void sendMessage(prompt)}
                        disabled={isSubmitting}
                        data-testid="hamyar-empty-suggestion"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {messages.map((message) => (
              <HamyarMessageBubble
                key={message.id}
                message={message}
                isLatestAssistant={message.id === latestAssistantId}
                isSubmitting={isSubmitting}
                onSourceClick={openSource}
                onSuggestionClick={(suggestion) => void sendMessage(suggestion)}
              />
            ))}

            {isSubmitting ? (
              <div className="flex items-start" data-testid="hamyar-typing">
                <div className="flex max-w-[min(46rem,92%)] items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  همیار در حال بررسی...
                </div>
              </div>
            ) : null}
            <div ref={threadEndRef} />
          </div>

          <div className="border-t border-border bg-card p-3 sm:p-4">
            {error ? (
              <div className="mb-3 flex flex-col gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-bold text-destructive sm:flex-row sm:items-center sm:justify-between" data-testid="hamyar-error">
                <span className="flex min-w-0 items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="break-words">{error}</span>
                </span>
                {lastFailedPrompt ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-full gap-2 rounded-lg border-destructive/30 text-xs font-black text-destructive hover:bg-destructive/10 sm:w-fit"
                    onClick={() => void sendMessage(lastFailedPrompt)}
                    disabled={isSubmitting}
                    data-testid="hamyar-retry"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    تلاش دوباره
                  </Button>
                ) : null}
              </div>
            ) : null}

            <form className="space-y-2" onSubmit={handleSubmit}>
              <label htmlFor="hamyar-input" className="sr-only">
                پیام به همیار
              </label>
              <textarea
                id="hamyar-input"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (error) setError("");
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="سوال خود را بنویسید..."
                className="min-h-24 w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-sm font-bold leading-7 outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25"
                disabled={isSubmitting}
                data-testid="hamyar-input"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="h-7 rounded-lg px-2 text-[11px] font-black">
                    {activeEntity?.label || "گفتگوی مستقل"}
                  </Badge>
                  <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    Enter ارسال، Shift+Enter خط جدید
                  </span>
                </div>
                <Button type="submit" className="h-10 w-full gap-2 rounded-lg text-xs font-black sm:w-fit" disabled={isSubmitting || !draft.trim()} data-testid="hamyar-submit">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  ارسال
                </Button>
              </div>
            </form>
          </div>
        </div>

        <aside className="grid content-start gap-3 lg:sticky lg:top-16">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-black text-foreground">دسترسی امن</h2>
            </div>
            <p className="mt-2 text-xs font-bold leading-6 text-muted-foreground">
              همیار فقط از مسیر احراز هویت شده و ابزارهای خواندنی مجاز استفاده می‌کند. پاک کردن گفتگو سابقه سرور یا لاگ حسابرسی را حذف نمی‌کند.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black text-foreground">پیشنهاد سوال</h2>
            </div>
            <div className="mt-3 grid gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-right text-xs font-black leading-5 text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:opacity-60"
                  onClick={() => void sendMessage(prompt)}
                  disabled={isSubmitting}
                  data-testid="hamyar-suggested-prompt"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-black text-foreground">بهترین نتیجه</h2>
            </div>
            <p className="mt-2 text-xs font-bold leading-6 text-muted-foreground">
              برای پرونده‌ها، کد محموله یا کد مشتری را همراه سوال بنویسید. بعد از پیدا شدن رکورد، سوال‌های بعدی همان زمینه را حفظ می‌کنند.
            </p>
          </div>
        </aside>
      </section>

      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black">پاک کردن گفتگوی همیار؟</DialogTitle>
            <DialogDescription className="text-right text-sm font-bold leading-7 text-muted-foreground">
              پیام‌های فعلی همین صفحه پاک می‌شود و یک شناسه گفتگوی جدید شروع می‌شود. این کار هیچ رکورد سرور، لاگ حسابرسی یا سابقه پایگاه داده را حذف نمی‌کند.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            <Button type="button" variant="outline" className="h-10 rounded-lg text-xs font-black" onClick={() => setIsResetDialogOpen(false)} data-testid="hamyar-reset-cancel">
              انصراف
            </Button>
            <Button type="button" className="h-10 rounded-lg text-xs font-black" onClick={resetConversation} data-testid="hamyar-reset-confirm">
              شروع گفتگوی جدید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
