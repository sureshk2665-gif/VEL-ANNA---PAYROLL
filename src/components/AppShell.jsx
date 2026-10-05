import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

// Logged-in layout. Every module page is rendered into #pageBody by the legacy render()
// function; #mainPanel gets the `fullScreenPage` class toggled for Attendance.
export default function AppShell() {
  return (
    <div id="app">
      <div className="shell">
        <Sidebar />
        <div className="main" id="mainPanel">
          <Topbar />
          <div id="pageBody"></div>
        </div>
      </div>
    </div>
  );
}
