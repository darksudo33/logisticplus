import { useState } from 'react';
import { useApp } from '../App';
import { Search, Plus, Filter, ArrowLeft, Ship, Truck, Plane, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toPersianDigits, cn } from '../lib/utils';
import { ShipmentMode } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function Shipments() {
  const { shipments } = useApp();
  const [filterMode, setFilterMode] = useState<ShipmentMode | 'همه'>('همه');

  const filteredShipments = shipments.filter(s => 
    filterMode === 'همه' || s.mode === filterMode
  );

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
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight-lux font-serif italic mb-2">
            مدیریت <span className="text-blue-600 dark:text-blue-400 not-italic font-sans text-3xl md:text-4xl ml-2">محموله‌ها</span>
          </h2>
          <p className="text-slate-400 dark:text-slate-500 font-medium max-w-md leading-relaxed text-sm md:text-base">
            نظارت بر زنجیره تامین، وضعیت لحظه‌ای پرونده‌ها و مدیریت اسناد حمل‌ونقل بین‌المللی.
          </p>
        </div>
        <button className="bg-black dark:bg-white text-white dark:text-black px-8 md:px-10 py-4 md:py-5 rounded-[1.5rem] md:rounded-[2rem] font-black text-sm flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-2xl shadow-black/20 active:scale-95">
          <Plus size={20} />
          ایجاد پرونده جدید
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 shadow-lux overflow-hidden transition-colors">
        <div className="p-6 md:p-10 border-b border-slate-50 dark:border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-6 md:gap-8">
          <div className="relative flex-1 w-full lg:max-w-xl">
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={20} />
            <input
              type="text"
              placeholder="جستجوی شماره پرونده، مشتری یا مسیر..."
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-[1.25rem] md:rounded-[1.5rem] py-4 md:py-5 pr-14 pl-8 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/30 transition-all text-sm font-medium dark:text-white"
            />
          </div>
          
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 dark:border-white/10 overflow-x-auto no-scrollbar">
            {(['همه', 'دریایی', 'زمینی', 'هوایی'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  "px-6 md:px-8 py-2.5 md:py-3 rounded-[1.25rem] md:rounded-[1.5rem] text-[10px] md:text-xs font-black transition-all whitespace-nowrap",
                  filterMode === mode 
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xl border border-black/5 dark:border-white/5" 
                    : "text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-right grid-visible">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/5 text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest">
                <th className="px-10 py-6">شماره پرونده</th>
                <th className="px-10 py-6">نوع و روش حمل</th>
                <th className="px-10 py-6">مشتری</th>
                <th className="px-10 py-6">مسیر عملیاتی</th>
                <th className="px-10 py-6">زمان‌بندی</th>
                <th className="px-10 py-6">وضعیت فعلی</th>
                <th className="px-10 py-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
              <AnimatePresence mode="popLayout">
                {filteredShipments.map((shipment) => (
                  <motion.tr 
                    layout
                    variants={item}
                    initial="hidden"
                    animate="show"
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={shipment.id} 
                    className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group"
                  >
                    <td className="px-10 py-8">
                      <span className="font-mono text-sm font-black text-slate-900 dark:text-white tracking-tight">{shipment.jobNo}</span>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-all",
                          shipment.mode === 'دریایی' ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" : 
                          shipment.mode === 'زمینی' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                        )}>
                          {shipment.mode === 'دریایی' ? <Ship size={20} /> : 
                           shipment.mode === 'زمینی' ? <Truck size={20} /> : <Plane size={20} />}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 dark:text-white mb-1">{shipment.type}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest">{shipment.mode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-sm font-bold text-slate-700 dark:text-slate-300">{shipment.customerName}</td>
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-slate-900 dark:text-white">{shipment.origin}</span>
                        <span className="text-slate-200 dark:text-slate-800">→</span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-500">{shipment.destination}</span>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="text-[11px] space-y-1.5 font-medium">
                        <div className="flex items-center gap-3">
                          <span className="text-slate-300 dark:text-slate-700 font-black uppercase tracking-tighter">ETD</span>
                          <span className="text-slate-900 dark:text-white font-bold">{shipment.etd}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-300 dark:text-slate-700 font-black uppercase tracking-tighter">ETA</span>
                          <span className="text-slate-900 dark:text-white font-bold">{shipment.eta}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-sm">
                        {shipment.timeline[shipment.timeline.length - 1]?.type || 'ثبت شده'}
                      </span>
                    </td>
                    <td className="px-10 py-8 text-left">
                      <Link
                        to={`/app/shipments/${shipment.id}`}
                        className="w-12 h-12 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                      >
                        <ArrowLeft size={24} />
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-50 dark:divide-white/5">
          <AnimatePresence mode="popLayout">
            {filteredShipments.map((shipment) => (
              <motion.div
                layout
                variants={item}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, scale: 0.95 }}
                key={shipment.id}
                className="p-6 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                      shipment.mode === 'دریایی' ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" : 
                      shipment.mode === 'زمینی' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                    )}>
                      {shipment.mode === 'دریایی' ? <Ship size={18} /> : 
                       shipment.mode === 'زمینی' ? <Truck size={18} /> : <Plane size={18} />}
                    </div>
                    <div>
                      <p className="font-mono text-sm font-black text-slate-900 dark:text-white tracking-tight">{shipment.jobNo}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest">{shipment.type} • {shipment.mode}</p>
                    </div>
                  </div>
                  <Link
                    to={`/app/shipments/${shipment.id}`}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                  >
                    <ArrowLeft size={20} />
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer</p>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{shipment.customerName}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                      {shipment.timeline[shipment.timeline.length - 1]?.type || 'ثبت شده'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Origin</span>
                      <span className="text-xs font-black text-slate-900 dark:text-white">{shipment.origin}</span>
                    </div>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/10 mx-4" />
                    <div className="flex flex-col text-left">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Destination</span>
                      <span className="text-xs font-black text-slate-900 dark:text-white">{shipment.destination}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 uppercase">ETD:</span>
                      <span className="text-slate-700 dark:text-slate-300">{shipment.etd}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 uppercase">ETA:</span>
                      <span className="text-slate-700 dark:text-slate-300">{shipment.eta}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
