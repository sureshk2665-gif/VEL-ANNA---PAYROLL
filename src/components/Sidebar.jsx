import { APP_NAME, LOGO_SRC } from '../config/brand.js';
import { NAV_ITEMS } from '../config/navigation.js';

// Click handling, the active highlight and per-user visibility of `.nav-item` elements are
// managed by the legacy navigation code (public/legacy/05-navigation.js) via data-page.
export default function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebarBrand">
        <div className="logoBadge small">
          <img src={LOGO_SRC} alt="VIPL Logo" />
        </div>
        <h2>{APP_NAME}</h2>
      </div>
      <div className="sub">Payroll Console</div>
      {NAV_ITEMS.map((item) =>
        item.section ? (
          <div className="navSection" key={'s-' + item.section}>{item.section}</div>
        ) : (
          <div className="nav-item" data-page={item.page} key={item.page}>
            <span className="navIcon">{item.icon}</span>
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
