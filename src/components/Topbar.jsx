import { Contrast, LogOut, Search } from 'lucide-react';
import { callLegacy } from '../legacyBridge.js';

// Floating top bar. #pageTitle / #pageSubtitle are filled in by render(), #currentUserBadge by
// showApp(), and the search box (#globalSearch / #globalSearchResults) is driven by
// public/legacy/05-navigation.js.
export default function Topbar() {
  return (
    <div className="topbar">
      <div className="topTitle">
        <h1 id="pageTitle">Dashboard</h1>
        <p className="pageSubtitle" id="pageSubtitle">Welcome back — here's today's snapshot</p>
      </div>
      <div className="topActions">
        <div className="globalSearch" role="search">
          <Search className="gsSearchIcon" size={16} aria-hidden="true" />
          <input
            id="globalSearch"
            type="search"
            placeholder="Search apps or employees…"
            autoComplete="off"
            aria-label="Search apps or employees"
          />
          <kbd className="gsKbd" aria-hidden="true">/</kbd>
          <div id="globalSearchResults" className="gsResults"></div>
        </div>
        <span id="currentUserBadge"></span>
        <button className="iconBtn iconOnly" onClick={() => callLegacy('toggleTheme')} title="Dark / Light" aria-label="Toggle dark or light mode">
          <Contrast size={17} aria-hidden="true" />
        </button>
        <button className="iconBtn logoutBtn" onClick={() => callLegacy('logout')}><LogOut size={16} aria-hidden="true" /> Logout</button>
      </div>
    </div>
  );
}
