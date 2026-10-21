import {
  Calculator, CalendarDays, DoorOpen, Folder, Landmark, LayoutDashboard, Receipt, Settings, ShieldCheck,
  Tag, Timer, Users, Wallet,
} from 'lucide-react';

// Sidebar menu. `page` must match the keys handled by render() in public/legacy/05-navigation.js
// and the module keys in PERMISSION_MODULES (public/legacy/02-permissions.js).
export const NAV_ITEMS = [
  { page: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { section: 'Workforce' },
  { page: 'employees', icon: Users, label: 'Employees' },
  { page: 'resigned', icon: DoorOpen, label: 'Resigned Employees' },
  { page: 'departments', icon: Tag, label: 'Departments' },
  { page: 'attendance', icon: CalendarDays, label: 'Attendance' },
  { section: 'Time Tracking' },
  { page: 'timeentry', icon: Timer, label: 'Employee Time Entry' },
  { section: 'Payroll' },
  { page: 'payroll', icon: Wallet, label: 'Payroll' },
  { page: 'payrollprocess', icon: Calculator, label: 'Payroll Process' },
  { page: 'salaryadvance', icon: Landmark, label: 'Salary Advance' },
  { page: 'contractorbill', icon: Receipt, label: 'Contractors Bill' },
  { page: 'reports', icon: Folder, label: 'Reports' },
  { section: 'System' },
  { page: 'settings', icon: Settings, label: 'Admin' },
  { page: 'softwareadmin', icon: ShieldCheck, label: 'Software Admin' },
];
