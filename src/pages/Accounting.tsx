import { useState } from 'react';
import { useApp } from '../App';
import { 
  Wallet, TrendingUp, TrendingDown, Plus, 
  Search, Filter, Calendar, FileText, 
  CheckCircle2, Clock, AlertCircle, ArrowLeft
} from 'lucide-react';
import { toPersianDigits, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { AccountingType, AccountingEntry } from '../types';

export default function Accounting() {
  const { accounting, addAccountingEntry, showToast } = useApp();
  const [filter, setFilter] = useState<AccountingType | 'همه'>('همه');
  const [search, setSearch] = useState('');

  const totalIncome = accounting
    .filter(a => a.type === 'درآمد')
    .reduce((acc, curr) => acc + curr.amount, 0);
  
  const totalExpenses = accounting
    .filter(a => a.type === 'هزینه')
    .reduce((acc, curr) => acc + curr.amount, 0);
  
  const balance = totalIncome - totalExpenses;

  const filteredEntries = accounting.filter(a => {
    const matchesFilter = filter === 'همه' || a.type === filter;
    const matchesSearch = a.description.toLowerCase().includes(search.toLowerCase()) || 
                         (a.referenceId?.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-12 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight-lux font-serif italic mb-2">
            مدیریت <span className="text-blue-600 dark:text-blue-400 not-italic font-sans text-3xl md:text-4xl ml-2">مالی و حسابداری</span>
          </h2>
          <p className="text-slate-400 dark:text-slate-500 font-medium max-w-md leading-relaxed text-sm md:text-base">
            رهگیری درآمدها، هزینه‌های عملیاتی و مدیریت چک‌های دریافتی و پرداختی در یک نمای واحد.
          </p>
        </div>
        <button 
          onClick={() => showToast('ثبت سند جدید در نسخه دمو محدود است')}
          className="bg-black dark:bg-white text-white dark:text-black px-8 md:px-10 py-4 md:py-5 rounded-[1.5rem] md:rounded-[2rem] font-black text-sm flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-2xl shadow-black/20 active:scale-95"
        >
          <Plus size={20} />
          ثبت سند مالی جدید
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
        <SummaryCard
          variants={item}
          title="کل درآمدها"
          value={toPersianDigits(totalIncome.toLocaleString())}
          icon={TrendingUp}
          color="green"
          unit="ریال"
        />
        <SummaryCard
          variants={item}
          title="کل هزینه‌ها"
          value={toPersianDigits(totalExpenses.toLocaleString())}
          icon={TrendingDown}
          color="red"
          unit="ریال"
        />
        <SummaryCard
          variants={item}
          title="تراز مالی"
          value={toPersianDigits(balance.toLocaleString())}
          icon={Wallet}
          color="blue"
          unit="ریال"
        />
      </div>

      {/* Main Content */}
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 shadow-lux overflow-hidden">
        <div className="p-6 md:p-10 border-b border-slate-50 dark:border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-6 md:gap-8">
          <div className="relative flex-1 w-full lg:max-w-xl">
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={20} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی شرح سند، شماره پرونده یا مشتری..."
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-[1.25rem] md:rounded-[1.5rem] py-4 md:py-5 pr-14 pl-8 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/30 transition-all text-sm font-medium dark:text-white"
            />
          </div>
          
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 dark:border-white/10 overflow-x-auto no-scrollbar">
            {(['همه', 'چک', 'هزینه', 'درآمد'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={cn(
                  "px-6 md:px-8 py-2.5 md:py-3 rounded-[1.25rem] md:rounded-[1.5rem] text-[10px] md:text-xs font-black transition-all whitespace-nowrap",
                  filter === t 
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xl border border-black/5 dark:border-white/5" 
                    : "text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/5 text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <th className="px-10 py-6">تاریخ</th>
                <th className="px-10 py-6">شرح سند</th>
                <th className="px-10 py-6">نوع</th>
                <th className="px-10 py-6">مبلغ (ریال)</th>
                <th className="px-10 py-6">وضعیت</th>
                <th className="px-10 py-6">مرجع</th>
                <th className="px-10 py-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
              <AnimatePresence mode="popLayout">
                {filteredEntries.map((entry) => (
                  <motion.tr 
                    layout
                    variants={item}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={entry.id} 
                    className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group"
                  >
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-3">
                        <Calendar size={14} className="text-slate-300" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{entry.date}</span>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="max-w-xs">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{entry.description}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{entry.category}</p>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black",
                        entry.type === 'درآمد' ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" :
                        entry.type === 'هزینه' ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400" :
                        "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                      )}>
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-10 py-8">
                      <span className={cn(
                        "text-sm font-black font-mono tracking-tight",
                        entry.type === 'درآمد' ? "text-green-600" : entry.type === 'هزینه' ? "text-red-600" : "text-slate-900 dark:text-white"
                      )}>
                        {toPersianDigits(entry.amount.toLocaleString())}
                      </span>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={entry.status} />
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{entry.status}</span>
                      </div>
                      {entry.dueDate && (
                        <p className="text-[9px] text-amber-600 font-black mt-1">سررسید: {entry.dueDate}</p>
                      )}
                    </td>
                    <td className="px-10 py-8">
                      {entry.referenceId ? (
                        <span className="font-mono text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg">
                          {entry.referenceId}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-10 py-8 text-left">
                      <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all">
                        <FileText size={18} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          
          {filteredEntries.length === 0 && (
            <div className="py-32 text-center">
              <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200 dark:text-slate-800">
                <Search size={40} />
              </div>
              <p className="text-slate-400 dark:text-slate-600 font-bold italic">سندی با این مشخصات یافت نشد</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SummaryCard({ title, value, icon: Icon, color, unit, variants }: any) {
  const colors: any = {
    green: 'bg-green-500 text-white shadow-green-200 dark:shadow-none',
    red: 'bg-red-500 text-white shadow-red-200 dark:shadow-none',
    blue: 'bg-blue-600 text-white shadow-blue-200 dark:shadow-none',
  };

  return (
    <motion.div 
      variants={variants}
      className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 shadow-lux group hover:shadow-2xl transition-all duration-500"
    >
      <div className="flex items-center justify-between mb-8">
        <div className={cn("p-4 rounded-2xl shadow-xl group-hover:scale-110 transition-transform duration-500", colors[color])}>
          <Icon size={28} />
        </div>
        <div className="text-right">
          <p className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white font-serif italic tracking-tighter">{value}</span>
            <span className="text-[10px] font-black text-slate-400 uppercase">{unit}</span>
          </div>
        </div>
      </div>
      <div className="w-full h-1 bg-slate-50 dark:bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: '70%' }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className={cn("h-full", color === 'green' ? 'bg-green-500' : color === 'red' ? 'bg-red-500' : 'bg-blue-600')}
        />
      </div>
    </motion.div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'پاس شده':
    case 'پرداخت شده':
    case 'دریافت شده':
      return <CheckCircle2 size={14} className="text-green-500" />;
    case 'در جریان':
      return <Clock size={14} className="text-amber-500" />;
    case 'برگشتی':
      return <AlertCircle size={14} className="text-red-500" />;
    default:
      return null;
  }
}
