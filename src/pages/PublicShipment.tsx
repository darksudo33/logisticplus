import { useParams } from 'react-router-dom';
import { useApp } from '../App';
import { 
  ShipWheel, MapPin, Calendar, Clock, 
  CheckCircle2, AlertCircle, Ship, Truck, Plane, 
  Download, Share2, MessageSquare, ShieldCheck
} from 'lucide-react';
import { toPersianDigits, cn } from '../lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import { motion } from 'motion/react';

export default function PublicShipment() {
  const { token } = useParams();
  const { shipments } = useApp();
  const shipment = shipments.find(s => s.token === token);

  if (!shipment) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center max-w-md w-full border border-black/5">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-red-100">
            <AlertCircle size={40} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight-lux">پرونده یافت نشد</h1>
          <p className="text-slate-500 mb-10 leading-relaxed">لینک وارد شده معتبر نیست یا دسترسی به آن محدود شده است.</p>
          <button className="w-full bg-black text-white py-4 rounded-2xl font-bold shadow-2xl shadow-black/20">تماس با پشتیبانی</button>
        </div>
      </div>
    );
  }

  // Countdown Math
  let daysLeft = null;
  let countdownColor = 'slate';
  if (shipment.ata && shipment.freeDaysPort > 0) {
    const arrivalDate = parseISO(shipment.ata);
    const expiryDate = new Date(arrivalDate.getTime() + shipment.freeDaysPort * 24 * 60 * 60 * 1000);
    daysLeft = differenceInDays(expiryDate, new Date());
    
    if (daysLeft < 0) countdownColor = 'red';
    else if (daysLeft <= 3) countdownColor = 'amber';
    else countdownColor = 'green';
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] dark:bg-slate-950 font-sans pb-32 selection:bg-blue-100 selection:text-blue-900 transition-colors duration-500">
      {/* Luxury Header */}
      <header className="glass fixed top-0 left-0 w-full z-50 border-b border-black/5 dark:border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-slate-900 shadow-2xl">
              <ShipWheel size={22} />
            </div>
            <span className="text-xl font-black tracking-tight uppercase font-serif dark:text-white">logistic plus .ir</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full border border-green-100 dark:border-green-900/30 text-[10px] font-black uppercase tracking-widest">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live Tracking
            </div>
            <button className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
              <Share2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-24 md:pt-32 space-y-8 md:space-y-12">
        {/* Hero Banner */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="bg-slate-900 dark:bg-slate-900 rounded-[2.5rem] md:rounded-[4rem] p-8 md:p-12 text-white relative overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] border border-white/5"
        >
          <div className="relative z-10">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 md:gap-10">
              <div className="space-y-6 md:space-y-8">
                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                  <span className="px-3 md:px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] border border-white/20">
                    {shipment.type}
                  </span>
                  <div className="hidden sm:block h-px w-8 bg-white/20" />
                  <span className="text-white/40 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em]">Job Ref:</span>
                  <span className="font-mono font-bold text-blue-400 text-base md:text-lg">{shipment.jobNo}</span>
                </div>
                <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tight-lux leading-none font-serif italic">
                  رهگیری <span className="text-blue-400 not-italic">محموله</span>
                </h1>
                <p className="text-white/60 text-lg md:text-2xl font-medium">مشتری گرامی: <span className="text-white font-black">{shipment.customerName}</span></p>
              </div>
              
              <div className="flex items-center gap-6 md:gap-8 glass-dark p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/10 shadow-2xl">
                <div className="text-right">
                  <p className="text-white/40 text-[8px] md:text-[10px] font-black uppercase tracking-widest mb-2 md:mb-3">Current Status</p>
                  <p className="text-2xl md:text-4xl font-black text-blue-400 font-serif italic tracking-tight">
                    {shipment.timeline[shipment.timeline.length - 1]?.type || 'در حال پردازش'}
                  </p>
                </div>
                <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-500/20 text-blue-400 rounded-2xl md:rounded-[2rem] flex items-center justify-center border border-blue-500/30 shadow-2xl group hover:scale-110 transition-transform duration-500">
                  {shipment.mode === 'دریایی' ? <Ship size={32} className="md:size-40" /> : 
                   shipment.mode === 'زمینی' ? <Truck size={32} className="md:size-40" /> : <Plane size={32} className="md:size-40" />}
                </div>
              </div>
            </div>
          </div>
          
          {/* Decorative gradients */}
          <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[120%] bg-blue-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[80%] bg-indigo-600/20 rounded-full blur-[100px]" />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-8 md:space-y-12">
            {/* Route Visualization */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 p-8 md:p-12 shadow-lux relative overflow-hidden"
            >
              <h3 className="text-[10px] md:text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-12 md:mb-16 flex items-center gap-3">
                <MapPin size={16} className="text-blue-600" />
                Logistics Route
              </h3>
              
              <div className="flex items-center justify-between relative mb-16 md:mb-20 px-4 md:px-10">
                <div className="text-center relative z-10">
                  <div className="w-16 h-16 md:w-24 md:h-24 bg-slate-50 dark:bg-white/5 rounded-2xl md:rounded-[2.5rem] flex items-center justify-center text-slate-800 dark:text-white border border-slate-100 dark:border-white/10 mb-4 md:mb-6 mx-auto shadow-sm group hover:scale-110 transition-transform">
                    <MapPin size={24} className="md:size-40" />
                  </div>
                  <p className="text-[8px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1 md:mb-2">Origin</p>
                  <p className="text-lg md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">{shipment.origin}</p>
                </div>

                <div className="flex-1 h-px bg-slate-100 dark:bg-white/10 mx-4 md:mx-10 relative">
                  <motion.div 
                    animate={{ left: ['0%', '100%'] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/2 -translate-y-1/2 w-10 h-10 md:w-14 md:h-14 bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/10 rounded-full flex items-center justify-center text-blue-600 shadow-2xl z-20"
                  >
                    {shipment.mode === 'دریایی' ? <Ship size={20} className="md:size-28" /> : 
                     shipment.mode === 'زمینی' ? <Truck size={20} className="md:size-28" /> : <Plane size={20} className="md:size-28" />}
                  </motion.div>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-50 dark:via-blue-900/10 to-transparent opacity-50" />
                </div>

                <div className="text-center relative z-10">
                  <div className="w-16 h-16 md:w-24 md:h-24 bg-slate-900 dark:bg-white rounded-2xl md:rounded-[2.5rem] flex items-center justify-center text-white dark:text-slate-900 shadow-2xl mb-4 md:mb-6 mx-auto group hover:scale-110 transition-transform">
                    <MapPin size={24} className="md:size-40" />
                  </div>
                  <p className="text-[8px] md:text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1 md:mb-2">Destination</p>
                  <p className="text-lg md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">{shipment.destination}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-12 pt-8 md:pt-12 border-t border-slate-50 dark:border-white/5">
                <SummaryItem icon={ShieldCheck} label="Incoterm" value={shipment.incoterm} />
                <SummaryItem icon={Calendar} label="Estimated ETD" value={shipment.etd} />
                <SummaryItem icon={Calendar} label="Estimated ETA" value={shipment.eta} />
              </div>
              
              <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-[100px] -mr-32 -mb-32 pointer-events-none" />
            </motion.div>

            {/* Timeline */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 p-8 md:p-12 shadow-lux"
            >
              <h3 className="text-[10px] md:text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-12 md:mb-16 flex items-center gap-3">
                <Clock size={16} className="text-blue-600" />
                Shipment Timeline
              </h3>
              
              <div className="relative space-y-12 md:space-y-16 before:absolute before:right-[23px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-white/5">
                {shipment.timeline.slice().reverse().map((update, idx) => (
                  <div key={update.id} className="relative pr-16 md:pr-20">
                    <div className={cn(
                      "absolute right-0 top-1 w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-[1.25rem] border-4 border-white dark:border-slate-900 shadow-2xl z-10 flex items-center justify-center transition-all shrink-0",
                      idx === 0 ? "bg-blue-600 scale-125 rotate-12" : "bg-slate-100 dark:bg-slate-800"
                    )}>
                      {idx === 0 ? <CheckCircle2 size={18} className="text-white" /> : <div className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full" />}
                    </div>
                    <div>
                      <p className={cn(
                        "text-xl md:text-2xl font-black mb-1 md:mb-2 tracking-tight",
                        idx === 0 ? "text-blue-600" : "text-slate-700 dark:text-slate-300"
                      )}>
                        {update.type}
                      </p>
                      <p className="text-[9px] md:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{update.jalaliDate}</p>
                      {update.note && !update.isInternal && (
                        <div className="mt-4 md:mt-6 p-4 md:p-6 rounded-2xl md:rounded-[2rem] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-slate-500 dark:text-slate-400 text-xs md:text-sm leading-relaxed italic font-medium">
                          {update.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-8 md:space-y-12">
            {/* Countdown */}
            {daysLeft !== null && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className={cn(
                  "rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-12 border shadow-2xl transition-all relative overflow-hidden",
                  countdownColor === 'green' ? "bg-green-600 text-white border-green-500" :
                  countdownColor === 'amber' ? "bg-amber-500 text-white border-amber-400" :
                  "bg-red-600 text-white border-red-500"
                )}
              >
                <div className="relative z-10">
                  <h3 className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] mb-8 md:mb-10 opacity-70">Free Time Expiry</h3>
                  <div className="text-center">
                    <div className="text-7xl md:text-9xl font-black mb-2 md:mb-4 font-serif italic tracking-tighter">
                      {toPersianDigits(Math.abs(daysLeft))}
                    </div>
                    <div className="text-lg md:text-xl font-bold opacity-80 mb-8 md:mb-12">
                      {daysLeft < 0 ? 'روز از مهلت گذشته' : 'روز باقی‌مانده'}
                    </div>
                    
                    <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden mb-6">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, Math.min(100, (daysLeft / shipment.freeDaysPort) * 100))}%` }}
                        transition={{ duration: 2, ease: "easeOut" }}
                        className="bg-white h-full" 
                      />
                    </div>
                    <p className="text-[8px] md:text-[9px] font-black opacity-40 uppercase tracking-[0.3em]">Container Release Deadline</p>
                  </div>
                </div>
                <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-white/10 rounded-full blur-3xl" />
              </motion.div>
            )}

            {/* Documents */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 p-8 md:p-10 shadow-lux"
            >
              <h3 className="text-[10px] md:text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-8 md:mb-10">Documents</h3>
              <div className="space-y-4 md:space-y-5">
                <DocumentItem title="بارنامه (B/L)" type="PDF • ۲.۴ مگابایت" active />
                <DocumentItem title="فاکتور تجاری" type="در حال بررسی..." />
                <DocumentItem title="لیست عدل‌بندی" type="در حال بررسی..." />
              </div>
            </motion.div>

            {/* Support */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="bg-slate-900 dark:bg-white rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-12 text-white dark:text-slate-900 shadow-2xl relative overflow-hidden group border border-white/5"
            >
              <div className="relative z-10">
                <h3 className="text-2xl md:text-3xl font-black mb-4 md:mb-6 font-serif italic">پشتیبانی اختصاصی</h3>
                <p className="text-white/60 dark:text-slate-500 text-xs md:text-sm leading-relaxed mb-8 md:mb-10 font-medium">
                  سوالی در مورد این محموله دارید؟ کارشناسان ما آماده پاسخگویی هستند.
                </p>
                <button className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-4 md:py-5 rounded-[1.25rem] md:rounded-[1.5rem] font-black text-sm hover:scale-105 transition-all flex items-center justify-center gap-4 shadow-xl">
                  <MessageSquare size={20} />
                  گفتگو با اپراتور
                </button>
              </div>
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
            </motion.div>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 mt-32 text-center">
        <div className="h-px bg-slate-100 dark:bg-white/5 w-full mb-12" />
        <p className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.4em] mb-6">Official Shipment Tracking Portal</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">© ۱۴۰۵ تمامی حقوق برای شرکت حمل‌ونقل پارس محفوظ است.</p>
      </footer>
    </div>
  );
}

function SummaryItem({ icon: Icon, label, value }: any) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={14} />
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-lg font-black text-slate-900 tracking-tight">{value}</p>
    </div>
  );
}

function DocumentItem({ title, type, active = false }: any) {
  return (
    <div className={cn(
      "p-5 rounded-[2rem] flex items-center justify-between group cursor-pointer transition-all border",
      active ? "bg-slate-50 border-slate-100 hover:border-blue-200 hover:bg-white" : "bg-slate-50/50 border-transparent opacity-40"
    )}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all",
          active ? "bg-white text-blue-600 group-hover:scale-110" : "bg-slate-100 text-slate-400"
        )}>
          <Download size={20} />
        </div>
        <div>
          <p className="text-sm font-black text-slate-800">{title}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{type}</p>
        </div>
      </div>
    </div>
  );
}
