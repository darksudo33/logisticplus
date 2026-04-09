export type ShipmentMode = 'دریایی' | 'زمینی' | 'هوایی';
export type ShipmentType = 'واردات' | 'صادرات';
export type TaskStatus = 'انجام نشده' | 'در حال انجام' | 'انجام شد';

export interface Employee {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string;
  assignedTo?: string; // Employee ID
}

export interface StatusUpdate {
  id: string;
  type: string;
  timestamp: string; // ISO string for math
  jalaliDate: string; // For display
  note?: string;
  isInternal: boolean;
}

export interface Alert {
  id: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

export interface Shipment {
  id: string;
  jobNo: string;
  customerName: string;
  customerId: string;
  type: ShipmentType;
  mode: ShipmentMode;
  origin: string;
  destination: string;
  incoterm: string;
  etd: string; // Jalali string
  eta: string; // Jalali string
  ata?: string; // ISO string for countdown math
  freeDaysPort: number;
  tasks: Task[];
  timeline: StatusUpdate[];
  alerts: Alert[];
  token: string; // Public access token
}

export interface Customer {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  activeShipments: number;
}

export type AccountingType = 'چک' | 'هزینه' | 'درآمد';
export type AccountingStatus = 'پاس شده' | 'در جریان' | 'برگشتی' | 'پرداخت شده' | 'دریافت شده';

export interface AccountingEntry {
  id: string;
  date: string; // Jalali
  description: string;
  amount: number;
  type: AccountingType;
  status: AccountingStatus;
  category: string;
  referenceId?: string; // Shipment JobNo or Customer ID
  dueDate?: string; // For checks
}
