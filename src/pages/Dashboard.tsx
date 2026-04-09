import { useApp } from '../App';
import { ShipWheel, Users, AlertTriangle, Clock, ArrowLeft, TrendingUp, Zap, CheckCircle2, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toPersianDigits, cn } from '../lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import { motion } from 'motion/react';

export default function Dashboard() {
  const { shipments, customers, accounting } = useApp();

  const activeShipments = shipments.length;
  const totalCustomers = customers.length;
  const totalAlerts = shipments.reduce((acc, s) => acc + s.alerts.length, 0);

  const totalIncome = accounting
    .filter(a => a.type === 'درآمد')
    .reduce((acc, curr) => acc + curr.amount, 0);
  
  const totalExpenses = accounting
    .filter(a => a.type === 'هزینه')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const nearingExpiry = shipments.filter(s => {
    if (!s.ata || s.freeDaysPort === 0) return false;
    const arrivalDate = parseISO(s.ata);
    const expiryDate = new Date(arrivalDate.getTime() + s.freeDaysPort * 24 * 60 * 60 * 1000);
    const daysLeft = differenceInDays(expiryDate, new Date());
    return daysLeft >= 0 && daysLeft <= 3;
  });

  const myTasks = shipments.flatMap(s => 
    s.tasks.filter(t => t.assignedTo === 'e1' && t.status !== 'انجام شد')
      .map(t => ({ ...t, jobNo: s.jobNo, shipmentId: s.id }))
  ).slice(0, 4);

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
      className="space-y-12 pb-12"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight-lux font-serif italic mb-2">
            خلاصه وضعیت <span className="text-blue-600 dark:text-blue-400 not-italic font-sans text-3xl md:text-4xl ml-2">عملیات</span>
          </h2>
          <p className="text-slate-400 dark:text-slate-500 font-medium max-w-md leading-relaxed text-sm md:text-base">
            گزارش لحظه‌ای از جابجایی کالا، هشدارهای فریتایم و وظایف تخصیص یافته به تیم عملیاتی.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-start md:items-end">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Date</span>
            <div className="flex items-center gap-3 glass px-5 py-2.5 rounded-2xl border border-black/5 dark:border-white/5 bg-white/50 dark:bg-slate-800/50 shadow-sm">
              <Calendar size={16} className="text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-bold text-slate-900 dark:text-white">۱۴۰۵/۰۱/۲۰</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Overview */}
      <motion.div 
        variants={item}
        className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 p-6 md:p-8 shadow-lux overflow-hidden relative group"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 md:mb-10 gap-4">
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white mb-1">روند جابجایی محموله‌ها</h3>
            <p className="text-xs text-slate-400 font-medium">مقایسه حجم عملیات در ۷ روز گذشته</p>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span className="text-[10px] md:text-xs font-bold text-slate-600 dark:text-slate-400">دریایی</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700" />
              <span className="text-[10px] md:text-xs font-bold text-slate-600 dark:text-slate-400">هوایی</span>
            </div>
          </div>
        </div>
        
        <div className="h-40 md:h-48 flex items-end gap-1.5 md:gap-4 px-1 md:px-2">
          {[45, 60, 40, 85, 55, 70, 95].map((val, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2 md:gap-3 group/bar">
              <div className="w-full relative flex flex-col justify-end h-full">
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: `${val}%` }}
                  transition={{ duration: 1, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full bg-blue-600/10 dark:bg-blue-400/5 rounded-t-xl md:rounded-t-2xl group-hover/bar:bg-blue-600/20 transition-colors relative"
                >
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: '30%' }}
                    className="absolute bottom-0 left-0 right-0 bg-blue-600 rounded-t-xl md:rounded-t-2xl shadow-[0_-10px_20px_rgba(37,99,235,0.2)]"
                  />
                </motion.div>
              </div>
              <span className="text-[8px] md:text-[10px] font-bold text-slate-400">{toPersianDigits(i + 10)} فروردین</span>
            </div>
          ))}
        </div>
        
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none" />
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          variants={item}
          title="پرونده‌های فعال"
          value={toPersianDigits(activeShipments)}
          icon={ShipWheel}
          color="black"
          trend="+۲ مورد جدید"
        />
        <StatCard
          variants={item}
          title="مشتریان ویژه"
          value={toPersianDigits(totalCustomers)}
          icon={Users}
          color="blue"
          trend="۱۰۰٪ رضایت"
        />
        <StatCard
          variants={item}
          title="هشدارهای باز"
          value={toPersianDigits(totalAlerts)}
          icon={AlertTriangle}
          color="red"
          trend="۳ مورد بحرانی"
        />
        <StatCard
          variants={item}
          title="فریتایم نزدیک"
          value={toPersianDigits(nearingExpiry.length)}
          icon={Clock}
          color="amber"
          trend="نیاز به اقدام"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div 
          variants={item}
          className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5 shadow-lux flex items-center justify-between group overflow-hidden relative"
        >
          <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">تراز مالی کل</p>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white font-serif italic tracking-tighter">
              {toPersianDigits((totalIncome - totalExpenses).toLocaleString())} <span className="text-xs not-italic font-sans text-slate-400 ml-1">ریال</span>
            </h3>
            <Link to="/app/accounting" className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-bold mt-4 hover:gap-3 transition-all">
              مشاهده جزئیات حسابداری
              <ArrowLeft size={14} />
            </Link>
          </div>
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
            <Wallet size={32} />
          </div>
          <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-blue-600/5 rounded-full blur-3xl" />
        </motion.div>

        <motion.div 
          variants={item}
          className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5 shadow-lux flex items-center justify-between group overflow-hidden relative"
        >
          <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">چک‌های در جریان</p>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white font-serif italic tracking-tighter">
              {toPersianDigits(accounting.filter(a => a.type === 'چک' && a.status === 'در جریان').length)} <span className="text-xs not-italic font-sans text-slate-400 ml-1">فقره</span>
            </h3>
            <p className="text-[10px] text-amber-600 font-bold mt-4">نیاز به پیگیری سررسید</p>
          </div>
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
            <FileText size={32} />
          </div>
          <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-amber-600/5 rounded-full blur-3xl" />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content: Recent Shipments */}
        <motion.div 
          variants={item}
          className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-black/5 dark:border-white/5 overflow-hidden shadow-lux transition-colors"
        >
          <div className="p-6 md:p-8 border-b border-slate-50 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-600">
                <Zap size={20} />
              </div>
              <h3 className="font-black text-lg md:text-xl text-slate-900 dark:text-white">آخرین محموله‌ها</h3>
            </div>
            <Link to="/app/shipments" className="text-xs md:text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors flex items-center gap-1">
              مشاهده همه
              <ArrowLeft size={16} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[600px]">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-white/5 text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                  <th className="px-8 py-5">شماره پرونده</th>
                  <th className="px-8 py-5">مشتری</th>
                  <th className="px-8 py-5">مسیر حمل</th>
                  <th className="px-8 py-5">وضعیت</th>
                  <th className="px-8 py-5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {shipments.slice(0, 5).map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                    <td className="px-8 py-5">
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{shipment.jobNo}</span>
                    </td>
                    <td className="px-8 py-5 text-sm font-medium text-slate-600 dark:text-slate-400">{shipment.customerName}</td>
                    <td className="px-8 py-5 text-sm text-slate-500 dark:text-slate-500">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{shipment.origin}</span>
                      <span className="mx-2 opacity-30">→</span>
                      <span>{shipment.destination}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                        {shipment.timeline[shipment.timeline.length - 1]?.type || 'ثبت شده'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-left">
                      <Link
                        to={`/app/shipments/${shipment.id}`}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                      >
                        <ArrowLeft size={20} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Sidebar: Alerts & Expiry */}
        <div className="lg:col-span-4 space-y-8">
          <motion.div 
            variants={item}
            className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-black/5 dark:border-white/5 p-8 shadow-lux transition-colors"
          >
            <h3 className="font-black text-lg text-slate-900 dark:text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg flex items-center justify-center">
                <Clock size={18} />
              </div>
              مهلت فریتایم
            </h3>
            <div className="space-y-4">
              {nearingExpiry.length > 0 ? (
                nearingExpiry.map(s => {
                  const arrivalDate = parseISO(s.ata!);
                  const expiryDate = new Date(arrivalDate.getTime() + s.freeDaysPort * 24 * 60 * 60 * 1000);
                  const daysLeft = differenceInDays(expiryDate, new Date());
                  return (
                    <div key={s.id} className="p-5 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 hover:border-amber-200 dark:hover:border-amber-800 transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white">{s.jobNo}</span>
                        <span className="text-[10px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">{toPersianDigits(daysLeft)} روز</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500 font-medium">{s.customerName}</p>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-300 dark:text-slate-700 font-medium italic">موردی برای پیگیری نیست</p>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div 
            variants={item}
            className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-black/5 dark:border-white/5 p-8 shadow-lux transition-colors"
          >
            <h3 className="font-black text-lg text-slate-900 dark:text-white mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center">
                <CheckCircle2 size={18} />
              </div>
              وظایف من
            </h3>
            <div className="space-y-4">
              {myTasks.length > 0 ? (
                myTasks.map(task => (
                  <Link 
                    key={task.id} 
                    to={`/app/shipments/${task.shipmentId}`}
                    className="block p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 hover:border-blue-200 dark:hover:border-blue-800 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">{task.jobNo}</span>
                      <span className={cn(
                        "text-[9px] font-black px-2 py-0.5 rounded-full",
                        task.status === 'در حال انجام' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                      )}>
                        {task.status}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{task.title}</p>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-300 dark:text-slate-700 font-medium italic">وظیفه بازی وجود ندارد</p>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div 
            variants={item}
            className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl text-white relative overflow-hidden"
          >
            <div className="relative z-10">
              <h3 className="font-black text-lg mb-6 flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 text-white rounded-lg flex items-center justify-center">
                  <AlertTriangle size={18} />
                </div>
                هشدارهای سیستمی
              </h3>
              <div className="space-y-4">
                {shipments.flatMap(s => s.alerts.map(a => ({ ...a, jobNo: s.jobNo }))).slice(0, 3).map(alert => (
                  <div key={alert.id} className="flex gap-4 items-start p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${alert.severity === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <div>
                      <p className="text-xs font-black text-white/90 mb-1">{alert.jobNo}</p>
                      <p className="text-[11px] text-white/60 leading-relaxed font-medium">{alert.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-blue-500/20 rounded-full blur-3xl" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend, variants }: any) {
  const colors: any = {
    black: 'bg-black dark:bg-white text-white dark:text-black',
    blue: 'bg-blue-600 text-white',
    red: 'bg-red-500 text-white',
    amber: 'bg-amber-500 text-white',
  };

  return (
    <motion.div 
      variants={variants}
      className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5 shadow-lux shadow-lux-hover transition-colors"
    >
      <div className="flex items-center justify-between mb-6">
        <div className={`p-3 rounded-2xl ${colors[color]} shadow-xl`}>
          <Icon size={24} />
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-black text-xs">
            <TrendingUp size={14} />
            {trend}
          </div>
        )}
      </div>
      <h4 className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest">{title}</h4>
      <p className="text-4xl font-black text-slate-900 dark:text-white mt-2 font-serif italic">{value}</p>
    </motion.div>
  );
}

function Calendar({ size, className }: any) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  );
}

function FileText({ size, className }: any) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <line x1="10" y1="9" x2="8" y2="9"></line>
    </svg>
  );
}
