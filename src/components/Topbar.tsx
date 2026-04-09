import { Bell, Search, RefreshCcw, User, Globe, Moon, Sun, Menu } from 'lucide-react';
import { resetStoredData } from '../lib/mockData';
import { motion } from 'motion/react';
import { useApp } from '../App';

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { darkMode, toggleDarkMode, showToast } = useApp();

  return (
    <header className="h-20 md:h-24 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 flex items-center justify-between px-4 md:px-10 sticky top-0 z-40 transition-colors">
      <div className="flex items-center gap-4 md:gap-6 flex-1 max-w-2xl">
        <button 
          onClick={onMenuClick}
          className="p-2.5 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 rounded-xl md:hidden hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
        >
          <Menu size={20} />
        </button>

        <div className="relative w-full group hidden sm:block">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 group-focus-within:text-slate-900 dark:group-focus-within:text-white transition-colors" size={18} />
          <input
            type="text"
            placeholder="جستجو..."
            onKeyDown={(e) => e.key === 'Enter' && showToast(`جستجو برای: ${e.currentTarget.value}`)}
            className="w-full bg-slate-50/50 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl py-2.5 pr-10 pl-4 focus:outline-none focus:ring-4 focus:ring-slate-900/5 dark:focus:ring-white/5 focus:border-slate-900/10 dark:focus:border-white/10 focus:bg-white dark:focus:bg-slate-800 transition-all font-medium text-sm dark:text-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6">
        <div className="hidden xl:flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-full border border-black/5 dark:border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <Globe size={14} className="text-blue-600" />
          <span>Tehran</span>
          <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
          <span>{new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        <button 
          onClick={toggleDarkMode}
          className="p-2.5 text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white rounded-xl transition-all"
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-full border border-amber-100 dark:border-amber-900/30 text-[9px] font-black uppercase tracking-widest">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
          Demo
        </div>

        <button
          onClick={() => {
            resetStoredData();
            window.location.reload();
          }}
          className="p-2.5 text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
          title="بازنشانی داده‌های دمو"
        >
          <RefreshCcw size={18} />
          <span className="hidden 2xl:inline">Reset Demo</span>
        </button>

        <button 
          onClick={() => showToast('شما ۳ اعلان جدید دارید')}
          className="p-2.5 text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white rounded-xl transition-all relative"
        >
          <Bell size={20} />
          <span className="absolute top-2.5 left-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900" />
        </button>

        <div className="h-8 w-px bg-slate-100 dark:bg-white/5 mx-1 hidden sm:block" />

        <div 
          onClick={() => showToast('پروفایل کاربری در نسخه دمو غیرفعال است')}
          className="flex items-center gap-3 group cursor-pointer"
        >
          <div className="text-left hidden lg:block">
            <p className="text-xs font-black text-slate-900 dark:text-white leading-none mb-1">امیرحسین محمدی</p>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Operator</p>
          </div>
          <div className="w-10 h-10 bg-slate-100 dark:bg-white/5 rounded-xl flex items-center justify-center text-slate-600 border border-black/5 dark:border-white/5 group-hover:border-black/10 dark:group-hover:border-white/10 transition-all shadow-sm overflow-hidden">
            <img 
              src="https://picsum.photos/seed/user/100/100" 
              alt="User" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
