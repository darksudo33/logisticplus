import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shipment, Customer, Employee, AccountingEntry } from './types';
import { getStoredData, saveStoredData } from './lib/mockData';

// Pages
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Shipments from './pages/Shipments';
import ShipmentDetail from './pages/ShipmentDetail';
import Staff from './pages/Staff';
import Alerts from './pages/Alerts';
import Accounting from './pages/Accounting';
import PublicShipment from './pages/PublicShipment';
import Layout from './components/Layout';

interface AppState {
  shipments: Shipment[];
  customers: Customer[];
  employees: Employee[];
  accounting: AccountingEntry[];
  updateShipment: (shipment: Shipment) => void;
  updateCustomer: (customer: Customer) => void;
  addAccountingEntry: (entry: AccountingEntry) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  showToast: (message: string) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export default function App() {
  const [data, setData] = useState<{ shipments: Shipment[]; customers: Customer[]; employees: Employee[]; accounting: AccountingEntry[] }>(getStoredData());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    saveStoredData(data.shipments, data.customers, data.employees, data.accounting);
  }, [data]);

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const updateShipment = (updatedShipment: Shipment) => {
    setData(prev => ({
      ...prev,
      shipments: prev.shipments.map(s => s.id === updatedShipment.id ? updatedShipment : s)
    }));
  };

  const updateCustomer = (updatedCustomer: Customer) => {
    setData(prev => ({
      ...prev,
      customers: prev.customers.map(c => c.id === updatedCustomer.id ? updatedCustomer : c)
    }));
  };

  const addAccountingEntry = (entry: AccountingEntry) => {
    setData(prev => ({
      ...prev,
      accounting: [entry, ...prev.accounting]
    }));
  };

  return (
    <AppContext.Provider value={{ ...data, updateShipment, updateCustomer, addAccountingEntry, darkMode, toggleDarkMode, showToast }}>
      <BrowserRouter>
        <div className={darkMode ? 'dark' : ''}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="shipments" element={<Shipments />} />
              <Route path="shipments/:id" element={<ShipmentDetail />} />
              <Route path="staff" element={<Staff />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="accounting" element={<Accounting />} />
            </Route>
            <Route path="/p/:token" element={<PublicShipment />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        {/* Global Toast Notification */}
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-500 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
          <div className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 border border-white/10">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            {toast}
          </div>
        </div>
      </BrowserRouter>
    </AppContext.Provider>
  );
}
