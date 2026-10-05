import LoginScreen from './components/LoginScreen.jsx';
import AppShell from './components/AppShell.jsx';
import ModalOverlay from './components/ModalOverlay.jsx';

// IMPORTANT: this tree is rendered exactly once and never re-renders. After mount, the legacy
// scripts take over these elements imperatively (show/hide, text, classes, innerHTML), so do not
// add React state here unless that part of the UI is migrated off the legacy code at the same time.
export default function App() {
  return (
    <>
      <LoginScreen />
      <AppShell />
      <ModalOverlay />
    </>
  );
}
