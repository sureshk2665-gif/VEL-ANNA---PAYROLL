// Sidebar menu. `page` must match the keys handled by render() in public/legacy/05-navigation.js
// and the module keys in PERMISSION_MODULES (public/legacy/02-permissions.js).
export const NAV_ITEMS = [
  { page: 'dashboard', icon: '📊', label: 'Dashboard' },
  { section: 'Workforce' },
  { page: 'employees', icon: '👥', label: 'Employees' },
  { page: 'resigned', icon: '🚪', label: 'Resigned Employees' },
  { page: 'departments', icon: '🏷️', label: 'Departments' },
  { page: 'attendance', icon: '🗓️', label: 'Attendance' },
  { section: 'Time Tracking' },
  { page: 'timeentry', icon: '⏱️', label: 'Employee Time Entry' },
  { section: 'Payroll' },
  { page: 'payroll', icon: '💰', label: 'Payroll' },
  { page: 'payrollprocess', icon: '🧮', label: 'Payroll Process' },
  { page: 'increment', icon: '📈', label: 'Annual Increment' },
  { page: 'salaryadvance', icon: '🏦', label: 'Salary Advance' },
  { page: 'reports', icon: '📁', label: 'Reports' },
  { section: 'System' },
  { page: 'settings', icon: '⚙️', label: 'Admin' },
  { page: 'softwareadmin', icon: '🛡️', label: 'Software Admin' },
];
