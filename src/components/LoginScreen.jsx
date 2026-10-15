import { APP_NAME, LOGO_SRC } from '../config/brand.js';
import { callLegacy } from '../legacyBridge.js';

// Username + Password sign-in, checked by Supabase Auth. The Enter-key handlers, status messages
// and show/hide are handled by the legacy auth code (public/legacy/04-auth-theme.js) using the
// element ids below — keep them unchanged.
export default function LoginScreen() {
  return (
    <div id="loginScreen">
      <div className="loginBox">
        <div className="logoBadge">
          <img src={LOGO_SRC} alt="VIPL Logo" id="loginLogo" />
        </div>
        <h1 className="loginTitle">{APP_NAME}</h1>

        <div id="loginStepCreds">
          <p className="loginTagline">Sign in to continue</p>
          <input id="loginUser" placeholder="Username" autoComplete="username" />
          <input id="loginPass" type="password" placeholder="Password" autoComplete="current-password" />
          <div className="loginErr" id="loginErr"></div>
          <button onClick={() => callLegacy('attemptLogin')}>Login</button>
        </div>
      </div>
    </div>
  );
}
