import {
  Ban, Bookmark, Building2, Cake, Calculator, Calendar, CalendarDays, CalendarRange, ChartColumn, Check,
  CircleArrowDown, CircleArrowUp, CircleCheck, CircleDashed, CircleX, Clock, ClipboardList, Contrast,
  Copy, CreditCard, Database, DoorOpen, Download, Factory, FileSpreadsheet, FileText, Folder, Gift,
  HeartPulse, History, KeyRound, Landmark, Leaf, LogIn, LogOut, Lock, Moon, OctagonMinus, PenLine, Percent, ShieldCheck,
  Pencil, Pin, Plus, Printer, Receipt, Save, Search, SearchX, Settings, ShieldX, Sun, Sunrise, Tag, Timer,
  TreePalm, TrendingUp, Trash2, TriangleAlert, Undo2, Upload, User, UserPlus, Users, Wallet, X, Zap,
} from 'lucide';

// Lucide icons for the legacy modules (public/legacy/), which build their pages as HTML strings.
// They call the global `ico('name')` while rendering and get an inline <svg> that inherits the
// text colour (so it follows the light/dark and colour themes). React components use
// `lucide-react` directly — same icon set.
const ICONS = {
  'ban': Ban, 'bookmark': Bookmark, 'building': Building2, 'cake': Cake, 'calculator': Calculator,
  'calendar': Calendar, 'calendar-days': CalendarDays, 'calendar-range': CalendarRange,
  'chart': ChartColumn, 'check': Check, 'circle-arrow-down': CircleArrowDown,
  'circle-arrow-up': CircleArrowUp, 'circle-check': CircleCheck, 'circle-dashed': CircleDashed,
  'circle-x': CircleX, 'clock': Clock, 'clipboard': ClipboardList, 'contrast': Contrast, 'copy': Copy,
  'credit-card': CreditCard, 'database': Database, 'door-open': DoorOpen, 'download': Download,
  'factory': Factory, 'file-spreadsheet': FileSpreadsheet, 'file-text': FileText, 'folder': Folder,
  'gift': Gift, 'heart-pulse': HeartPulse, 'history': History, 'key': KeyRound, 'landmark': Landmark,
  'leaf': Leaf, 'log-in': LogIn, 'log-out': LogOut, 'lock': Lock, 'moon': Moon,
  'octagon-minus': OctagonMinus, 'pen-line': PenLine, 'pencil': Pencil, 'pin': Pin, 'plus': Plus,
  'printer': Printer, 'receipt': Receipt, 'save': Save, 'search': Search, 'search-x': SearchX, 'settings': Settings,
  'shield-x': ShieldX, 'shield-check': ShieldCheck, 'percent': Percent, 'sun': Sun, 'sunrise': Sunrise, 'tag': Tag, 'timer': Timer, 'palm': TreePalm,
  'trending-up': TrendingUp, 'trash': Trash2, 'alert': TriangleAlert, 'undo': Undo2, 'upload': Upload,
  'user': User, 'user-plus': UserPlus, 'users': Users, 'wallet': Wallet, 'x': X, 'zap': Zap,
};

const attrs = (a) => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
const nodeHtml = ([tag, a, children]) =>
  `<${tag} ${attrs(a)}>${(children || []).map(nodeHtml).join('')}</${tag}>`;

const cache = {};
export function ico(name) {
  if (cache[name]) return cache[name];
  const node = ICONS[name];
  if (!node) { console.error(`Unknown icon "${name}".`); return ''; }
  return (cache[name] =
    `<svg class="ico" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true">${node.map(nodeHtml).join('')}</svg>`);
}

window.ico = ico;
