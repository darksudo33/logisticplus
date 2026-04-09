import { motion } from 'motion/react';
import { useApp } from '../App';
import { User, Mail, Shield, Briefcase } from 'lucide-react';

export default function Staff() {
  const { employees } = useApp();

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
      className="max-w-6xl mx-auto space-y-12 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight-lux font-serif italic">مدیریت تیم عملیاتی</h2>
          <p className="text-slate-400 dark:text-slate-500 mt-2 font-medium text-sm md:text-base">لیست کارشناسان و سطوح دسترسی سیستم هوشمند</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
        {employees.map((emp) => (
          <motion.div
            key={emp.id}
            variants={item}
            className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 p-8 md:p-10 shadow-lux group hover:border-blue-200 dark:hover:border-blue-800 transition-all relative overflow-hidden"
          >
            <div className="flex flex-col items-center text-center relative z-10">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-[2rem] md:rounded-[2.5rem] bg-slate-100 dark:bg-white/5 border-4 border-white dark:border-slate-800 shadow-2xl overflow-hidden mb-6 md:mb-8 group-hover:scale-110 transition-transform duration-700">
                <img 
                  src={emp.avatar} 
                  alt={emp.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">{emp.name}</h3>
              <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] mb-6 md:mb-8">{emp.role}</p>
              
              <div className="w-full space-y-4 pt-6 md:pt-8 border-t border-black/5 dark:border-white/5">
                <div className="flex items-center gap-4 text-slate-400 dark:text-slate-500">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center">
                    <Briefcase size={14} />
                  </div>
                  <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest">Operations</span>
                </div>
                <div className="flex items-center gap-4 text-slate-400 dark:text-slate-500">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center">
                    <Shield size={14} />
                  </div>
                  <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest">Expert Access</span>
                </div>
              </div>
            </div>
            
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
