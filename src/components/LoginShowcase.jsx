import { useEffect, useRef, useState } from 'react';

// The moving, reacting part of the login screen's left side: a small illustration of the app
// (an attendance card, a pay slip and a reports chart) and the three feature chips.
// It has its own state, so it re-renders on its own — LoginScreen itself never re-renders,
// because the legacy scripts take over its elements (see App.jsx).
//   - The cards float gently and lean towards the mouse.
//   - Pointing at a chip (Attendance / Payroll / Reports) lifts its card and plays its icon;
//     with no mouse over them, the highlight moves from one to the next on its own.
//   - The pay slip greets the username as it is typed, and shows "Secured" while the password
//     box is in use. A live clock and greeting run at the top.
// Everything here is illustration only (aria-hidden); the figures are samples, not real data.
// People who ask for reduced motion get the still version.

const FEATURES = [
  { key: 'att', title: 'Attendance', sub: 'Daily & monthly' },
  { key: 'pay', title: 'Payroll', sub: 'Slips in a click' },
  { key: 'rep', title: 'Reports', sub: 'PF, ESI & more' },
];
const NET_PAY = 20470;
const greetingFor = (h) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Icons with parts that move (stroke currentColor, like the rest of the app's icons).
function AttendanceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
      <path className="icCheck" d="M8.5 14.5l2.4 2.4 4.6-4.8" pathLength="1" />
    </svg>
  );
}
function PayrollIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <g className="icCoin">
        <circle cx="15.5" cy="5" r="3.2" />
        <path d="M14.3 3.9h2.4M14.3 5h2.4M15 3.9c1.1 0 1.1 2.2 0 2.2l1.4 1.3" strokeWidth="1.1" />
      </g>
      <path d="M4 9.5h14.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 18V8.5" />
      <path d="M3 8.5A2 2 0 0 1 5 6.5h5" />
      <path d="M16.5 15h1.5" />
    </svg>
  );
}
function ReportsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2.5H6.5A2.5 2.5 0 0 0 4 5v14a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 19V8.5z" />
      <path d="M14 2.5v6h6" />
      <path className="icBar b1" d="M8.5 18v-3" />
      <path className="icBar b2" d="M12 18v-5" />
      <path className="icBar b3" d="M15.5 18v-2" />
    </svg>
  );
}
const ICONS = { att: AttendanceIcon, pay: PayrollIcon, rep: ReportsIcon };

export default function LoginShowcase() {
  const [now, setNow] = useState(() => new Date());
  const [hover, setHover] = useState(null); // chip under the mouse
  const [auto, setAuto] = useState('att'); // chip highlighted on its own
  const [who, setWho] = useState('');
  const [secure, setSecure] = useState(false);
  const [pay, setPay] = useState(NET_PAY);
  const sceneRef = useRef(null);
  const active = hover || auto;

  // Live clock (paused while the login screen is hidden).
  useEffect(() => {
    const t = setInterval(() => {
      const s = document.getElementById('loginScreen');
      if (s && s.style.display === 'none') return;
      setNow(new Date());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // The highlight moves Attendance → Payroll → Reports while no chip is pointed at.
  useEffect(() => {
    if (hover || reducedMotion()) return undefined;
    const t = setInterval(() => setAuto((k) => (k === 'att' ? 'pay' : k === 'pay' ? 'rep' : 'att')), 4200);
    return () => clearInterval(t);
  }, [hover]);

  // Net pay counts up when the pay slip comes into focus.
  useEffect(() => {
    if (active !== 'pay' || reducedMotion()) return undefined;
    let raf;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 900);
      setPay(Math.round(NET_PAY * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // React to the sign-in boxes: greet the username, show "Secured" while the password is typed,
  // and shake the card when the sign-in is refused.
  useEffect(() => {
    const user = document.getElementById('loginUser');
    const pass = document.getElementById('loginPass');
    const err = document.getElementById('loginErr');
    const box = document.querySelector('#loginScreen .loginBox');
    const onUser = () => setWho((user && user.value.trim()) || '');
    const onPassFocus = () => setSecure(true);
    const onPassBlur = () => setSecure(!!(pass && pass.value));
    user && user.addEventListener('input', onUser);
    pass && pass.addEventListener('focus', onPassFocus);
    pass && pass.addEventListener('blur', onPassBlur);
    pass && pass.addEventListener('input', onPassFocus);
    let obs;
    if (err && box && 'MutationObserver' in window) {
      obs = new MutationObserver(() => {
        const msg = (err.textContent || '').trim();
        if (!msg || /signing in/i.test(msg)) return;
        box.classList.remove('loginShake');
        void box.offsetWidth; // restart the animation
        box.classList.add('loginShake');
      });
      obs.observe(err, { childList: true, characterData: true, subtree: true });
    }
    return () => {
      user && user.removeEventListener('input', onUser);
      pass && pass.removeEventListener('focus', onPassFocus);
      pass && pass.removeEventListener('blur', onPassBlur);
      pass && pass.removeEventListener('input', onPassFocus);
      obs && obs.disconnect();
    };
  }, []);

  // The cards lean towards the mouse (CSS variables only — no re-render).
  const onMove = (e) => {
    const el = sceneRef.current;
    if (!el || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const onLeave = () => {
    const el = sceneRef.current;
    if (el) { el.style.setProperty('--mx', 0); el.style.setProperty('--my', 0); }
  };

  const time = now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const day = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const month = now.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const week = ['M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="lsWrap" onMouseMove={onMove} onMouseLeave={onLeave} aria-hidden="true">
      <div className="lsLive">
        <span className="lsDot" />
        <b>{greetingFor(now.getHours())}</b>
        <span>{day} · {time}</span>
      </div>

      <div className={`lsScene on-${active}`} ref={sceneRef}>
        {/* Attendance */}
        <div className="lsCard lsAtt">
          <div className="lsCardHead"><span>Attendance</span><em>Today</em></div>
          <div className="lsAttBody">
            <div className="lsRing"><svg viewBox="0 0 36 36"><circle className="lsRingBg" cx="18" cy="18" r="15" /><circle className="lsRingFg" cx="18" cy="18" r="15" pathLength="100" /></svg><b>96%</b></div>
            <div>
              <div className="lsBig">142<small> / 148</small></div>
              <div className="lsMuted">present</div>
            </div>
          </div>
          <div className="lsWeek">
            {week.map((d, i) => (
              <span key={i} className="lsDay" style={{ '--i': i }}><i>{d}</i><svg viewBox="0 0 12 12"><path d="M2.5 6.2l2.2 2.2 4.8-4.8" pathLength="1" /></svg></span>
            ))}
          </div>
        </div>

        {/* Pay slip */}
        <div className="lsCard lsPay">
          <div className="lsCardHead"><span>Pay slip</span><em>{month}</em></div>
          <div className="lsHello">Hello, <b>{who || 'there'}</b>{secure ? <span className="lsSecure">● Secured</span> : null}</div>
          <div className="lsRows">
            <div><span>Basic</span><i style={{ '--w': '78%' }} /></div>
            <div><span>HRA</span><i style={{ '--w': '52%' }} /></div>
            <div><span>OT</span><i style={{ '--w': '30%' }} /></div>
          </div>
          <div className="lsNet"><span>Net pay</span><b>₹{pay.toLocaleString('en-IN')}</b></div>
        </div>

        {/* Reports */}
        <div className="lsCard lsRep">
          <div className="lsCardHead"><span>Reports</span><em>FY</em></div>
          <div className="lsBars">
            {[46, 70, 38, 88, 58, 76].map((h, i) => <i key={i} style={{ '--h': h + '%', '--i': i }} />)}
          </div>
          <div className="lsTags"><span>PF</span><span>ESI</span><span>Bonus</span></div>
        </div>
      </div>

      <ul className="loginFeatures lsChips">
        {FEATURES.map((f) => {
          const Icon = ICONS[f.key];
          return (
            <li key={f.key} className={`lsChip ${active === f.key ? 'on' : ''}`} onMouseEnter={() => setHover(f.key)} onMouseLeave={() => setHover(null)}>
              <span className={`lfIcon lfIcon-${f.key}`}><Icon /></span>
              <b>{f.title}</b>
              <small>{f.sub}</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
