import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, ShipWheel, Settings, LogOut, ShieldCheck, User, Bell, Wallet } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { useApp } from '../App';

const navItems = [
  { name: 'داشبورد مدیریتی', icon: LayoutDashboard, path: '/app' },
  { name: 'مدیریت محموله‌ها', icon: ShipWheel, path: '/app/shipments' },
  { name: 'بانک مشتریان', icon: Users, path: '/app/customers' },
  { name: 'تیم عملیاتی', icon: User, path: '/app/staff' },
  { name: 'حسابداری و مالی', icon: Wallet, path: '/app/accounting' },
  { name: 'هشدارها و اعلانات', icon: Bell, path: '/app/alerts' },
  { name: 'نمای نمونه مشتری', icon: ShieldCheck, path: '/p/token-abc-123' },
];

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { showToast, shipments } = useApp();

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55] transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <aside className={cn(
        "fixed inset-y-0 right-0 w-72 bg-white dark:bg-slate-900 border-l border-black/5 dark:border-white/5 flex flex-col h-full shadow-2xl z-[60] transition-transform duration-500 ease-[0.16, 1, 0.3, 1] md:relative md:translate-x-0 md:shadow-[20px_0_50px_-20px_rgba(0,0,0,0.02)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-black shadow-2xl shadow-black/20">
              <ShipWheel size={22} />
            </div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase font-serif">logistic plus .ir</h1>
          </div>
          <button onClick={onClose} className="md:hidden p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white">
            <LogOut size={20} className="rotate-180" />
          </button>
        </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        <p className="px-4 text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.3em] mb-4">Main Menu</p>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/app'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden',
                isActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xl shadow-slate-200 dark:shadow-none'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
              )
            }
          >
            <item.icon size={20} className="relative z-10" />
            <span className="font-bold text-sm relative z-10">{item.name}</span>
            {item.path === '/app/alerts' && shipments.flatMap(s => s.alerts).length > 0 && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse z-20" />
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-6 space-y-6">
        <div className="p-5 rounded-[1.5rem] bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
              <ShieldCheck size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Enterprise Plan</span>
            </div>
            <p className="text-xs font-bold text-blue-900 dark:text-blue-100 leading-relaxed">دسترسی نامحدود به تمام امکانات سیستم فعال است.</p>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-blue-600/5 rounded-full blur-xl group-hover:scale-150 transition-transform duration-700" />
        </div>

        <div className="space-y-1">
          <button 
            onClick={() => showToast('تنظیمات سیستم در نسخه دمو محدود است')}
            className="w-full flex items-center gap-4 px-5 py-3 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all duration-200 text-sm font-bold"
          >
            <Settings size={18} />
            <span>تنظیمات سیستم</span>
          </button>
          <NavLink to="/" className="w-full flex items-center gap-4 px-5 py-3 rounded-xl text-red-400 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all duration-200 text-sm font-bold">
            <LogOut size={18} />
            <span>خروج از پنل</span>
          </NavLink>
        </div>
      </div>
    </aside>
    </>
  );
}
