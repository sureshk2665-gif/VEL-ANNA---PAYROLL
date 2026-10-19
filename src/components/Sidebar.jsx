import { APP_NAME } from '../config/brand.js';
import { NAV_ITEMS } from '../config/navigation.js';

// Click handling, the active highlight and per-user visibility of `.nav-item` elements are
// managed by the legacy navigation code (public/legacy/05-navigation.js) via data-page.
export default function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebarBrand">
        <div className="logoBadge small" style={{ display: 'none' }}>
          <img alt="Company Logo" />
        </div>
        <h2>{APP_NAME}</h2>
      </div>
      <div className="sub">Payroll Console</div>
      {NAV_ITEMS.map((item) =>
        item.section ? (
          <div className="navSection" key={'s-' + item.section}>{item.section}</div>
        ) : (
          <div className="nav-item" data-page={item.page} key={item.page}>
            <span className="navIcon"><item.icon size={18} strokeWidth={1.9} aria-hidden="true" /></span>
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
