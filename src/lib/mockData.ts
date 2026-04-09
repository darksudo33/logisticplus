import { Shipment, Customer, Employee, AccountingEntry } from '../types';

export const INITIAL_EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'امیرحسین محمدی', role: 'مدیر عملیات', avatar: 'https://picsum.photos/seed/e1/100/100' },
  { id: 'e2', name: 'سارا رضایی', role: 'کارشناس اسناد', avatar: 'https://picsum.photos/seed/e2/100/100' },
  { id: 'e3', name: 'علیرضا کریمی', role: 'کارشناس ترخیص', avatar: 'https://picsum.photos/seed/e3/100/100' },
  { id: 'e4', name: 'مریم حسینی', role: 'هماهنگ‌کننده حمل', avatar: 'https://picsum.photos/seed/e4/100/100' },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'بازرگانی البرز',
    contactPerson: 'آقای محمدی',
    phone: '۰۹۱۲۳۴۵۶۷۸۹',
    email: 'alborz@example.com',
    activeShipments: 2,
  },
  {
    id: 'c2',
    name: 'صنایع فولاد خلیج فارس',
    contactPerson: 'خانم رضایی',
    phone: '۰۹۹۸۷۶۵۴۳۲۱',
    email: 'steel@example.com',
    activeShipments: 1,
  },
];

export const INITIAL_SHIPMENTS: Shipment[] = [
  {
    id: 's1',
    jobNo: 'EXP-405-001',
    customerName: 'بازرگانی البرز',
    customerId: 'c1',
    type: 'صادرات',
    mode: 'دریایی',
    origin: 'بندرعباس',
    destination: 'جبل علی',
    incoterm: 'FOB',
    etd: '۱۴۰۵/۰۱/۱۵',
    eta: '۱۴۰۵/۰۱/۲۰',
    ata: '2026-04-05T10:00:00Z',
    freeDaysPort: 10,
    tasks: [
      { id: 't1-1', title: 'دریافت پیش‌فاکتور', status: 'انجام شد', assignedTo: 'e2' },
      { id: 't1-2', title: 'درخواست رزرو', status: 'انجام شد', assignedTo: 'e4' },
      { id: 't1-3', title: 'تاییدیه رزرو', status: 'انجام شد', assignedTo: 'e4' },
      { id: 't1-4', title: 'تحویل کانتینر خالی', status: 'انجام شد', assignedTo: 'e4' },
      { id: 't1-5', title: 'بارگیری در مبدا', status: 'انجام شد', assignedTo: 'e4' },
      { id: 't1-6', title: 'ترخیص صادراتی', status: 'در حال انجام', assignedTo: 'e3' },
      { id: 't1-7', title: 'ورود به بندر مبدا', status: 'انجام نشده', assignedTo: 'e4' },
      { id: 't1-8', title: 'حرکت کشتی', status: 'انجام نشده', assignedTo: 'e4' },
      { id: 't1-9', title: 'تایید پیش‌نویس بارنامه', status: 'انجام نشده', assignedTo: 'e2' },
      { id: 't1-10', title: 'صدور بارنامه نهایی', status: 'انجام نشده', assignedTo: 'e2' },
    ],
    timeline: [
      { id: 'u1', type: 'ثبت سفارش', timestamp: '2026-04-01T08:00:00Z', jalaliDate: '۱۴۰۵/۰۱/۱۲', isInternal: false },
      { id: 'u2', type: 'رزرو انجام شد', timestamp: '2026-04-03T14:00:00Z', jalaliDate: '۱۴۰۵/۰۱/۱۴', isInternal: false },
      { id: 'u3', type: 'بارگیری در مبدا', timestamp: '2026-04-05T09:00:00Z', jalaliDate: '۱۴۰۵/۰۱/۱۶', isInternal: false },
    ],
    alerts: [
      { id: 'a1', message: 'مدارک گمرکی ناقص است', severity: 'error' },
      { id: 'a2', message: 'تاییدیه مالی دریافت نشده', severity: 'warning' },
    ],
    token: 'token-abc-123',
  },
  {
    id: 's2',
    jobNo: 'IMP-405-042',
    customerName: 'صنایع فولاد خلیج فارس',
    customerId: 'c2',
    type: 'واردات',
    mode: 'دریایی',
    origin: 'شانگهای',
    destination: 'بندرعباس',
    incoterm: 'CIF',
    etd: '۱۴۰۵/۰۱/۰۵',
    eta: '۱۴۰۵/۰۱/۲۵',
    ata: '2026-04-01T12:00:00Z',
    freeDaysPort: 7,
    tasks: [
      { id: 't2-1', title: 'دریافت اسناد حمل', status: 'انجام شد' },
      { id: 't2-2', title: 'بررسی مانیفست', status: 'انجام شد' },
      { id: 't2-3', title: 'ورود به بندر مقصد', status: 'انجام شد' },
      { id: 't2-4', title: 'تخلیه از کشتی', status: 'انجام شد' },
      { id: 't2-5', title: 'دریافت ترخیصیه', status: 'در حال انجام' },
      { id: 't2-6', title: 'دریافت قبض انبار', status: 'انجام نشده' },
      { id: 't2-7', title: 'ترخیص وارداتی', status: 'انجام نشده' },
      { id: 't2-8', title: 'پرداخت هزینه‌های بندری', status: 'انجام نشده' },
      { id: 't2-9', title: 'بارگیری از گمرک', status: 'انجام نشده' },
      { id: 't2-10', title: 'تحویل به مشتری', status: 'انجام نشده' },
    ],
    timeline: [
      { id: 'u4', type: 'حرکت کشتی', timestamp: '2026-04-05T10:00:00Z', jalaliDate: '۱۴۰۵/۰۱/۱۶', isInternal: false },
    ],
    alerts: [],
    token: 'token-def-456',
  },
  {
    id: 's3',
    jobNo: 'TRK-405-012',
    customerName: 'بازرگانی البرز',
    customerId: 'c1',
    type: 'واردات',
    mode: 'زمینی',
    origin: 'استانبول',
    destination: 'تهران',
    incoterm: 'CPT',
    etd: '۱۴۰۵/۰۱/۱۸',
    eta: '۱۴۰۵/۰۱/۲۸',
    freeDaysPort: 0,
    tasks: [
      { id: 't3-1', title: 'هماهنگی کامیون', status: 'انجام شد' },
      { id: 't3-2', title: 'بارگیری در مبدا', status: 'انجام شد' },
      { id: 't3-3', title: 'ترخیص صادراتی', status: 'انجام شد' },
      { id: 't3-4', title: 'خروج از مرز مبدا', status: 'در حال انجام' },
      { id: 't3-5', title: 'ورود به مرز مقصد', status: 'انجام نشده' },
      { id: 't3-6', title: 'صدور راهنامه', status: 'در حال انجام' },
      { id: 't3-7', title: 'ورود به گمرک مقصد', status: 'انجام نشده' },
      { id: 't3-8', title: 'ترخیص وارداتی', status: 'انجام نشده' },
      { id: 't3-9', title: 'تحویل به مشتری', status: 'انجام نشده' },
    ],
    timeline: [
      { id: 'u5', type: 'بارگیری شد', timestamp: '2026-04-08T16:00:00Z', jalaliDate: '۱۴۰۵/۰۱/۱۹', isInternal: false },
    ],
    alerts: [
      { id: 'a3', message: 'تاخیر در مرز بازرگان', severity: 'warning' },
    ],
    token: 'token-ghi-789',
  },
  {
    id: 's4',
    jobNo: 'AIR-405-009',
    customerName: 'صنایع فولاد خلیج فارس',
    customerId: 'c2',
    type: 'واردات',
    mode: 'هوایی',
    origin: 'فرانکفورت',
    destination: 'تهران (IKA)',
    incoterm: 'FCA',
    etd: '۱۴۰۵/۰۱/۲۰',
    eta: '۱۴۰۵/۰۱/۲۱',
    ata: '2026-04-09T08:00:00Z',
    freeDaysPort: 3,
    tasks: [
      { id: 't4-1', title: 'رزرو پرواز', status: 'انجام شد' },
      { id: 't4-2', title: 'بارگیری و ارسال به فرودگاه', status: 'انجام شد' },
      { id: 't4-3', title: 'ترخیص صادراتی', status: 'انجام شد' },
      { id: 't4-4', title: 'پرواز از مبدا', status: 'انجام شد' },
      { id: 't4-5', title: 'نشست پرواز در مقصد', status: 'انجام شد' },
      { id: 't4-6', title: 'دریافت قبض انبار', status: 'انجام نشده' },
      { id: 't4-7', title: 'ترخیص وارداتی', status: 'انجام نشده' },
      { id: 't4-8', title: 'تحویل به مشتری', status: 'انجام نشده' },
    ],
    timeline: [
      { id: 'u6', type: 'پرواز نشست', timestamp: '2026-04-09T08:00:00Z', jalaliDate: '۱۴۰۵/۰۱/۲۰', isInternal: false },
    ],
    alerts: [],
    token: 'token-jkl-012',
  },
  {
    id: 's5',
    jobNo: 'EXP-405-088',
    customerName: 'بازرگانی البرز',
    customerId: 'c1',
    type: 'صادرات',
    mode: 'دریایی',
    origin: 'بندرعباس',
    destination: 'شانگهای',
    incoterm: 'CFR',
    etd: '۱۴۰۵/۰۱/۰۲',
    eta: '۱۴۰۵/۰۱/۲۸',
    ata: '2026-03-30T10:00:00Z',
    freeDaysPort: 10,
    tasks: [
      { id: 't5-1', title: 'درخواست رزرو', status: 'انجام شد' },
      { id: 't5-2', title: 'تاییدیه رزرو', status: 'انجام شد' },
      { id: 't5-3', title: 'بارگیری کانتینر', status: 'انجام شد' },
      { id: 't5-4', title: 'ارسال مانیفست', status: 'انجام شد' },
      { id: 't5-5', title: 'ترخیص صادراتی', status: 'انجام شد' },
      { id: 't5-6', title: 'حرکت کشتی', status: 'انجام شد' },
      { id: 't5-7', title: 'صدور بارنامه', status: 'انجام شد' },
      { id: 't5-8', title: 'ورود به مقصد', status: 'در حال انجام' },
    ],
    timeline: [
      { id: 'u7', type: 'کشتی حرکت کرد', timestamp: '2026-04-02T12:00:00Z', jalaliDate: '۱۴۰۵/۰۱/۱۳', isInternal: false },
    ],
    alerts: [
      { id: 'a4', message: 'مهلت فری‌تایم رو به اتمام است', severity: 'error' },
    ],
    token: 'token-mno-345',
  },
  {
    id: 's6',
    jobNo: 'TRK-405-055',
    customerName: 'صنایع فولاد خلیج فارس',
    customerId: 'c2',
    type: 'واردات',
    mode: 'زمینی',
    origin: 'دبی',
    destination: 'اصفهان',
    incoterm: 'EXW',
    etd: '۱۴۰۵/۰۱/۱۵',
    eta: '۱۴۰۵/۰۱/۱۸',
    ata: '2026-04-08T14:00:00Z',
    freeDaysPort: 5,
    tasks: [
      { id: 't6-1', title: 'هماهنگی کامیون', status: 'انجام شد' },
      { id: 't6-2', title: 'بارگیری در مبدا', status: 'انجام شد' },
      { id: 't6-3', title: 'خروج از مرز', status: 'انجام شد' },
      { id: 't6-4', title: 'ورود به گمرک مقصد', status: 'انجام شد' },
      { id: 't6-5', title: 'هماهنگی ترخیص', status: 'در حال انجام' },
      { id: 't6-6', title: 'ترخیص وارداتی', status: 'انجام نشده' },
      { id: 't6-7', title: 'تحویل نهایی', status: 'انجام نشده' },
    ],
    timeline: [
      { id: 'u8', type: 'ورود به گمرک مقصد', timestamp: '2026-04-08T14:00:00Z', jalaliDate: '۱۴۰۵/۰۱/۱۹', isInternal: false },
    ],
    alerts: [],
    token: 'token-pqr-678',
  },
];

export const INITIAL_ACCOUNTING: AccountingEntry[] = [
  {
    id: 'a1',
    date: '۱۴۰۵/۰۱/۰۵',
    description: 'کارمزد نمایندگی - پرونده EXP-405-001',
    amount: 15000000,
    type: 'درآمد',
    status: 'دریافت شده',
    category: 'کارمزد',
    referenceId: 'EXP-405-001'
  },
  {
    id: 'a2',
    date: '۱۴۰۵/۰۱/۱۰',
    description: 'هزینه انبارداری - بازرگانی البرز',
    amount: 8500000,
    type: 'هزینه',
    status: 'پرداخت شده',
    category: 'انبارداری',
    referenceId: 'c1'
  },
  {
    id: 'a3',
    date: '۱۴۰۵/۰۱/۱۲',
    description: 'چک دریافتی بابت کرایه حمل - IMP-405-042',
    amount: 450000000,
    type: 'چک',
    status: 'در جریان',
    category: 'کرایه حمل',
    referenceId: 'IMP-405-042',
    dueDate: '۱۴۰۵/۰۳/۱۵'
  },
  {
    id: 'a4',
    date: '۱۴۰۵/۰۱/۱۵',
    description: 'هزینه دموراژ کانتینر - EXP-405-088',
    amount: 12000000,
    type: 'هزینه',
    status: 'پرداخت شده',
    category: 'دموراژ',
    referenceId: 'EXP-405-088'
  },
  {
    id: 'a5',
    date: '۱۴۰۵/۰۱/۱۸',
    description: 'چک پرداختی به خط کشتیرانی',
    amount: 1200000000,
    type: 'چک',
    status: 'در جریان',
    category: 'کرایه حمل',
    dueDate: '۱۴۰۵/۰۲/۲۰'
  }
];

export const getStoredData = () => {
  const storedShipmentsRaw = localStorage.getItem('shipments');
  const storedCustomersRaw = localStorage.getItem('customers');
  const storedEmployeesRaw = localStorage.getItem('employees');
  const storedAccountingRaw = localStorage.getItem('accounting');
  
  let shipments = storedShipmentsRaw ? JSON.parse(storedShipmentsRaw) : INITIAL_SHIPMENTS;
  let customers = storedCustomersRaw ? JSON.parse(storedCustomersRaw) : INITIAL_CUSTOMERS;
  let employees = storedEmployeesRaw ? JSON.parse(storedEmployeesRaw) : INITIAL_EMPLOYEES;
  let accounting = storedAccountingRaw ? JSON.parse(storedAccountingRaw) : INITIAL_ACCOUNTING;

  // Sync logic: If a shipment exists in INITIAL_SHIPMENTS, ensure it has the latest task list
  // This allows us to push "every single logistic step" to existing demos.
  if (storedShipmentsRaw) {
    shipments = shipments.map((s: Shipment) => {
      const initial = INITIAL_SHIPMENTS.find(is => is.id === s.id);
      if (initial) {
        // If the number of tasks is different, or if we want to force update
        // We merge: keep status of tasks that match by title, add new ones
        const updatedTasks = initial.tasks.map(it => {
          const existing = s.tasks.find(et => et.title === it.title);
          return existing ? { ...it, status: existing.status, assignedTo: existing.assignedTo || it.assignedTo } : it;
        });
        return { ...s, tasks: updatedTasks };
      }
      return s;
    });

    // Also add any entirely new shipments
    const storedIds = new Set(shipments.map((s: Shipment) => s.id));
    const newShipments = INITIAL_SHIPMENTS.filter(s => !storedIds.has(s.id));
    if (newShipments.length > 0) {
      shipments = [...shipments, ...newShipments];
    }
  }

  return { shipments, customers, employees, accounting };
};

export const saveStoredData = (shipments: Shipment[], customers: Customer[], employees: Employee[], accounting: AccountingEntry[]) => {
  localStorage.setItem('shipments', JSON.stringify(shipments));
  localStorage.setItem('customers', JSON.stringify(customers));
  localStorage.setItem('employees', JSON.stringify(employees));
  localStorage.setItem('accounting', JSON.stringify(accounting));
};

export const resetStoredData = () => {
  localStorage.removeItem('shipments');
  localStorage.removeItem('customers');
  localStorage.removeItem('employees');
  localStorage.removeItem('accounting');
  window.location.reload();
};
