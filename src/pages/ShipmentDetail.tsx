import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApp } from '../App';
import { 
  ArrowRight, Ship, Truck, Plane, MapPin, Calendar, 
  Clock, CheckCircle2, Circle, AlertCircle, ExternalLink, 
  Plus, Copy, Check, Edit2, Save, X, ShieldCheck, Zap, User, Users
} from 'lucide-react';
import { toPersianDigits, cn } from '../lib/utils';
import { differenceInDays, parseISO, formatISO } from 'date-fns';
import { StatusUpdate, TaskStatus } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function ShipmentDetail() {
  const { id } = useParams();
  const { shipments, updateShipment, employees } = useApp();
  const shipment = shipments.find(s => s.id === id);

  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [newStatusType, setNewStatusType] = useState('');
  const [isEditingFreeTime, setIsEditingFreeTime] = useState(false);
  const [tempAta, setTempAta] = useState(shipment?.ata || '');
  const [tempFreeDays, setTempFreeDays] = useState(shipment?.freeDaysPort || 0);
  const [copied, setCopied] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);

  if (!shipment) return <div className="p-8 text-center">پرونده یافت نشد</div>;

  const handleToggleTask = (taskId: string) => {
    const updatedTasks = shipment.tasks.map(t => {
      if (t.id === taskId) {
        const nextStatus: TaskStatus = t.status === 'انجام نشده' ? 'در حال انجام' : 
                                       t.status === 'در حال انجام' ? 'انجام شد' : 'انجام نشده';
        return { ...t, status: nextStatus };
      }
      return t;
    });
    updateShipment({ ...shipment, tasks: updatedTasks });
  };

  const handleAssignTask = (taskId: string, employeeId: string) => {
    const updatedTasks = shipment.tasks.map(t => 
      t.id === taskId ? { ...t, assignedTo: employeeId } : t
    );
    updateShipment({ ...shipment, tasks: updatedTasks });
    setAssigningTaskId(null);
  };

  const handleAddStatus = () => {
    if (!newStatusType) return;
    const newUpdate: StatusUpdate = {
      id: Math.random().toString(36).substr(2, 9),
      type: newStatusType,
      timestamp: new Date().toISOString(),
      jalaliDate: '۱۴۰۵/۰۱/۲۰', // Simplified for demo
      isInternal: false
    };
    updateShipment({ ...shipment, timeline: [...shipment.timeline, newUpdate] });
    setNewStatusType('');
    setIsAddingStatus(false);
  };

  const handleSaveFreeTime = () => {
    updateShipment({ ...shipment, ata: tempAta, freeDaysPort: Number(tempFreeDays) });
    setIsEditingFreeTime(false);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/p/${shipment.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Link to="/app/shipments" className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 text-slate-400 hover:text-blue-600 transition-all shadow-sm">
              <ArrowRight size={20} className="md:size-24" />
            </Link>
            <div className="flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              {shipment.mode} • {shipment.type}
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight-lux font-serif italic">
            پرونده <span className="font-mono not-italic text-2xl md:text-4xl text-blue-600 dark:text-blue-400 ml-2">{shipment.jobNo}</span>
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 text-slate-400 dark:text-slate-500 font-medium text-sm">
            <div className="flex items-center gap-2">
              <Users size={16} />
              <span>{shipment.customerName}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={16} />
              <span>{shipment.origin} → {shipment.destination}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button 
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 text-slate-600 dark:text-slate-300 font-bold text-sm hover:border-blue-200 dark:hover:border-blue-800 transition-all shadow-sm"
          >
            {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
            {copied ? 'کپی شد' : 'کپی لینک رهگیری'}
          </button>
          <Link 
            to={`/p/${shipment.token}`}
            target="_blank"
            className="flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20"
          >
            <ExternalLink size={18} />
            مشاهده نمای مشتری
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10">
        {/* Left Column: Timeline & Tasks */}
        <div className="lg:col-span-8 space-y-8 md:space-y-10">
          {/* Status Timeline */}
          <motion.div 
            variants={item}
            className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 p-6 md:p-10 shadow-lux relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-8 md:mb-12">
              <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white font-serif italic">تاریخچه وضعیت</h3>
              <button 
                onClick={() => setIsAddingStatus(true)}
                className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-blue-600 transition-all flex items-center justify-center"
              >
                <Plus size={20} />
              </button>
            </div>

            <div className="relative space-y-8 md:space-y-10 pr-4">
              <div className="absolute right-[19px] top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-white/5" />
              
              {shipment.timeline.map((update, idx) => (
                <div key={update.id} className="relative flex gap-6 md:gap-8 group">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center z-10 transition-all shadow-sm shrink-0",
                    idx === 0 ? "bg-blue-600 text-white scale-110 shadow-blue-500/30" : "bg-white dark:bg-slate-800 text-slate-300 dark:text-slate-600 border border-black/5 dark:border-white/5"
                  )}>
                    {update.type === 'تخلیه' ? <Truck size={18} /> : <Ship size={18} />}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-center justify-between mb-1 md:mb-2">
                      <h4 className={cn(
                        "font-black text-base md:text-lg",
                        idx === 0 ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-600"
                      )}>
                        {update.type}
                      </h4>
                      <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{update.jalaliDate}</span>
                    </div>
                    <p className="text-xs md:text-sm text-slate-500 dark:text-slate-500 leading-relaxed font-medium">{update.location || 'در حال پردازش'}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-blue-600/5 rounded-full blur-[80px] -mr-24 -mb-24 pointer-events-none" />
          </motion.div>

          {/* Checklist */}
          <motion.div 
            variants={item}
            className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-black/5 dark:border-white/5 p-6 md:p-10 shadow-lux"
          >
            <div className="flex items-center justify-between mb-8 md:mb-10">
              <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white font-serif italic">چک‌لیست عملیاتی</h3>
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5">
                <ShieldCheck size={16} className="text-green-500" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Verified</span>
              </div>
            </div>
            
            <div className="space-y-4">
              {shipment.tasks.map(task => {
                const assignedEmployee = employees.find(e => e.id === task.assignedTo);
                
                return (
                  <div key={task.id} className="group relative">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className="flex-1 flex items-center justify-between p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-50 dark:border-white/5 hover:border-blue-100 dark:hover:border-blue-900/30 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all group/btn"
                      >
                        <div className="flex items-center gap-4 md:gap-6">
                          <div className={cn(
                            "w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center transition-all shadow-sm shrink-0",
                            task.status === 'انجام شد' ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" : 
                            task.status === 'در حال انجام' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "bg-slate-50 dark:bg-white/5 text-slate-300 dark:text-slate-700 group-hover/btn:text-blue-400"
                          )}>
                            {task.status === 'انجام شد' ? <CheckCircle2 size={20} className="md:size-24" /> : 
                             task.status === 'در حال انجام' ? <Clock size={20} className="md:size-24" /> : <Circle size={20} className="md:size-24" />}
                          </div>
                          <span className={cn(
                            "text-sm md:text-lg font-bold transition-all dark:text-white text-right",
                            task.status === 'انجام شد' ? "text-slate-400 dark:text-slate-600 line-through" : "text-slate-700"
                          )}>
                            {task.title}
                          </span>
                        </div>
                        <span className={cn(
                          "text-[8px] md:text-[10px] font-black px-3 md:px-4 py-1 md:py-1.5 rounded-full border shadow-sm whitespace-nowrap",
                          task.status === 'انجام شد' ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-100 dark:border-green-900/30" :
                          task.status === 'در حال انجام' ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/30" :
                          "bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-white/10"
                        )}>
                          {task.status}
                        </span>
                      </button>

                      {/* Assignment UI */}
                      <div className="relative flex justify-end sm:block">
                        <button
                          onClick={() => setAssigningTaskId(assigningTaskId === task.id ? null : task.id)}
                          className="flex items-center gap-3 md:gap-4 p-1.5 pr-4 md:pr-5 rounded-[1.25rem] md:rounded-[1.5rem] bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-blue-200 dark:hover:border-blue-800 transition-all shadow-sm"
                        >
                          <div className="text-right">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Assigned To</p>
                            <p className="text-[10px] md:text-xs font-bold text-slate-700 dark:text-slate-300">{assignedEmployee?.name || 'تعیین نشده'}</p>
                          </div>
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white dark:bg-slate-800 border border-black/5 dark:border-white/5 overflow-hidden flex items-center justify-center shadow-sm">
                            {assignedEmployee?.avatar ? (
                              <img src={assignedEmployee.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User size={18} className="text-slate-300" />
                            )}
                          </div>
                        </button>

                        <AnimatePresence>
                          {assigningTaskId === task.id && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute left-0 top-full mt-3 w-72 bg-white dark:bg-slate-800 border border-black/10 dark:border-white/10 rounded-[2rem] shadow-2xl z-50 p-3"
                            >
                              <p className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-black/5 dark:border-white/5 mb-3">Assign Staff</p>
                              <div className="space-y-1">
                                {employees.map(emp => (
                                  <button
                                    key={emp.id}
                                    onClick={() => handleAssignTask(task.id, emp.id)}
                                    className={cn(
                                      "w-full flex items-center gap-4 p-3 rounded-2xl transition-all",
                                      task.assignedTo === emp.id ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400"
                                    )}
                                  >
                                    <img src={emp.avatar} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm" referrerPolicy="no-referrer" />
                                    <div className="text-right">
                                      <p className="text-sm font-bold">{emp.name}</p>
                                      <p className="text-[10px] opacity-60 font-medium">{emp.role}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Right Column: Info & Countdown */}
        <div className="lg:col-span-4 space-y-10">
          {/* Summary Card */}
          <motion.div 
            variants={item}
            className="bg-slate-900 rounded-[3rem] p-10 shadow-2xl text-white relative overflow-hidden"
          >
            <div className="relative z-10 space-y-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white shadow-xl">
                  <Zap size={24} />
                </div>
                <h3 className="text-xl font-black font-serif italic">اطلاعات کلیدی</h3>
              </div>
              
              <div className="space-y-6">
                <SummaryItem label="مشتری" value={shipment.customerName} icon={Users} />
                <SummaryItem label="مبدا" value={shipment.origin} icon={MapPin} />
                <SummaryItem label="مقصد" value={shipment.destination} icon={MapPin} />
                <SummaryItem label="اینکوترم" value={shipment.incoterm} icon={ShieldCheck} />
              </div>
            </div>
            <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-blue-600/50 rounded-full blur-[100px]" />
          </motion.div>

          {/* Demurrage Countdown */}
          <motion.div 
            variants={item}
            className="bg-white dark:bg-slate-900 rounded-[3rem] border border-black/5 dark:border-white/5 p-10 shadow-lux relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-xl font-black text-slate-900 dark:text-white font-serif italic">مهلت فریتایم</h3>
              <button 
                onClick={() => setIsEditingFreeTime(!isEditingFreeTime)}
                className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-blue-600 transition-all flex items-center justify-center"
              >
                {isEditingFreeTime ? <X size={20} /> : <Edit2 size={18} />}
              </button>
            </div>

            {isEditingFreeTime ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">زمان ورود (ATA)</label>
                  <input 
                    type="date" 
                    value={tempAta}
                    onChange={(e) => setTempAta(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-6 text-sm font-bold dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">تعداد روز رایگان</label>
                  <input 
                    type="number" 
                    value={tempFreeDays}
                    onChange={(e) => setTempFreeDays(parseInt(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-6 text-sm font-bold dark:text-white"
                  />
                </div>
                <button 
                  onClick={handleSaveFreeTime}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all"
                >
                  ذخیره تغییرات
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-8">
                  <svg className="w-40 h-40 transform -rotate-90">
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      className="text-slate-50 dark:text-white/5"
                    />
                    <motion.circle
                      cx="80"
                      cy="80"
                      r="70"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={440}
                      initial={{ strokeDashoffset: 440 }}
                      animate={{ strokeDashoffset: 440 - (440 * Math.min(Math.max(daysLeft, 0), shipment.freeDaysPort)) / shipment.freeDaysPort }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className={cn(
                        daysLeft <= 3 ? "text-red-500" : daysLeft <= 7 ? "text-amber-500" : "text-green-500"
                      )}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-black text-slate-900 dark:text-white font-serif italic">{toPersianDigits(Math.max(daysLeft, 0))}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Days Left</span>
                  </div>
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">زمان ورود: {toPersianDigits(shipment.ata || 'ثبت نشده')}</p>
                <p className="text-[11px] text-slate-400 font-medium">پس از اتمام مهلت رایگان، هزینه دموراژ محاسبه می‌شود.</p>
              </div>
            )}
            
            <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/5 rounded-full blur-[60px] -ml-16 -mt-16 pointer-events-none" />
          </motion.div>

          {/* Alerts Section */}
          {shipment.alerts.length > 0 && (
            <motion.div 
              variants={item}
              className="bg-red-50 dark:bg-red-900/10 rounded-[3rem] border border-red-100 dark:border-red-900/30 p-10 shadow-sm"
            >
              <div className="flex items-center gap-4 mb-6 text-red-600 dark:text-red-400">
                <AlertCircle size={24} />
                <h3 className="text-xl font-black font-serif italic">هشدارهای فعال</h3>
              </div>
              <div className="space-y-4">
                {shipment.alerts.map(alert => (
                  <div key={alert.id} className="flex gap-4 items-start">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 shrink-0" />
                    <p className="text-sm font-bold text-red-800 dark:text-red-300 leading-relaxed">{alert.message}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SummaryItem({ label, value, icon: Icon }: any) {
  return (
    <div className="flex items-center gap-5 group">
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-blue-400 group-hover:bg-white/10 transition-all">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-sm font-bold text-white/90">{value}</p>
      </div>
    </div>
  );
}
