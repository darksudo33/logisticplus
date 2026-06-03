import React, { useState, useMemo } from "react";
import { useMockStore } from "@/src/store/useMockStore";
import { 
  Calculator, 
  Plus, 
  Search, 
  FileText, 
  MoreVertical, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileJson, 
  Printer,
  History,
  TrendingUp,
  Percent,
  Fuel,
  Truck,
  User,
  Phone,
  MapPin,
  Calendar,
  Layers,
  ArrowRightLeft,
  ChevronDown,
  Trash2,
  Edit,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Quote, QuoteStatus, CargoType } from "@/src/types";
import { format } from "date-fns-jalali";
import { EmptyState, resetFiltersAction } from "@/src/components/EmptyState";

const CargoTypeBadge = ({ type }: { type: CargoType }) => {
  const styles: Record<CargoType, string> = {
    GENERAL: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    REFRIGERATED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    HAZARDOUS: "bg-red-500/10 text-red-500 border-red-500/20",
    OVERSIZED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  };
  const labels: Record<CargoType, string> = {
    GENERAL: "کالای عمومی",
    REFRIGERATED: "یخچالی",
    HAZARDOUS: "خطرناک",
    OVERSIZED: "فوق سنگین",
  };
  return (
    <Badge variant="outline" className={cn("text-[9px] font-black h-5", styles[type])}>
      {labels[type]}
    </Badge>
  );
};

const QuoteStatusBadge = ({ status }: { status: QuoteStatus }) => {
  const styles: Record<QuoteStatus, string> = {
    PENDING: "bg-muted text-muted-foreground border-border",
    ACCEPTED: "bg-green-500/10 text-green-500 border-green-500/20",
    REJECTED: "bg-red-500/10 text-red-500 border-red-500/20",
    EXPIRED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  };
  const labels: Record<QuoteStatus, string> = {
    PENDING: "در انتظار",
    ACCEPTED: "پذیرفته شده",
    REJECTED: "رد شده",
    EXPIRED: "منقضی شده",
  };
  const Icon = {
    PENDING: Clock,
    ACCEPTED: CheckCircle2,
    REJECTED: AlertCircle,
    EXPIRED: AlertCircle,
  }[status];

  return (
    <Badge variant="outline" className={cn("text-[10px] font-black h-6 gap-1.5", styles[status])}>
      <Icon className="w-3 h-3" />
      {labels[status]}
    </Badge>
  );
};

export default function QuotageManagement() {
  const { quotes, loadCurrentUserRecords, currentUser } = useMockStore();
  const canViewCustomerPrivateDetails = currentUser?.role === "CEO";
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<QuoteStatus | "ALL">("ALL");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [printingQuoteId, setPrintingQuoteId] = useState<string | null>(null);

  // Form State
  const initialQuoteState: Partial<Quote> = {
    customerName: "",
    customerPhone: "",
    originCity: "",
    destinationCity: "",
    cargoType: "GENERAL",
    weight: 0,
    dimensions: "",
    requirements: [],
    baseRate: 0,
    fuelSurcharge: 0,
    loadingFees: 0,
    tollFees: 0,
    insurancePercentage: 1,
    profitMargin: 10,
    status: "PENDING",
  };

  const [newQuote, setNewQuote] = useState<Partial<Quote>>(initialQuoteState);

  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      const matchesSearch = 
        q.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.originCity.includes(searchTerm) ||
        q.destinationCity.includes(searchTerm);
      const matchesStatus = activeTab === "ALL" || q.status === activeTab;
      return matchesSearch && matchesStatus;
    });
  }, [quotes, searchTerm, activeTab]);
  const resetQuoteFilters = () => {
    setSearchTerm("");
    setActiveTab("ALL");
  };

  const stats = useMemo(() => {
    const total = quotes.length;
    const accepted = quotes.filter(q => q.status === "ACCEPTED").length;
    const pending = quotes.filter(q => q.status === "PENDING").length;
    const winRate = total > 0 ? (accepted / total) * 100 : 0;
    const avgValue = total > 0 ? quotes.reduce((acc, q) => acc + q.totalPrice, 0) / total : 0;

    return [
      { title: "کل استعلام‌ها", value: total, icon: FileText, color: "text-blue-500" },
      { title: "نرخ موفقیت", value: `${Math.round(winRate)}%`, icon: TrendingUp, color: "text-emerald-500" },
      { title: "در انتظار پاسخ", value: pending, icon: Clock, color: "text-amber-500" },
      { title: "متوسط ارزش (میلیون)", value: `${(avgValue / 1000000).toFixed(1)}`, icon: Calculator, color: "text-purple-500" },
    ];
  }, [quotes]);

  const calculateTotal = (q: Partial<Quote>) => {
    const base = Number(q.baseRate) || 0;
    const fuel = Number(q.fuelSurcharge) || 0;
    const loading = Number(q.loadingFees) || 0;
    const toll = Number(q.tollFees) || 0;
    const insuranceMult = 1 + (Number(q.insurancePercentage) || 0) / 100;
    const profitMult = 1 + (Number(q.profitMargin) || 0) / 100;

    const subtotal = base + fuel + loading + toll;
    return Math.round(subtotal * insuranceMult * profitMult);
  };

  const handleEditClick = (quote: Quote) => {
    setNewQuote(quote);
    setEditingQuoteId(quote.id);
    setShowAddForm(true);
  };

  const handlePrint = (quote: Quote) => {
    const originalTitle = document.title;
    document.title = `Quotation_${quote.customerName}_${quote.id}`;

    let restored = false;
    const restorePrintState = () => {
      if (restored) return;
      restored = true;
      document.title = originalTitle;
      setPrintingQuoteId(null);
      window.removeEventListener("afterprint", restorePrintState);
    };

    setPrintingQuoteId(quote.id);
    window.addEventListener("afterprint", restorePrintState, { once: true });
    window.setTimeout(() => {
      window.print();
      window.setTimeout(restorePrintState, 1000);
    }, 0);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingQuoteId(null);
    setNewQuote(initialQuoteState);
  };

  const saveQuote = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error?.message || "Quotation request failed.");
    }
    await loadCurrentUserRecords();
    return payload?.data;
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalPrice = calculateTotal(newQuote);
    
    try {
      if (editingQuoteId) {
        await saveQuote(`/api/quotations/${editingQuoteId}`, {
          method: "PATCH",
          body: JSON.stringify({
        customerName: newQuote.customerName,
        ...(canViewCustomerPrivateDetails ? { customerPhone: newQuote.customerPhone } : {}),
        originCity: newQuote.originCity,
        destinationCity: newQuote.destinationCity,
        cargoType: newQuote.cargoType,
        weight: Number(newQuote.weight),
        dimensions: newQuote.dimensions,
        requirements: newQuote.requirements,
        baseRate: Number(newQuote.baseRate),
        fuelSurcharge: Number(newQuote.fuelSurcharge),
        loadingFees: Number(newQuote.loadingFees),
        tollFees: Number(newQuote.tollFees),
        insurancePercentage: Number(newQuote.insurancePercentage),
        profitMargin: Number(newQuote.profitMargin),
        totalPrice,
        notes: newQuote.notes,
          }),
        });
    } else {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7);

        await saveQuote("/api/quotations", {
          method: "POST",
          body: JSON.stringify({
        customerName: newQuote.customerName || "",
        ...(canViewCustomerPrivateDetails ? { customerPhone: newQuote.customerPhone || "" } : {}),
        originCity: newQuote.originCity || "",
        destinationCity: newQuote.destinationCity || "",
        cargoType: newQuote.cargoType as CargoType,
        weight: Number(newQuote.weight) || 0,
        dimensions: newQuote.dimensions || "",
        pickupDate: new Date().toISOString(),
        deliveryDate: new Date().toISOString(),
        requirements: newQuote.requirements || [],
        baseRate: Number(newQuote.baseRate) || 0,
        fuelSurcharge: Number(newQuote.fuelSurcharge) || 0,
        loadingFees: Number(newQuote.loadingFees) || 0,
        tollFees: Number(newQuote.tollFees) || 0,
        insurancePercentage: Number(newQuote.insurancePercentage) || 0,
        profitMargin: Number(newQuote.profitMargin) || 0,
        totalPrice,
        validUntil: validUntil.toISOString(),
        status: "PENDING",
        notes: newQuote.notes,
          }),
      });
    }
      handleCloseForm();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="app-page space-y-5 font-sans rtl text-foreground min-h-full">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Calculator className="w-5 h-5" />
            </span>
            مدیریت کوتاژ (استعلام قیمت)
          </h1>
          <p className="text-muted-foreground text-xs font-bold mt-1">مدیریت، محاسبه و پیگیری نرخ‌های اعلامی به مشتریان</p>
        </div>
        <Button 
          data-testid="open-quotation-dialog"
          onClick={() => setShowAddForm(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11 px-5 rounded-xl shadow-sm shadow-emerald-500/20"
        >
          <Plus className="w-5 h-5 ml-2" />
          ثبت استعلام جدید
        </Button>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat, i) => (
          <Card key={i} className="bg-card border-border rounded-xl shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={cn("w-5 h-5", stat.color)} />
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">{stat.title}</p>
              </div>
              <p className="text-2xl font-black text-foreground">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-5">
        <Card className="bg-card border-border rounded-xl overflow-hidden shadow-sm">
          <CardHeader className="p-4 md:p-6 border-b border-border">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="جستجو در مشتریان یا مسیرها..." 
                  className="bg-muted border-border pr-10 h-10 text-xs font-bold text-foreground rounded-xl"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full md:w-auto">
                <TabsList className="bg-muted border-border p-1 h-10 rounded-xl">
                  <TabsTrigger value="ALL" className="text-[10px] font-black rounded-lg px-4 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">همه</TabsTrigger>
                  <TabsTrigger value="PENDING" className="text-[10px] font-black rounded-lg px-4 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">در انتظار</TabsTrigger>
                  <TabsTrigger value="ACCEPTED" className="text-[10px] font-black rounded-lg px-4 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">پذیرفته شده</TabsTrigger>
                  <TabsTrigger value="REJECTED" className="text-[10px] font-black rounded-lg px-4 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">رد شده</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table - Hidden on Mobile */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-primary/5 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">مشتری و مسیر</th>
                    <th className="px-6 py-4">نوع کالا / وزن</th>
                    <th className="px-6 py-4">قیمت نهایی</th>
                    <th className="px-6 py-4">اعتبار / تاریخ ثبت</th>
                    <th className="px-6 py-4">وضعیت</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredQuotes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6">
                        <EmptyState
                          icon={Calculator}
                          title={quotes.length === 0 ? "هنوز استعلام قیمتی ثبت نشده" : "استعلامی با این فیلترها پیدا نشد"}
                          description={quotes.length === 0 ? "اولین پیش‌فاکتور یا استعلام قیمت را بسازید تا نرخ‌ها، حاشیه سود و وضعیت پاسخ پیگیری شوند." : "عبارت جستجو یا وضعیت انتخاب‌شده را تغییر دهید."}
                          primaryAction={quotes.length === 0 ? { label: "ثبت استعلام جدید", onClick: () => setShowAddForm(true), icon: Plus } : resetFiltersAction(resetQuoteFilters)}
                          compact
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredQuotes.map((quote) => (
                      <tr key={quote.id} className="hover:bg-muted/30 transition-all group">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-black text-foreground">{quote.customerName}</span>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold">
                              <MapPin className="w-3 h-3" />
                              {quote.originCity}
                              <ArrowRightLeft className="w-2.5 h-2.5 mx-0.5 opacity-50" />
                              {quote.destinationCity}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <CargoTypeBadge type={quote.cargoType} />
                            <span className="text-[10px] text-muted-foreground font-bold">{quote.weight} تن</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-black text-emerald-500">{quote.totalPrice.toLocaleString('fa-IR')} <span className="text-[10px] text-muted-foreground mr-0.5">ریال</span></span>
                            <span className="text-[9px] text-muted-foreground font-bold">حاشیه سود: {quote.profitMargin}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className={cn("text-[10px] font-black px-2 py-0.5 rounded bg-muted w-fit", 
                              new Date(quote.validUntil) < new Date() ? "text-red-500" : "text-blue-500")}>
                              اعتبار تا: {format(new Date(quote.validUntil), "yyyy/MM/dd")}
                            </span>
                            <span className="text-[9px] text-muted-foreground/60 font-bold">ثبت: {format(new Date(quote.createdAt), "yyyy/MM/dd")}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <QuoteStatusBadge status={quote.status} />
                        </td>
                        <td className="px-6 py-4 text-left">
                          <div className="flex items-center justify-end gap-2 transition-all">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              onClick={() => handlePrint(quote)}
                              aria-label={`Print quotation ${quote.id}`}
                              title="Print quotation"
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                              onClick={() => handleEditClick(quote)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="w-8 h-8 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                              onClick={() => saveQuote(`/api/quotations/${quote.id}/archive`, { method: "POST" })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile List - Responsive Cards */}
            <div className="md:hidden flex flex-col divide-y divide-border">
              {filteredQuotes.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={Calculator}
                    title={quotes.length === 0 ? "هنوز استعلام قیمتی ثبت نشده" : "استعلامی با این فیلترها پیدا نشد"}
                    description={quotes.length === 0 ? "اولین پیش‌فاکتور یا استعلام قیمت را بسازید تا نرخ‌ها، حاشیه سود و وضعیت پاسخ پیگیری شوند." : "عبارت جستجو یا وضعیت انتخاب‌شده را تغییر دهید."}
                    primaryAction={quotes.length === 0 ? { label: "ثبت استعلام جدید", onClick: () => setShowAddForm(true), icon: Plus } : resetFiltersAction(resetQuoteFilters)}
                    compact
                  />
                </div>
              ) : (
                filteredQuotes.map((quote) => (
                  <div key={quote.id} className="p-4 space-y-4 hover:bg-muted/20 transition-all relative overflow-hidden group">
                    {/* Status accent */}
                    <div className={cn(
                      "absolute right-0 top-0 bottom-0 w-1",
                      quote.status === "ACCEPTED" ? "bg-green-500" : 
                      quote.status === "REJECTED" ? "bg-red-500" : 
                      quote.status === "EXPIRED" ? "bg-amber-500" : "bg-muted"
                    )} />

                    <div className="flex items-start justify-between gap-4 pr-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[13px] font-black text-foreground truncate mb-1">{quote.customerName}</h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold">
                          <MapPin className="w-3 h-3 text-primary" />
                          <span>{quote.originCity}</span>
                          <ArrowRightLeft className="w-2.5 h-2.5 mx-0.5 opacity-50" />
                          <span>{quote.destinationCity}</span>
                        </div>
                      </div>
                      <QuoteStatusBadge status={quote.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-4 items-end bg-muted/20 p-3 rounded-2xl border border-border">
                      <div className="space-y-2">
                        <CargoTypeBadge type={quote.cargoType} />
                        <div className="flex items-center gap-1.5">
                           <Layers className="w-3 h-3 text-muted-foreground" />
                           <span className="text-[10px] text-muted-foreground font-bold">{quote.weight} تن محموله</span>
                        </div>
                      </div>
                      <div className="text-left space-y-1">
                        <span className="block text-[8px] font-black text-muted-foreground uppercase">قیمت کل استعلام</span>
                        <span className="text-sm font-black text-emerald-500">{quote.totalPrice.toLocaleString('fa-IR')} <span className="text-[10px] text-muted-foreground font-medium">ریال</span></span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-bold">
                          <Calendar className="w-3 h-3" />
                          ثبت: {format(new Date(quote.createdAt), "yyyy/MM/dd")}
                        </div>
                        <div className={cn("flex items-center gap-1.5 text-[9px] font-black", 
                          new Date(quote.validUntil) < new Date() ? "text-red-500" : "text-blue-500")}>
                          <Clock className="w-3 h-3" />
                          اعتبار: {format(new Date(quote.validUntil), "yyyy/MM/dd")}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="w-8 h-8 rounded-lg bg-muted text-muted-foreground"
                          onClick={() => handlePrint(quote)}
                          aria-label={`Print quotation ${quote.id}`}
                          title="Print quotation"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="w-8 h-8 rounded-lg bg-muted text-muted-foreground"
                          onClick={() => handleEditClick(quote)}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20"
                          onClick={() => saveQuote(`/api/quotations/${quote.id}/archive`, { method: "POST" })}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Form Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/15 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="app-modal-content bg-popover border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="app-modal-header p-6 border-b border-border flex items-center justify-between bg-primary/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                    {editingQuoteId ? <Edit className="w-6 h-6 text-emerald-500" /> : <Plus className="w-6 h-6 text-emerald-500" />}
                  </div>
                  <div>
                    <h2 className="app-modal-title text-sm font-black text-foreground uppercase tracking-wider">
                      {editingQuoteId ? "ویرایش استعلام قیمت" : "ثبت استعلام قیمت جدید"}
                    </h2>
                    <p className="text-[10px] text-muted-foreground font-bold mt-0.5 tracking-tight uppercase opacity-70">
                      {editingQuoteId ? "Edit Freight Quotation" : "New Freight Quotation"}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="rounded-xl hover:bg-muted text-muted-foreground"
                  onClick={handleCloseForm}
                >
                  <Trash2 className="w-5 h-5 rotate-45" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                <form id="quote-form" onSubmit={handleSubmitQuote} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column: Customer & Route */}
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-black text-primary uppercase flex items-center gap-2">
                        <User className="w-3.5 h-3.5" />
                        اطلاعات مشتری
                      </h3>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">نام مشتری / شرکت</label>
                          <Input 
                            className="bg-background border-border h-11 text-xs font-bold text-foreground rounded-xl"
                            required
                            value={newQuote.customerName}
                            onChange={(e) => setNewQuote({...newQuote, customerName: e.target.value})}
                          />
                        </div>
                        {canViewCustomerPrivateDetails ? <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">شماره تماس</label>
                          <Input 
                            className="bg-background border-border h-11 text-xs font-bold text-foreground rounded-xl text-left font-mono"
                            required
                            value={newQuote.customerPhone}
                            onChange={(e) => setNewQuote({...newQuote, customerPhone: e.target.value})}
                          />
                        </div> : null}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[11px] font-black text-primary uppercase flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" />
                        اطلاعات مسیر
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">مبدأ</label>
                          <Input 
                            className="bg-background border-border h-11 text-xs font-bold text-foreground rounded-xl"
                            required
                            value={newQuote.originCity}
                            onChange={(e) => setNewQuote({...newQuote, originCity: e.target.value})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">مقصد</label>
                          <Input 
                            className="bg-background border-border h-11 text-xs font-bold text-foreground rounded-xl"
                            required
                            value={newQuote.destinationCity}
                            onChange={(e) => setNewQuote({...newQuote, destinationCity: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[11px] font-black text-primary uppercase flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5" />
                        مشخصات محموله
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">نوع کالا</label>
                          <select 
                            className="w-full bg-background border border-border h-11 text-xs font-bold text-foreground rounded-xl px-3 outline-none"
                            value={newQuote.cargoType}
                            onChange={(e) => setNewQuote({...newQuote, cargoType: e.target.value as CargoType})}
                          >
                            <option value="GENERAL">کالای عمومی</option>
                            <option value="REFRIGERATED">یخچالی</option>
                            <option value="HAZARDOUS">خطرناک (DG)</option>
                            <option value="OVERSIZED">فوق سنگین / ترافیکی</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">وزن (تن)</label>
                          <Input 
                            type="number"
                            className="bg-background border-border h-11 text-xs font-bold text-foreground rounded-xl"
                            value={newQuote.weight}
                            onChange={(e) => setNewQuote({...newQuote, weight: Number(e.target.value)})}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground px-1">وضعیت استعلام</label>
                      <select 
                        className="w-full bg-background border border-border h-11 text-xs font-bold text-foreground rounded-xl px-3 outline-none"
                        value={newQuote.status}
                        onChange={(e) => setNewQuote({...newQuote, status: e.target.value as QuoteStatus})}
                      >
                        <option value="PENDING">در انتظار</option>
                        <option value="ACCEPTED">پذیرفته شده</option>
                        <option value="REJECTED">رد شده</option>
                        <option value="EXPIRED">منقضی شده</option>
                      </select>
                    </div>
                  </div>

                  {/* Right Column: Calculations */}
                  <div className="space-y-6">
                    <div className="bg-background border border-border rounded-2xl p-5 space-y-4 shadow-inner">
                      <h3 className="text-[11px] font-black text-emerald-500 uppercase flex items-center gap-2">
                        <Calculator className="w-3.5 h-3.5" />
                        محاسبات هزینه و سود
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">نرخ پایه (ریال)</label>
                          <Input 
                            type="number"
                            className="bg-card border-border h-10 text-xs font-mono text-foreground rounded-lg"
                            value={newQuote.baseRate}
                            onChange={(e) => setNewQuote({...newQuote, baseRate: Number(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">سوخت (ریال)</label>
                          <Input 
                            type="number"
                            className="bg-card border-border h-10 text-xs font-mono text-foreground rounded-lg"
                            value={newQuote.fuelSurcharge}
                            onChange={(e) => setNewQuote({...newQuote, fuelSurcharge: Number(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">بارگیری/تخلیه</label>
                          <Input 
                            type="number"
                            className="bg-card border-border h-10 text-xs font-mono text-foreground rounded-lg"
                            value={newQuote.loadingFees}
                            onChange={(e) => setNewQuote({...newQuote, loadingFees: Number(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">عوارض و جاده</label>
                          <Input 
                            type="number"
                            className="bg-card border-border h-10 text-xs font-mono text-foreground rounded-lg"
                            value={newQuote.tollFees}
                            onChange={(e) => setNewQuote({...newQuote, tollFees: Number(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">بیمه (%)</label>
                          <Input 
                            type="number"
                            step="0.1"
                            className="bg-card border-border h-10 text-xs font-bold text-foreground rounded-lg"
                            value={newQuote.insurancePercentage}
                            onChange={(e) => setNewQuote({...newQuote, insurancePercentage: Number(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">سود مدیریت (%)</label>
                          <Input 
                            type="number"
                            className="bg-card border-border h-10 text-xs font-bold text-emerald-600 dark:text-emerald-400 rounded-lg"
                            value={newQuote.profitMargin}
                            onChange={(e) => setNewQuote({...newQuote, profitMargin: Number(e.target.value)})}
                          />
                        </div>
                      </div>

                      <div className="mt-6 pt-6 border-t border-border">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] font-black text-muted-foreground">قیمت تخمینی نهایی</span>
                          <span className="text-xl font-black text-foreground tabular-nums">
                            {calculateTotal(newQuote).toLocaleString('fa-IR')} <span className="text-[10px] text-muted-foreground mr-1 italic">ریال</span>
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground px-1">توضیحات و نیازمندی‌های خاص</label>
                      <textarea 
                        className="w-full bg-background border border-border min-h-[100px] text-xs font-bold text-foreground rounded-xl p-3 outline-none resize-none"
                        value={newQuote.notes}
                        onChange={(e) => setNewQuote({...newQuote, notes: e.target.value})}
                      />
                    </div>
                  </div>
                </form>
              </div>

              <div className="app-modal-footer p-6 border-t border-border flex items-center justify-between bg-muted/50">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  اعتبار استعلام صادر شده ۷ روز می‌باشد.
                </div>
                <div className="flex items-center gap-3">
                  <Button 
                    variant="ghost" 
                    className="h-12 px-6 rounded-xl text-muted-foreground font-black text-xs"
                    onClick={handleCloseForm}
                  >
                    انصراف
                  </Button>
                  <Button 
                    form="quote-form"
                    className="h-12 px-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-500/20"
                  >
                    {editingQuoteId ? "بروزرسانی استعلام" : "تأیید و صدور استعلام"}
                    {editingQuoteId ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Printable Areas for Quotes */}
      <div className="print-root pointer-events-none fixed left-0 top-0 h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
        {quotes.map(quote => (
          <div
            key={`print-${quote.id}`}
            id={`printable-quote-${quote.id}`}
            data-print-active={printingQuoteId === quote.id ? "true" : "false"}
            className="print-content p-10 font-sans rtl text-slate-900 bg-white min-h-screen"
          >
            <style>
              {`
                @media print {
                  body * { visibility: hidden; }
                  .print-root {
                    position: static !important;
                    width: auto !important;
                    height: auto !important;
                    overflow: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                  }
                  .print-content {
                    display: none !important;
                    visibility: hidden;
                  }
                  .print-content[data-print-active="true"],
                  .print-content[data-print-active="true"] * { visibility: visible; }
                  .print-content[data-print-active="true"] { 
                    position: absolute; 
                    left: 0; 
                    top: 0; 
                    width: 100%; 
                    display: block !important;
                    background: white !important;
                    color: black !important;
                  }
                  @page { size: auto; margin: 10mm; }
                }
              `}
            </style>
            
            <div className="flex justify-between items-start border-b-2 border-slate-200 pb-8 mb-8">
              <div>
                <h1 className="text-3xl font-black mb-2 text-slate-900">پیش‌فاکتور لجستیک</h1>
                <p className="text-sm text-slate-500 font-bold uppercase tracking-widest leading-none">Freight Quotation / Proforma Invoice</p>
              </div>
              <div className="text-left">
                <div className="bg-slate-900 text-white px-4 py-2 rounded-lg font-black text-lg mb-2">Logistic Plus</div>
                <div className="text-[10px] text-slate-500 font-bold">Quotation ID: {quote.id.toUpperCase()}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-10 mb-10">
              <div className="space-y-4">
                <h2 className="text-xs font-black text-slate-500 uppercase border-b border-slate-100 pb-1">اطلاعات مشتری (Client Details)</h2>
                <div>
                  <div className="text-lg font-black text-slate-900">{quote.customerName}</div>
                  {canViewCustomerPrivateDetails && quote.customerPhone ? (
                    <div className="text-sm text-slate-600 font-mono mt-1">{quote.customerPhone}</div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-4">
                <h2 className="text-xs font-black text-slate-500 uppercase border-b border-slate-100 pb-1">اطلاعات صدور (Issuance Info)</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold">تاریخ صدور:</div>
                    <div className="text-sm font-black">{format(new Date(quote.createdAt), "yyyy/MM/dd")}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-red-500 font-bold">اعتبار تا:</div>
                    <div className="text-sm font-black text-red-600">{format(new Date(quote.validUntil), "yyyy/MM/dd")}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 mb-10">
              <h3 className="text-xs font-black text-slate-400 uppercase mb-4">جزئیات محموله و مسیر (Cargo & Route)</h3>
              <div className="grid grid-cols-4 gap-6">
                <div>
                  <div className="text-[9px] text-slate-400 font-bold mb-1">مبدأ:</div>
                  <div className="text-sm font-black">{quote.originCity}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 font-bold mb-1">مقصد:</div>
                  <div className="text-sm font-black">{quote.destinationCity}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 font-bold mb-1">نوع کالا:</div>
                  <div className="text-sm font-black">{quote.cargoType === 'GENERAL' ? 'عمومی' : quote.cargoType === 'HAZARDOUS' ? 'خطرناک' : 'ویژه'}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 font-bold mb-1">وزن اعلامی:</div>
                  <div className="text-sm font-black">{quote.weight} <span className="text-[10px] opacity-50">تن</span></div>
                </div>
              </div>
            </div>

            <div className="mb-10">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-100 text-slate-500 text-[10px] font-black uppercase">
                    <th className="px-4 py-3 text-right">شرح خدمت (Description)</th>
                    <th className="px-4 py-3 text-left">مبلغ (Amount - IRR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  <tr>
                    <td className="px-4 py-4 text-slate-700 font-bold">نرخ پایه حمل نوبت اول</td>
                    <td className="px-4 py-4 text-left font-mono">{quote.baseRate.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-4 text-slate-700 font-bold">هزینه سوخت و الحاقیه انرژی</td>
                    <td className="px-4 py-4 text-left font-mono">{quote.fuelSurcharge.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-4 text-slate-700 font-bold">بارگیری، جابجایی و انبارداری</td>
                    <td className="px-4 py-4 text-left font-mono">{quote.loadingFees.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-4 text-slate-700 font-bold">عوارض جاده‌ای و مالیات محلی</td>
                    <td className="px-4 py-4 text-left font-mono">{quote.tollFees.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-4 text-slate-700 font-bold italic">حق بیمه کالا ({quote.insurancePercentage}%)</td>
                    <td className="px-4 py-4 text-left font-mono">{Math.round((quote.baseRate + quote.fuelSurcharge + quote.loadingFees + quote.tollFees) * (quote.insurancePercentage / 100)).toLocaleString()}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50 border-t-2 border-emerald-500/20">
                    <td className="px-4 py-6 text-emerald-900 font-black text-lg">جمع کل استعلام (Nett Amount)</td>
                    <td className="px-4 py-6 text-left text-emerald-600 font-black text-2xl font-mono">
                      {quote.totalPrice.toLocaleString()} 
                      <span className="text-[10px] mr-2">ریال</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-8">
              <div className="border border-amber-100 bg-amber-50/30 rounded-xl p-6">
                <h4 className="text-[10px] font-black text-amber-600 uppercase mb-2 flex items-center gap-2">
                  <AlertCircle className="w-3 h-3" />
                  یادداشت‌ها و شرایط (Terms & Conditions)
                </h4>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  {quote.notes || "شرایط استاندارد حمل شرکت لجیشارپ برای این استعلام حاکم است. نرخ‌های فوق بر اساس اطلاعات ارائه شده توسط مشتری محاسبه شده و هرگونه تغییر در وزن یا ابعاد محموله، بر قیمت نهایی تاثیرگذار خواهد بود."}
                </p>
              </div>
              
              <div className="flex justify-between items-end mt-20 pt-10 border-t border-slate-100">
                <div className="text-center w-48">
                  <div className="text-[10px] text-slate-400 font-bold mb-10">مهر و امضای شرکت</div>
                  <div className="h-20 w-full border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-[10px] text-slate-300">STAMP AREA</div>
                </div>
                <div className="text-center w-48">
                  <div className="text-[10px] text-slate-400 font-bold mb-10">تایید مشتری</div>
                  <div className="h-1px w-full border-b border-slate-300"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
