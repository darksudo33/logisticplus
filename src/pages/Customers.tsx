import { useApp } from '../App';
import { Search, Plus, MoreVertical, Mail, Phone, User, Filter } from 'lucide-react';
import { toPersianDigits, cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function Customers() {
  const { customers } = useApp();

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
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight-lux font-serif italic">بانک مشتریان</h2>
          <p className="text-slate-400 dark:text-slate-500 mt-2 font-medium text-sm md:text-base">مدیریت اطلاعات تماس و تاریخچه همکاری استراتژیک</p>
        </div>
        <button className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-8 md:px-10 py-4 md:py-5 rounded-[1.5rem] md:rounded-[2rem] font-black text-sm flex items-center justify-center gap-3 hover:scale-105 transition-all shadow-2xl shadow-black/20 active:scale-95">
          <Plus size={20} />
          ثبت مشتری جدید
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 shadow-lux overflow-hidden">
        <div className="p-6 md:p-10 border-b border-slate-50 dark:border-white/5 flex flex-col md:flex-row items-center gap-6 md:gap-8">
          <div className="relative flex-1 w-full">
            <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="جستجوی نام شرکت، رابط یا شماره تماس..."
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-[1.25rem] md:rounded-[1.5rem] py-4 md:py-5 pr-16 pl-8 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/30 transition-all text-sm font-bold dark:text-white"
            />
          </div>
          <button className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 md:py-5 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 rounded-[1.25rem] md:rounded-[1.5rem] border border-slate-100 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-sm font-black">
            <Filter size={18} />
            فیلتر پیشرفته
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/5 text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-10 py-8">نام شرکت و برند</th>
                <th className="px-10 py-8">شخص رابط</th>
                <th className="px-10 py-8">اطلاعات تماس</th>
                <th className="px-10 py-8 text-center">پرونده‌های فعال</th>
                <th className="px-10 py-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
              {customers.map((customer) => (
                <motion.tr 
                  variants={item}
                  key={customer.id} 
                  className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group"
                >
                  <td className="px-10 py-8">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-[1.5rem] flex items-center justify-center text-slate-900 dark:text-white font-black text-2xl shadow-sm group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:scale-110 transition-all border border-black/5 dark:border-white/5">
                        {customer.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-black text-xl text-slate-900 dark:text-white block tracking-tight">{customer.name}</span>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1 block">VIP Client</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shadow-sm">
                        <User size={16} />
                      </div>
                      {customer.contactPerson}
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                        <Mail size={14} className="text-slate-300 dark:text-slate-600" />
                        {customer.email}
                      </div>
                      <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                        <Phone size={14} className="text-slate-300 dark:text-slate-600" />
                        {toPersianDigits(customer.phone)}
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-8 text-center">
                    <span className="inline-flex items-center justify-center px-6 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-black border border-blue-100 dark:border-blue-900/30 shadow-sm">
                      {toPersianDigits(customer.activeShipments)} پرونده
                    </span>
                  </td>
                  <td className="px-10 py-8 text-left">
                    <button className="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 hover:shadow-md transition-all">
                      <MoreVertical size={24} />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
