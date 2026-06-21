/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { format } from "date-fns-jalali";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { LayoutDashboard, Ship, Users, CheckSquare, MessageSquare, ChevronRight, ChevronLeft, LogOut, Search, Bell, FileText, FileSearch, History, Settings as SettingsIcon, Menu, ShieldCheck, CreditCard, Archive, Calculator, X, Sun, Moon, IdCard, ClipboardList, GitBranch, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXITED_SHIPMENTS_NAV_ENABLED, QUOTATIONS_UI_ENABLED, SHIPMENT_TEMPLATE_ADMIN_UI_ENABLED } from "@/src/config/features";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GlobalSearch } from "@/src/components/search/GlobalSearch";
import { useCurrentUserPermissions } from "@/src/hooks/useCurrentUserPermissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const sidebarItems = [
  { icon: ShieldCheck, label: "ادمین پلتفرم", path: "/admin", platformOnly: true },
  { icon: LayoutDashboard, label: "داشبورد", path: "/dashboard" },
  { icon: FileSearch, label: "مرکز مدیریت اسناد", path: "/documents/management-center", permissions: ["documents.view_all", "shipments.view_all"] },
  { icon: ClipboardList, label: "وضعیت روزانه", path: "/daily-status" },
  { icon: Ship, label: "محموله‌ها", path: "/shipments" },
  { icon: Archive, label: "محموله‌های خروج‌شده", path: "/shipments/exited", permission: "shipments.view_all", enabled: EXITED_SHIPMENTS_NAV_ENABLED },
  { icon: MessageSquare, label: "چت داخلی", path: "/chat", permission: "chat.use" },
  { icon: Users, label: "مراجعات حضوری", path: "/compliance-meetings" },
  { icon: CheckSquare, label: "وظایف", path: "/tasks" },
  { icon: IdCard, label: "کارت‌های بازرگانی", path: "/commercial-cards" },
  { icon: Users, label: "مشتریان", path: "/customers", roles: ["CEO", "MANAGER"] },
  { icon: ShieldCheck, label: "مدیریت کاربران", path: "/management", ceoOnly: true },
  { icon: FileText, label: "اسناد", path: "/documents" },
  { icon: CreditCard, label: "چک‌ها", path: "/cheques" },
  { icon: Archive, label: "آرشیو", path: "/archive" },
  { icon: History, label: "تغییرات", path: "/changelog" },
  { icon: Banknote, label: "نرخ‌ها و تعرفه‌ها", path: "/rates" },
  ...(SHIPMENT_TEMPLATE_ADMIN_UI_ENABLED
    ? [
      { icon: SettingsIcon, label: "فرم‌های نوع محموله", path: "/admin/shipment-form-templates", permission: "shipment_forms.manage" },
      { icon: GitBranch, label: "قالب گردش کار محموله‌ها", path: "/admin/workflow-templates", permission: "shipment_workflows.manage" },
    ]
    : []),
  ...(QUOTATIONS_UI_ENABLED ? [{ icon: Calculator, label: "مدیریت کوتاژ", path: "/quotations" }] : []),
];

function canShowSidebarItem(item: (typeof sidebarItems)[number], currentUser: any) {
  if ((item as any).enabled === false) return false;
  if ((item as any).platformOnly) return false;
  if ((item as any).ceoOnly && currentUser?.role !== "CEO") return false;
  const roles = (item as any).roles;
  if (Array.isArray(roles) && roles.length && !roles.includes(currentUser?.role)) return false;
  const permission = (item as any).permission;
  const permissions = (item as any).permissions;
  const userPermissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
  if (Array.isArray(permissions) && permissions.length) {
    return permissions.every((requiredPermission) => userPermissions.includes(requiredPermission));
  }
  if (!permission) return true;
  return userPermissions.includes(permission);
}

function isSidebarItemActive(pathname: string, itemPath: string) {
  if (itemPath === "/documents") return pathname === "/documents";
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAppStore(state => state.currentUser);
  const setCurrentUser = useAppStore(state => state.setCurrentUser);
  const { isPlatformAdmin } = useCurrentUserPermissions();

  const menuItems = sidebarItems.filter(item => canShowSidebarItem(item, currentUser));

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST" }).catch((error) => {
      console.error("Logout failed:", error);
    });
    setCurrentUser(null);
    navigate("/login");
  };

  return (
    <div className={cn(
      "h-screen min-h-0 bg-card/95 backdrop-blur-xl border-l border-border/80 transition-all duration-300 hidden lg:flex flex-col pt-3",
      collapsed ? "w-[72px]" : "w-[224px]"
    )}>
      <div className={cn("px-3 mb-4 flex items-center gap-2 font-sans", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(triggerProps) => (
                <Button {...triggerProps} variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-2.5 rounded-xl border border-transparent p-2 text-right hover:border-border hover:bg-muted/60">
                  <Avatar className="w-9 h-9 border border-border">
                    <AvatarImage src={currentUser?.avatar} />
                    <AvatarFallback className="bg-muted text-xs font-black text-primary">{currentUser?.name?.substring(0, 2) || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-foreground">{currentUser?.name}</p>
                    <p className="truncate text-[10px] font-bold text-muted-foreground">{currentUser?.role}</p>
                  </div>
                </Button>
              )}
            />
            <DropdownMenuContent className="w-56 bg-popover border-border p-1" align="start">
              <DropdownMenuGroup className="p-2 border-b border-border text-right">
                <p className="text-[11px] font-bold text-foreground">{currentUser?.name}</p>
                <p className="text-[9px] text-muted-foreground">{currentUser?.email}</p>
              </DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate("/profile")} className="focus:bg-accent cursor-pointer text-xs text-right w-full flex items-center justify-between rounded-lg h-9 mt-1">
                <span>مشاهده پروفایل</span>
                <Users className="w-3 h-3 text-primary" />
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")} className="focus:bg-accent cursor-pointer text-xs text-right w-full flex items-center justify-between rounded-lg h-9">
                <span>تنظیمات حساب</span>
                <SettingsIcon className="w-3 h-3 text-primary" />
              </DropdownMenuItem>
              {isPlatformAdmin && (
                <DropdownMenuItem data-testid="admin-console-shortcut-menu" onClick={() => navigate("/platform-admin")} className="focus:bg-accent cursor-pointer text-xs text-right w-full flex items-center justify-between rounded-lg h-9">
                  <span>Admin Console</span>
                  <ShieldCheck className="w-3 h-3 text-primary" />
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 cursor-pointer text-xs rounded-lg h-9">
                <LogOut className="w-3 h-3 ml-2" />
                <span>خروج از سامانه</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {collapsed && (
          <Avatar className="w-9 h-9 border border-border">
            <AvatarImage src={currentUser?.avatar} />
            <AvatarFallback className="bg-muted text-xs font-black text-primary">{currentUser?.name?.substring(0, 2) || "U"}</AvatarFallback>
          </Avatar>
        )}
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted">
          {collapsed ? <ChevronLeft /> : <ChevronRight />}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 font-sans">
        <nav className="space-y-1 pb-6">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition-colors",
                isSidebarItemActive(location.pathname, item.path)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              {isSidebarItemActive(location.pathname, item.path) && !collapsed && (
                <span className="absolute right-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-l-full bg-primary" />
              )}
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                  isSidebarItemActive(location.pathname, item.path)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                )}
              >
                <item.icon className="h-4 w-4" />
              </span>
              {!collapsed && <span className="truncate font-bold">{item.label}</span>}
            </Link>
          ))}
        </nav>
      </ScrollArea>

      <div className="mx-3 h-3 border-t border-border/60" />
    </div>
  );
}

export function TopBar() {
  const currentUser = useAppStore(state => state.currentUser);
  const setCurrentUser = useAppStore(state => state.setCurrentUser);
  const notifications = useAppStore(state => state.notifications);
  const markNotificationRead = useAppStore(state => state.markNotificationRead);
  const markAllNotificationsRead = useAppStore(state => state.markAllNotificationsRead);
  const navigate = useNavigate();
  const location = useLocation();

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const currentTheme = useAppStore(state => state.currentTheme);
  const toggleTheme = useAppStore(state => state.toggleTheme);
  const { isPlatformAdmin } = useCurrentUserPermissions();

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST" }).catch((error) => {
      console.error("Logout failed:", error);
    });
    setCurrentUser(null);
    navigate("/login");
  };

  const notificationTime = (createdAt: string) => {
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? "" : format(date, "HH:mm");
  };

  const handleNotificationClick = (id: string, link?: string) => {
    void markNotificationRead(id).catch((error) => {
      console.error("Notification read update failed:", error);
    });
    if (link) navigate(link);
  };

  const menuItems = sidebarItems.filter(item => canShowSidebarItem(item, currentUser));

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const dateString = format(currentTime, "EEEE، d MMMM yyyy");
  const timeString = format(currentTime, "HH:mm");

  return (
    <header className="h-14 bg-card/80 backdrop-blur-xl border-b border-border/80 px-4 md:px-5 flex items-center justify-between sticky top-0 z-30 font-sans">
      <div className="flex items-center gap-3 md:gap-4 flex-1">
        {/* Mobile Menu Trigger */}
        <Sheet>
          <SheetTrigger render={(triggerProps) => (
            <Button {...triggerProps} data-testid="mobile-nav-trigger" variant="ghost" size="icon" className="lg:hidden text-muted-foreground">
              <Menu className="w-5 h-5" />
            </Button>
          )} />
          <SheetContent side="right" className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-[280px] flex-col overflow-hidden bg-card p-0 text-right font-sans border-border" dir="rtl">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
            
            <SheetHeader className="p-6 border-b border-border relative z-10 bg-card/80 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-xl font-black text-foreground flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.24)]">
                    <Ship className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <span>لجستیک پلاس</span>
                </SheetTitle>
              </div>
            </SheetHeader>

            <ScrollArea className="relative z-10 min-h-0 flex-1">
              <nav className="p-4 space-y-1.5 focus-visible:outline-none">
                {menuItems.map((item, idx) => (
                  <motion.div
                    key={item.path}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all text-sm group relative overflow-hidden",
                        isSidebarItemActive(location.pathname, item.path)
                          ? "bg-primary text-primary-foreground font-black shadow-[0_4px_12px_rgba(37,99,235,0.18)]"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <item.icon className={cn("w-4 h-4", isSidebarItemActive(location.pathname, item.path) ? "text-primary-foreground" : "group-hover:text-primary")} />
                      <span className="relative z-10">{item.label}</span>
                      {isSidebarItemActive(location.pathname, item.path) && (
                        <motion.div 
                          layoutId="active-pill"
                          className="absolute inset-0 bg-white/10"
                        />
                      )}
                    </Link>
                  </motion.div>
                ))}
              </nav>
            </ScrollArea>

            <div className="relative z-10 mt-auto shrink-0 border-t border-border bg-card/80 p-4 backdrop-blur-xl">
               <div className="bg-muted/40 rounded-3xl p-3 border border-border flex items-center gap-3 group">
                  <div className="relative">
                    <Avatar className="w-10 h-10 border-2 border-primary/20 group-hover:border-primary/50 transition-colors">
                      <AvatarImage src={currentUser?.avatar} />
                      <AvatarFallback className="bg-muted text-xs font-black text-primary">{currentUser?.name?.substring(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-background rounded-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-black text-foreground truncate">{currentUser?.name}</p>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3 text-primary" />
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">{currentUser?.role}</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
               </div>
               <p className="text-[10px] text-muted-foreground/60 text-center mt-3 font-medium">Logistic Plus v2.4.0</p>
            </div>
          </SheetContent>
        </Sheet>

        <GlobalSearch />

        {/* Global Search - Hidden on very small screens */}
        <div className="hidden">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="جستجو پیشرفته..." className="bg-muted border-border pr-10 focus-visible:ring-primary/50 h-9 text-[11px] text-muted-foreground rounded-lg" />
        </div>
        
        {/* Mobile Search Icon only */}
        <Button variant="ghost" size="icon" className="hidden">
          <Search className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {isPlatformAdmin && (
          <Button
            data-testid="admin-console-shortcut"
            variant="outline"
            className="hidden h-9 rounded-xl px-3 text-xs font-black text-primary sm:inline-flex"
            onClick={() => navigate("/platform-admin")}
          >
            <ShieldCheck className="ml-2 h-4 w-4" />
            Admin Console
          </Button>
        )}

        <div className="hidden xl:flex items-center gap-3 text-muted-foreground bg-muted/50 px-4 py-1.5 rounded-full border border-border">
          <span className="text-[11px] font-medium tracking-tight">{dateString}</span>
          <div className="w-[1px] h-3 bg-border" />
          <span className="text-[11px] font-black text-primary font-mono tabular-nums">{timeString}</span>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger
            render={(triggerProps) => (
              <Button {...triggerProps} variant="ghost" size="icon" className="text-muted-foreground h-9 w-9 relative hover:bg-muted rounded-xl">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <Badge className="absolute top-1 right-1 w-2 h-2 p-0 flex items-center justify-center bg-destructive border-none animate-pulse">
                  </Badge>
                )}
              </Button>
            )}
          />
          <DropdownMenuContent className="w-80 bg-popover border-border text-right p-0 shadow-2xl" align="end">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">اعلان‌های سیستم</h3>
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  className="text-[10px] text-primary h-auto p-0 hover:bg-transparent"
                  onClick={() => {
                    void markAllNotificationsRead().catch((error) => {
                      console.error("Notifications read update failed:", error);
                    });
                  }}
                >
                  حذف همه
                </Button>
              )}
            </div>
            <ScrollArea className="h-[400px]">
              <div className="flex flex-col">
                {notifications.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground text-xs font-medium">اعلانی وجود ندارد.</div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification.id, notification.link)}
                      className={cn(
                        "w-full p-4 border-b border-border/50 hover:bg-muted transition-all text-right flex flex-col gap-1.5",
                        !notification.isRead && "bg-primary/5 border-r-2 border-primary"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <Badge className={cn(
                          "text-[8px] font-black px-1.5 py-0 border-none rounded-full h-4",
                          notification.type === "INFO" && "bg-blue-500 text-white",
                          notification.type === "WARNING" && "bg-amber-500 text-white",
                          notification.type === "SUCCESS" && "bg-emerald-500 text-white",
                          notification.type === "URGENT" && "bg-rose-500 text-white"
                        )}>
                          {notification.type === "INFO" && "اطلاعیه"}
                          {notification.type === "WARNING" && "هشدار"}
                          {notification.type === "SUCCESS" && "تایید"}
                          {notification.type === "URGENT" && "فوری"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono opacity-60">{notificationTime(notification.createdAt)}</span>
                      </div>
                      <p className="text-[11px] font-black text-foreground leading-snug">{notification.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{notification.message}</p>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button 
          variant="ghost" 
          size="icon" 
          className="text-muted-foreground h-9 w-9 hover:bg-muted rounded-xl transition-all duration-300"
          onClick={toggleTheme}
        >
          {currentTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        <div className="h-6 w-[1px] bg-border mx-1 md:mx-2 hidden sm:block" />

        <Link to="/dashboard" className="hidden sm:flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-muted transition-colors">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Ship className="h-4 w-4" />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-[13px] font-black text-foreground">لجستیک پلاس</span>
            <span className="text-[9px] font-bold text-muted-foreground uppercase">Logistic Plus</span>
          </div>
        </Link>
      </div>
    </header>
  );
};
