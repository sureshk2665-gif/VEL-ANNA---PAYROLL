import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from './App.jsx';
import './styles/index.css';

// Render synchronously: the legacy scripts in index.html are `defer`red and run right after this
// module, and they look up the shell elements (nav items, #overlay, login inputs) immediately.
const root = createRoot(document.getElementById('root'));
flushSync(() => root.render(<App />));
