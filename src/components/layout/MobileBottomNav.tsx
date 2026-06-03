/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Ship, CheckSquare, MessageSquare, MapPin, ShieldCheck, CreditCard, Archive, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUOTATIONS_UI_ENABLED } from "@/src/config/features";
import { motion } from "motion/react";

const navItems = [
  { icon: LayoutDashboard, label: "داشبورد", path: "/dashboard" },
  { icon: Ship, label: "بارها", path: "/shipments" },
  ...(QUOTATIONS_UI_ENABLED ? [{ icon: Calculator, label: "مدیریت کوتاژ", path: "/quotations" }] : []),
  { icon: CheckSquare, label: "وظایف", path: "/tasks" },
  { icon: CreditCard, label: "چک‌ها", path: "/cheques" },
  { icon: Archive, label: "آرشیو", path: "/archive" },
];

export const MobileBottomNav = () => {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/90 backdrop-blur-xl border-t border-border/70 flex items-center justify-around px-2 pb-safe z-40 font-sans shadow-[0_-8px_30px_rgba(0,0,0,0.18)]">
      {navItems.map((item) => {
        const isActive = location.pathname.startsWith(item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 min-w-0 flex-1 h-full transition-all group",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isActive && (
              <motion.div 
                layoutId="activeTab"
                className="absolute inset-0 bg-primary/5 rounded-t-2xl"
                initial={false}
              />
            )}
            <div className={cn(
              "transition-transform duration-300",
              isActive ? "scale-110" : "scale-100 group-active:scale-90"
            )}>
              <item.icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_8px_rgba(37,99,235,0.25)]")} />
            </div>
            <span className={cn(
              "text-[9px] font-black transition-all",
              isActive ? "opacity-100" : "opacity-60"
            )}>
              {item.label}
            </span>
            {isActive && (
              <motion.div 
                layoutId="indicator"
                className="absolute top-0 w-8 h-[2px] bg-primary rounded-full"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
};
