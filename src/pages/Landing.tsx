import { Link } from 'react-router-dom';
import { ShipWheel, ArrowLeft, ShieldCheck, Clock, BarChart3, Globe, Zap, Layers } from 'lucide-react';
import { motion } from 'motion/react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      {/* Premium Navigation */}
      <nav className="fixed top-0 left-0 w-full z-50 glass border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white shadow-2xl">
              <ShipWheel size={22} />
            </div>
            <span className="text-xl font-black tracking-tight uppercase font-serif">logistic plus .ir</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-slate-600 hover:text-black transition-colors">ویژگی‌ها</a>
            <a href="#solutions" className="text-sm font-medium text-slate-600 hover:text-black transition-colors">راهکارها</a>
            <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-black transition-colors">قیمت‌گذاری</a>
          </div>

          <Link
            to="/app"
            className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-slate-800 transition-all flex items-center gap-2 group shadow-xl shadow-black/10"
          >
            ورود به پنل دمو
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold mb-8">
              <Zap size={14} />
              نسل جدید مدیریت لجستیک B2B
            </div>
            
            <h1 className="text-6xl md:text-8xl font-black leading-[1.05] tracking-tight-lux mb-8 max-w-5xl mx-auto">
              هوشمندی در <span className="text-blue-600 italic font-serif">هر مرحله</span> از زنجیره تأمین
            </h1>
            
            <p className="text-xl text-slate-500 leading-relaxed mb-12 max-w-2xl mx-auto">
              پنل اختصاصی فورواردرها برای مدیریت متمرکز پرونده‌ها، کنترل دموراژ و ارائه شفافیت کامل به مشتریان. طراحی شده برای کلاس جهانی.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/app"
                className="bg-black text-white px-10 py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-2xl shadow-black/20 flex items-center gap-3"
              >
                شروع تجربه دمو
                <ArrowLeft size={20} />
              </Link>
              <button className="bg-white border border-black/10 text-slate-700 px-10 py-5 rounded-2xl font-bold text-lg hover:bg-slate-50 transition-all">
                درخواست مشاوره
              </button>
            </div>
          </motion.div>

          {/* Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mt-24 relative max-w-6xl mx-auto"
          >
            <div className="bg-white rounded-[3rem] p-4 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] border border-black/5 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/20 z-10 pointer-events-none" />
              <img
                src="https://picsum.photos/seed/logistics-lux/1600/1000"
                alt="Premium Dashboard"
                className="rounded-[2.5rem] w-full shadow-2xl group-hover:scale-[1.02] transition-transform duration-1000"
                referrerPolicy="no-referrer"
              />
              
              {/* Floating UI Elements */}
              <motion.div 
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-12 right-12 glass p-6 rounded-3xl shadow-2xl border border-white/50 z-20 hidden md:block"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-green-200">
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</div>
                    <div className="text-sm font-black">مدارک تایید شد</div>
                  </div>
                </div>
                <div className="flex -space-x-2 rtl:space-x-reverse">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 overflow-hidden">
                      <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" referrerPolicy="no-referrer" />
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div 
                animate={{ y: [0, 20, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                className="absolute bottom-12 left-12 glass p-6 rounded-3xl shadow-2xl border border-white/50 z-20 hidden md:block"
              >
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    <Clock size={20} />
                  </div>
                  <div className="text-sm font-black">شمارش معکوس فریتایم</div>
                </div>
                <div className="text-3xl font-black text-blue-600 font-serif italic">۳ روز و ۱۲ ساعت</div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-50 rounded-full blur-[120px] opacity-60" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-50 rounded-full blur-[120px] opacity-60" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]" />
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-[0.3em] mb-4">ویژگی‌های کلیدی</h2>
            <p className="text-4xl md:text-5xl font-black tracking-tight-lux">طراحی شده برای <span className="italic font-serif">دقت و سرعت</span></p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <FeatureCard 
              icon={Layers} 
              title="مدیریت متمرکز" 
              desc="تمام پرونده‌های دریایی، زمینی و هوایی در یک نمای واحد با دسترسی سریع به تمام جزئیات."
            />
            <FeatureCard 
              icon={Globe} 
              title="شفافیت بین‌المللی" 
              desc="ارائه لینک‌های رهگیری اختصاصی به مشتریان با قابلیت مشاهده تایملاین و اسناد در هر لحظه."
            />
            <FeatureCard 
              icon={BarChart3} 
              title="گزارشات هوشمند" 
              desc="تحلیل عملکرد عملیات، شناسایی گلوگاه‌ها و کاهش هزینه‌های ناشی از تاخیر و دموراژ."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-black/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
              <ShipWheel size={18} />
            </div>
            <span className="text-lg font-black tracking-tight uppercase font-serif">logistic plus .ir</span>
          </div>
          <div className="flex gap-8 text-sm font-medium text-slate-500">
            <a href="#" className="hover:text-black transition-colors">قوانین</a>
            <a href="#" className="hover:text-black transition-colors">حریم خصوصی</a>
            <a href="#" className="hover:text-black transition-colors">تماس با ما</a>
          </div>
          <p className="text-sm text-slate-400">© ۱۴۰۵ تمامی حقوق محفوظ است.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: any) {
  return (
    <div className="group p-10 rounded-[2.5rem] bg-slate-50 border border-transparent hover:border-black/5 hover:bg-white hover:shadow-2xl transition-all duration-500">
      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-black shadow-xl mb-8 group-hover:scale-110 transition-transform">
        <Icon size={32} />
      </div>
      <h3 className="text-2xl font-black mb-4">{title}</h3>
      <p className="text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}
