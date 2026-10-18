import { Contrast, LogOut, Palette } from 'lucide-react';
import { COLOR_THEMES } from '../config/themes.js';
import { callLegacy } from '../legacyBridge.js';

// #pageTitle / #pageSubtitle are filled in by render() and #currentUserBadge by showApp();
// the saved theme is applied to #themePicker by the legacy theme code.
export default function Topbar() {
  return (
    <div className="topbar">
      <div>
        <h1 id="pageTitle">Dashboard</h1>
        <p className="pageSubtitle" id="pageSubtitle">Welcome back — here's today's snapshot</p>
      </div>
      <div className="topActions">
        <label className="themePickerWrap">
          <Palette className="themePickerIcon" size={16} aria-hidden="true" />
          <select
            className="themeSelect"
            id="themePicker"
            defaultValue="teal"
            onChange={(e) => callLegacy('setColorTheme', e.target.value)}
            title="Colour theme"
          >
            {COLOR_THEMES.map((t) => (
              <option value={t.value} key={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <span id="currentUserBadge"></span>
        <button className="iconBtn" onClick={() => callLegacy('toggleTheme')}><Contrast size={16} aria-hidden="true" /> Dark/Light</button>
        <button className="iconBtn" onClick={() => callLegacy('logout')}><LogOut size={16} aria-hidden="true" /> Logout</button>
      </div>
    </div>
  );
}
