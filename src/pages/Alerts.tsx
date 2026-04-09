import { useApp } from '../App';
import { Bell, AlertCircle, AlertTriangle, Info, ArrowLeft, Search, Filter, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function Alerts() {
  const { shipments } = useApp();
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [search, setSearch] = useState('');

  // Flatten all alerts from all shipments
  const allAlerts = shipments.flatMap(shipment => 
    shipment.alerts.map(alert => ({
      ...alert,
      shipmentId: shipment.id,
      shipmentJobNo: shipment.jobNo,
      customerName: shipment.customerName
    }))
  );

  const filteredAlerts = allAlerts.filter(alert => {
    const matchesFilter = filter === 'all' || alert.severity === filter;
    const matchesSearch = alert.shipmentJobNo.toLowerCase().includes(search.toLowerCase()) || 
                          alert.message.toLowerCase().includes(search.toLowerCase()) ||
                          alert.customerName.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-12 pb-12"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight-lux font-serif italic">مرکز هشدارها</h2>
          <p className="text-slate-400 dark:text-slate-500 mt-2 font-medium text-sm md:text-base">مدیریت بحران و پایش لحظه‌ای خطاهای عملیاتی</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 shadow-lux overflow-hidden">
        <div className="p-6 md:p-10 border-b border-slate-50 dark:border-white/5 flex flex-col lg:flex-row items-center gap-6 md:gap-8">
          <div className="relative flex-1 w-full">
            <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی شماره پرونده یا متن هشدار..."
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-[1.25rem] md:rounded-[1.5rem] py-4 md:py-5 pr-16 pl-8 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/30 transition-all text-sm font-bold dark:text-white"
            />
          </div>
          
          <div className="flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-white/5 rounded-[1.25rem] md:rounded-[1.5rem] border border-slate-100 dark:border-white/10 w-full lg:w-auto">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="همه" />
            <FilterButton active={filter === 'error'} onClick={() => setFilter('error')} label="خطا" color="red" />
            <FilterButton active={filter === 'warning'} onClick={() => setFilter('warning')} label="هشدار" color="amber" />
            <FilterButton active={filter === 'info'} onClick={() => setFilter('info')} label="اطلاع" color="blue" />
          </div>
        </div>

        <div className="divide-y divide-slate-50 dark:divide-white/5">
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => (
              <motion.div 
                variants={item}
                key={alert.id} 
                className="p-6 md:p-10 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group flex flex-col md:flex-row md:items-center gap-6 md:gap-10"
              >
                <div className={cn(
                  "w-16 h-16 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                  alert.severity === 'error' ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" :
                  alert.severity === 'warning' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" :
                  "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                )}>
                  {alert.severity === 'error' ? <AlertCircle size={32} /> :
                   alert.severity === 'warning' ? <AlertTriangle size={32} /> : <Info size={32} />}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-widest",
                      alert.severity === 'error' ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-900/30" :
                      alert.severity === 'warning' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/30" :
                      "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/30"
                    )}>
                      {alert.severity === 'error' ? 'بحرانی' : alert.severity === 'warning' ? 'هشدار' : 'اطلاعیه'}
                    </span>
                    <span className="text-slate-400 dark:text-slate-600 font-mono text-xs font-bold">{alert.shipmentJobNo}</span>
                  </div>
                  <h4 className="text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-relaxed">
                    {alert.message}
                  </h4>
                  <p className="text-sm text-slate-500 dark:text-slate-500 font-medium">مشتری: {alert.customerName}</p>
                </div>

                <div className="flex items-center gap-3">
                  <Link 
                    to={`/app/shipments/${alert.shipmentId}`}
                    className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-black text-xs hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 transition-all shadow-sm"
                  >
                    مشاهده پرونده
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="p-20 text-center space-y-6">
              <div className="w-24 h-24 bg-slate-50 dark:bg-white/5 rounded-[2.5rem] flex items-center justify-center mx-auto text-slate-200 dark:text-slate-800">
                <Bell size={48} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white font-serif italic">هیچ هشداری یافت نشد</h3>
                <p className="text-slate-400 dark:text-slate-500 mt-2 font-medium">در حال حاضر تمامی فرآیندها در وضعیت سبز قرار دارند.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FilterButton({ active, onClick, label, color = 'slate' }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-6 py-3 rounded-xl text-xs font-black transition-all",
        active 
          ? color === 'red' ? "bg-red-600 text-white shadow-lg shadow-red-500/20" :
            color === 'amber' ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" :
            color === 'blue' ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" :
            "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg"
          : "text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white"
      )}
    >
      {label}
    </button>
  );
}
