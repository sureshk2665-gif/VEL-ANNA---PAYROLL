import { APP_NAME, LOGO_SRC } from '../config/brand.js';
import { callLegacy } from '../legacyBridge.js';

// Two-step sign-in: Username + Password, then a 4-digit code. The steps are switched, and the
// Enter-key handlers wired, by the legacy auth code (public/legacy/04-auth-theme.js) using the
// element ids below — keep them unchanged.
const linkClick = (fnName) => (e) => {
  e.preventDefault();
  callLegacy(fnName);
};

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

        {/* Step 2: 4-digit passcode/OTP verification — shown only after Username + Password have
            already been checked and matched; the dashboard is never reachable until the correct
            4-digit code is also entered here (see attemptLogin() / attemptOtpVerify()). This app
            has no SMS/Email gateway configured, so the generated code is shown directly in this
            panel rather than silently failing to deliver a code the person could never otherwise
            receive. The inline display:none is toggled by the legacy code — keep it inline. */}
        <div id="loginStepOtp" style={{ display: 'none' }}>
          <p className="otpIntro">
            A 4-digit code has been generated for <b id="otpForUser"></b>.
          </p>
          <input
            id="loginOtp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            placeholder="Enter 4-digit code"
          />
          <div id="otpDemoNote"></div>
          <div className="loginErr" id="otpErr"></div>
          <button onClick={() => callLegacy('attemptOtpVerify')}>Verify &amp; Continue</button>
          <div className="otpLinks">
            <a href="#" className="otpBack" onClick={linkClick('backToCredentialsStep')}>← Back</a>
            <a href="#" className="otpResend" onClick={linkClick('resendOtp')}>Resend Code</a>
          </div>
        </div>
      </div>
    </div>
  );
}
