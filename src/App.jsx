import LoginScreen from './components/LoginScreen.jsx';
import AppShell from './components/AppShell.jsx';
import ModalOverlay from './components/ModalOverlay.jsx';
import BulkImportDialog from './features/employee-import/BulkImportDialog.jsx';

// IMPORTANT: the shell (login, app shell, modal) never re-renders. After mount, the legacy
// scripts take over those elements imperatively (show/hide, text, classes, innerHTML), so do not
// add React state to them unless that part of the UI is migrated off the legacy code at the same
// time. Feature components with their own state (like BulkImportDialog) render their own DOM.
export default function App() {
  return (
    <>
      <LoginScreen />
      <AppShell />
      <ModalOverlay />
      <BulkImportDialog />
    </>
  );
}
