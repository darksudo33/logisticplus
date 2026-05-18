import React, { useState, useMemo, useEffect, useRef } from "react";
import { useMockStore } from "@/src/store/useMockStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Send, 
  MoreVertical, 
  Plus, 
  MessageSquare,
  Users,
  Truck,
  CreditCard,
  Shield,
  Hash,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Channel } from "../types";
import { EmptyState } from "@/src/components/EmptyState";

const CHAT_DISABLED = true;

type ChatTarget = {
  type: "DM" | "CHANNEL";
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  isOnline?: boolean;
};

const ChannelIcon = ({ icon, className }: { icon?: string; className?: string }) => {
  switch (icon) {
    case "Users": return <Users className={className} />;
    case "Truck": return <Truck className={className} />;
    case "CreditCard": return <CreditCard className={className} />;
    case "Shield": return <Shield className={className} />;
    default: return <Hash className={className} />;
  }
};

export default function Chat() {
  const users = useMockStore(state => state.users);
  const currentUser = useMockStore(state => state.currentUser);
  const channels = useMockStore(state => state.channels);
  const [threads, setThreads] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const initialTarget: ChatTarget = channels.length > 0
    ? { type: "CHANNEL", id: channels[0].id, name: channels[0].name }
    : { type: "DM", id: users[0]?.id || "", name: users[0]?.name || "", isOnline: users[0]?.isOnline };

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTarget, setActiveTarget] = useState<ChatTarget>(initialTarget);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const chatMessages = useMemo(() => messages, [messages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (CHAT_DISABLED) return;
    scrollToBottom();
  }, [chatMessages]);

  const loadThreads = async () => {
    if (CHAT_DISABLED) return;
    const response = await fetch("/api/chat/threads");
    const payload = await response.json();
    if (payload?.ok) {
      setThreads(payload.data || []);
      if (!activeTarget.id && payload.data?.[0]) {
        setActiveTarget({ type: payload.data[0].type === "DM" ? "DM" : "CHANNEL", id: payload.data[0].id, name: payload.data[0].name || "Chat" });
      }
    }
  };

  const loadMessages = async (threadId: string) => {
    if (CHAT_DISABLED) return;
    if (!threadId) return;
    const response = await fetch(`/api/chat/threads/${threadId}/messages`);
    const payload = await response.json();
    if (payload?.ok) setMessages(payload.data || []);
  };

  useEffect(() => {
    if (CHAT_DISABLED) return;
    loadThreads();
  }, []);

  useEffect(() => {
    if (CHAT_DISABLED) return;
    loadMessages(activeTarget.id);
  }, [activeTarget.id]);

  useEffect(() => {
    if (CHAT_DISABLED) return;
    if (!currentUser) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "message.created" && message.payload?.threadId === activeTarget.id) {
        setMessages((items) => items.some((item) => item.id === message.payload.id) ? items : [...items, message.payload]);
      }
      if (message.type === "thread.updated") loadThreads();
    };
    ws.onopen = () => {
      loadThreads();
      if (activeTarget.id) loadMessages(activeTarget.id);
    };
    ws.onclose = () => {
      setTimeout(loadThreads, 1000);
    };
    return () => ws.close();
  }, [currentUser, activeTarget.id]);

  const handleSetTarget = async (target: ChatTarget) => {
    if (CHAT_DISABLED) return;
    if (target.type === "DM") {
      const response = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "DM", memberId: target.id }),
      });
      const payload = await response.json();
      if (payload?.ok) {
        setActiveTarget({ ...target, id: payload.data.id });
      }
    } else {
      setActiveTarget(target);
    }
    // On mobile, close sidebar when target selected
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (CHAT_DISABLED) return;
    if (!newMessage.trim() || !currentUser) return;

    wsRef.current?.send(JSON.stringify({
      type: "message.send",
      payload: {
        threadId: activeTarget.id,
        content: newMessage,
        legacyData: {
          receiverId: activeTarget.type === "DM" ? activeTarget.id : undefined,
          receiverName: activeTarget.type === "DM" ? activeTarget.name : undefined,
          groupId: activeTarget.type === "CHANNEL" ? activeTarget.id : undefined,
          isGroup: activeTarget.type === "CHANNEL",
        },
      },
    }));
    setNewMessage("");
  };

  const filteredUsers = users.filter(u => 
    u.id !== currentUser?.id && 
    (u.name.includes(searchTerm) || u.role.includes(searchTerm))
  );

  const canonicalChannels = threads.filter((thread) => thread.type !== "DM").map((thread) => ({
    id: thread.id,
    name: thread.name,
    description: thread.description,
    roleLimit: thread.roleLimit,
    icon: thread.icon,
  })) as Channel[];
  const filteredChannels = (canonicalChannels.length ? canonicalChannels : channels).filter(c => {
    if (!currentUser) return false;
    // Simple permission check: if roleLimit is set, check if user has it OR is CEO
    if (c.roleLimit && currentUser.role !== "CEO" && currentUser.role !== c.roleLimit) {
      return false;
    }
    return c.name.includes(searchTerm);
  });

  if (CHAT_DISABLED) {
    return (
      <div className="app-page max-w-5xl space-y-5 font-sans" dir="rtl">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">گفت‌وگوی تیمی</h1>
              <p className="mt-1 text-sm font-bold leading-6 text-muted-foreground">
                این بخش بدون داده نمایشی آماده می‌ماند تا بعد از فعال‌سازی، گفتگوهای واقعی تیم را نشان بدهد.
              </p>
            </div>
          </div>
        </div>
        <EmptyState
          icon={MessageSquare}
          title="هنوز گفت‌وگویی برای نمایش وجود ندارد"
          description="در نسخه فعلی، چت تیمی فقط به‌عنوان فضای آماده‌سازی نگه داشته شده و هیچ پیام یا کانال نمونه‌ای نمایش داده نمی‌شود."
          primaryAction={{ label: "مدیریت اعضای تیم", to: "/management", icon: Users, variant: "outline" }}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden font-sans relative bg-background" dir="rtl">
      {CHAT_DISABLED && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/35 px-4 backdrop-blur-[2px]">
          <div className="max-w-md rounded-xl border border-border bg-card/95 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageSquare className="h-7 w-7" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-primary">Coming Soon</p>
            <h1 className="mt-2 text-2xl font-black text-foreground">چت به‌زودی فعال می‌شود</h1>
            <p className="mt-3 text-sm font-medium leading-7 text-muted-foreground">
              این بخش برای نسخه‌های بعدی برنامه نگه داشته شده و فعلاً فقط به‌صورت پیش‌نمایش نمایش داده می‌شود.
            </p>
          </div>
        </div>
      )}
      <div className={cn("h-full flex overflow-hidden bg-background transition", CHAT_DISABLED && "pointer-events-none select-none blur-sm opacity-45")} aria-hidden={CHAT_DISABLED}>
      {/* Sidebar - responsive handling */}
      <div className={cn(
        "absolute inset-0 z-30 lg:relative lg:z-0 lg:flex w-full lg:w-80 border-l border-border flex flex-col bg-card transition-all duration-300",
        isSidebarOpen ? "translate-x-0 opacity-100" : "translate-x-full lg:translate-x-0 opacity-0 lg:opacity-100 pointer-events-none lg:pointer-events-auto"
      )}>
        <div className="p-4 shrink-0 flex items-center justify-between border-b border-border/30">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input 
              placeholder="جستجو در گفتگوها..." 
              className="bg-muted border-border pr-10 h-10 rounded-xl text-[11px] focus:ring-primary" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden mr-2 text-muted-foreground hover:text-foreground" onClick={() => setIsSidebarOpen(false)}>
            <Plus className="w-5 h-5 rotate-45" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-3 pb-8 space-y-6">
            {/* Channels Section */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground px-3 mb-3 uppercase tracking-wide flex items-center justify-between">
                کانال‌های سازمانی
                <Plus className="w-3 h-3 cursor-pointer hover:text-foreground" />
              </h3>
              <div className="space-y-1">
                {filteredChannels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleSetTarget({ type: "CHANNEL", id: channel.id, name: channel.name })}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-right group border border-transparent",
                      activeTarget.type === "CHANNEL" && activeTarget.id === channel.id 
                        ? "bg-primary/10 text-foreground shadow-sm border-primary/20" 
                        : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      activeTarget.type === "CHANNEL" && activeTarget.id === channel.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground"
                    )}>
                      <ChannelIcon icon={channel.icon} className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-xs font-bold truncate",
                        activeTarget.type === "CHANNEL" && activeTarget.id === channel.id ? "text-primary" : "group-hover:text-foreground"
                      )}>{channel.name}</p>
                      <p className="text-[11px] opacity-50 truncate">آخرین پیام در این کانال...</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Direct Messages Section */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground px-3 mb-3 uppercase tracking-wide">گفتگوهای خصوصی</h3>
              <div className="space-y-1">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSetTarget({ 
                      type: "DM", 
                      id: user.id, 
                      name: user.name, 
                      avatar: user.avatar,
                      isOnline: user.isOnline 
                    })}
                    className={cn(
                      "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-right group border border-transparent",
                      activeTarget.type === "DM" && activeTarget.id === user.id 
                        ? "bg-primary/10 text-foreground border-primary/20" 
                        : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="w-10 h-10 border border-border">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="bg-muted text-xs font-bold">{(user.name || "U")[0]}</AvatarFallback>
                      </Avatar>
                      {user.isOnline && (
                        <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                       <p className={cn(
                        "text-xs font-bold truncate",
                        activeTarget.type === "DM" && activeTarget.id === user.id ? "text-primary" : "group-hover:text-foreground"
                      )}>{user.name}</p>
                       <p className="text-[11px] opacity-50 truncate">{user.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative">
        {/* Header */}
        <div className="h-14 md:h-16 px-3 md:px-6 border-b border-border flex items-center justify-between shrink-0 bg-card sticky top-0 z-20">
          <div className="flex items-center gap-2 md:gap-3">
             <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9 text-primary hover:bg-primary/10 rounded-xl" onClick={() => setIsSidebarOpen(true)}>
               <ArrowRight className="w-5 h-5" />
             </Button>
             {activeTarget.type === "DM" ? (
               <div className="relative">
                 <Avatar className="h-9 w-9 md:h-10 md:w-10 border border-border">
                    <AvatarImage src={activeTarget.avatar} />
                    <AvatarFallback className="bg-muted font-bold">{(activeTarget.name || "U")[0]}</AvatarFallback>
                 </Avatar>
                 {activeTarget.isOnline && (
                   <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                 )}
               </div>
             ) : (
               <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                  <ChannelIcon icon={channels.find(c => c.id === activeTarget.id)?.icon} className="w-5 h-5" />
               </div>
             )}
             <div className="min-w-0">
                <h4 className="font-bold text-xs md:text-sm tracking-tight truncate">{activeTarget.name}</h4>
                <div className="flex items-center gap-1.5">
                   <span className="text-[11px] md:text-xs text-muted-foreground font-medium truncate">
                     {activeTarget.type === "DM" ? (activeTarget.isOnline ? "در دسترس" : "نامشخص") : "کانال عمومی"}
                   </span>
                </div>
             </div>
          </div>
          <div className="flex items-center gap-0.5 md:gap-1">
            <Separator orientation="vertical" className="h-5 bg-border mx-1 sm:mx-2" />
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-lg h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Message Viewport */}
        <div className="flex-1 overflow-y-auto bg-background/50 scroll-smooth px-4 md:px-6 pt-6 pb-4">
          <div className="flex flex-col gap-6 min-h-full">
            {chatMessages.length === 0 && (
               <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center mb-4 border border-border transition-all opacity-40">
                     <MessageSquare className="w-10 h-10" />
                  </div>
                  <p className="text-xs font-bold tracking-wide uppercase opacity-60">آغاز گفتگو</p>
               </div>
            )}
            
            <div className="space-y-6">
              {chatMessages.map((msg, index) => {
                const isMe = msg.senderId === currentUser?.id;
                const showSender = activeTarget.type === "CHANNEL" && !isMe;
                
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                      isMe ? "items-start" : "items-end"
                    )}
                  >
                    {showSender && (
                      <span className="text-xs font-bold text-muted-foreground mb-1 pr-1">{msg.senderName}</span>
                    )}
                    <div className="flex items-end gap-1.5 max-w-[90%] md:max-w-[70%] lg:max-w-[50%]">
                      <div
                        className={cn(
                          "px-3.5 py-2.5 md:px-5 md:py-3 rounded-2xl text-[12px] md:text-[13px] leading-relaxed shadow-sm",
                          isMe 
                            ? "bg-primary text-primary-foreground font-black rounded-br-none" 
                            : "bg-muted text-foreground border border-border rounded-bl-none font-medium"
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-2 px-1 font-mono">
                      {msg.createdAt?.split?.(' ')?.slice(-1)}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Dynamic Composing Area */}
          <div className="p-4 bg-card shrink-0 border-t border-border">
          <form onSubmit={handleSendMessage} className="flex items-center gap-3 bg-background p-2 rounded-xl border border-border shadow-sm transition-all focus-within:border-primary/30 group">
             <Button variant="ghost" size="icon" type="button" className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl h-11 w-11 transition-all">
                <Plus className="w-5 h-5" />
             </Button>
             <Input 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`ارسال پیام به ${activeTarget.name}...`} 
                className="flex-1 bg-transparent border-none focus-visible:ring-0 placeholder:text-muted-foreground h-11 text-xs" 
             />
             <Button 
               type="submit" 
               size="icon" 
               disabled={!newMessage.trim()}
               className={cn(
                 "rounded-xl h-11 w-11 transition-all shadow-lg",
                 newMessage.trim() ? "bg-primary text-primary-foreground scale-100" : "bg-muted text-muted-foreground scale-95 opacity-50"
               )}
             >
                <Send className="w-5 h-5 shrink-0" />
             </Button>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}
