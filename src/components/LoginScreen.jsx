import { ArrowRight, CalendarCheck, Eye, EyeOff, FileText, Lock, ShieldCheck, User, Wallet } from 'lucide-react';
import { APP_NAME } from '../config/brand.js';
import { callLegacy } from '../legacyBridge.js';

// Username + Password sign-in, checked by Supabase Auth. The Enter-key handlers and status
// messages are handled by the legacy auth code (public/legacy/04-auth-theme.js) using the element
// ids below — keep them unchanged. Company name/logo (.loginTitle, #loginLogo, .brandName,
// img.brandLogo) are filled in by applyCompanyBranding() in 03-company-logo-status.js.
const togglePassword = (btn) => {
  const input = document.getElementById('loginPass');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.setAttribute('aria-pressed', String(show));
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  input.focus();
};

const FEATURES = [
  { icon: CalendarCheck, title: 'Attendance', sub: 'Daily & monthly' },
  { icon: Wallet, title: 'Payroll', sub: 'Slips in a click' },
  { icon: FileText, title: 'Reports', sub: 'PF, ESI & more' },
];

export default function LoginScreen() {
  return (
    <div id="loginScreen">
      <div className="loginLayout">
        <section className="loginIntro" aria-hidden="true">
          <div className="loginBrand">
            <div className="logoBadge loginBrandLogo" style={{ display: 'none' }}>
              <img className="brandLogo" alt="" />
            </div>
            <span className="brandName">{APP_NAME}</span>
          </div>
          <h2 className="loginHeadline">Payroll,<br />made simple<br />and accurate.</h2>
          <p className="loginLead">Attendance, salaries and statutory reports — for every unit and contractor, in one place.</p>
          <span className="loginRule"></span>
          <ul className="loginFeatures">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="lfIcon"><f.icon size={20} strokeWidth={1.8} /></span>
                <b>{f.title}</b>
                <small>{f.sub}</small>
              </li>
            ))}
          </ul>
        </section>

        <div className="loginBox">
          <div className="logoBadge" style={{ display: 'none' }}>
            <img alt="Company Logo" id="loginLogo" />
          </div>
          <h1 className="loginTitle">{APP_NAME}</h1>

          <div id="loginStepCreds">
            <p className="loginTagline">Payroll Portal — sign in to continue</p>
            <label className="loginLabel" htmlFor="loginUser">Username</label>
            <div className="loginField">
              <User className="lfLead" size={18} aria-hidden="true" />
              <input id="loginUser" placeholder="Enter your username" autoComplete="username" />
            </div>
            <label className="loginLabel" htmlFor="loginPass">Password</label>
            <div className="loginField">
              <Lock className="lfLead" size={18} aria-hidden="true" />
              <input id="loginPass" type="password" placeholder="Enter your password" autoComplete="current-password" />
              <button
                type="button"
                className="pwToggle"
                aria-label="Show password"
                aria-pressed="false"
                onClick={(e) => togglePassword(e.currentTarget)}
              >
                <Eye className="pwShow" size={18} aria-hidden="true" />
                <EyeOff className="pwHide" size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="loginErr" id="loginErr"></div>
            <button type="button" className="loginSubmit" onClick={() => callLegacy('attemptLogin')}>
              Sign In <ArrowRight size={18} aria-hidden="true" />
            </button>
            <div className="loginNote">
              <ShieldCheck size={20} aria-hidden="true" />
              <span>Accounts are created by your Software Admin. Forgot your password? Ask them to reset it.</span>
            </div>
          </div>
        </div>

        <section className="loginArt" aria-hidden="true">
          <div className="artWords"><span>ATTENDANCE</span><span>PAYROLL</span><span>REPORTS</span></div>
          <svg className="artShapes" viewBox="0 0 400 520">
            <path d="M200 20 L380 200 L200 380 L20 200 Z" className="s1" />
            <path d="M260 160 L380 280 L260 400 L140 280 Z" className="s2" />
            <circle cx="120" cy="420" r="70" className="s3" />
            <path d="M300 360 q60 40 60 110 q-70 0 -110 -60 q30 -20 50 -50 Z" className="s4" />
          </svg>
          <div className="artFoot"><span className="loginRule"></span>ON TIME<br />EVERY TIME<br />FOR EVERYONE</div>
        </section>
      </div>
      <footer className="loginFooter">
        © {new Date().getFullYear()} <span className="brandName">{APP_NAME}</span>. All rights reserved.
      </footer>
    </div>
  );
}
