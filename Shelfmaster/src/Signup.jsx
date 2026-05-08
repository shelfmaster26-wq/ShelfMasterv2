import React, { useState } from 'react';
import { localDb } from './localDbClient';
import { useNavigate, Link } from 'react-router-dom';
import myLogo from './assets/logo.png';
import Toast from './Toast';
import { useResponsive } from './useResponsive';
import { FaCheck } from 'react-icons/fa';

// ── Constants ────────────────────────────────────────────────────────────────
const LRN_PATTERN = /^\d{12}$/;
const NAME_MIN = 2;
const NAME_MAX = 40;

const GRADE_OPTIONS = ['Grade 11', 'Grade 12'];
const STEPS = ['Account', 'Personal', 'Details', 'Education'];

// ── SVG Icons ────────────────────────────────────────────────────────────────
const icons = {
  user: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  briefcase: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  ),
  lock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  mail: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  id: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="14" y2="14"/>
    </svg>
  ),
  book: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  tag: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  phone: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91A16 16 0 0 0 15 16.91l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  chevronDown: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  layers: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
    </svg>
  ),
};

// ── Helper: assemble full name from parts ────────────────────────────────────
const buildFullName = (firstName, middleInitial, lastName) => {
  const mi = middleInitial.trim().toUpperCase();
  const parts = [firstName.trim()];
  if (mi) parts.push(`${mi.charAt(0)}.`);
  parts.push(lastName.trim());
  return parts.join(' ');
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function Signup() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('student');

  const [studentData, setStudentData] = useState({
    email: '', password: '',
    firstName: '', lastName: '', middleInitial: '',
    lrn: '', grade: '', section: '',
  });

  const [teacherData, setTeacherData] = useState({
    email: '', password: '',
    firstName: '', lastName: '', middleInitial: '',
    employeeId: '', position: '', gradeSection: '', contact: '',
  });

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const navigate = useNavigate();
  const { isMobile } = useResponsive();
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  const sanitize = (str) => str.replace(/<[^>]*>/g, '').trim();

  // ── Step validation ──────────────────────────────────────────────────────────
  const validateStep = () => {
    if (role === 'student') {
      const d = studentData;
      if (step === 1) {
        if (!d.email) { showToast('Email is required.', 'warning'); return false; }
        if (d.password.length < 6) { showToast('Password must be at least 6 characters.', 'warning'); return false; }
      }
      if (step === 2) {
        const first = sanitize(d.firstName);
        const last = sanitize(d.lastName);
        if (first.length < NAME_MIN) { showToast(`First name must be at least ${NAME_MIN} characters.`, 'warning'); return false; }
        if (!/[a-zA-Z]/.test(first)) { showToast('First name must contain letters.', 'warning'); return false; }
        if (last.length < NAME_MIN) { showToast(`Last name must be at least ${NAME_MIN} characters.`, 'warning'); return false; }
        if (!/[a-zA-Z]/.test(last)) { showToast('Last name must contain letters.', 'warning'); return false; }
        // Middle initial is optional — validate only if provided
        const mi = sanitize(d.middleInitial);
        if (mi && !/^[a-zA-Z]$/.test(mi)) { showToast('Middle initial must be a single letter.', 'warning'); return false; }
      }
      if (step === 3) {
        if (!LRN_PATTERN.test(sanitize(d.lrn))) { showToast('LRN must be exactly 12 digits.', 'warning'); return false; }
      }
      if (step === 4) {
        if (!d.grade) { showToast('Please select a grade level.', 'warning'); return false; }
        if (!sanitize(d.section)) { showToast('Section / Strand is required.', 'warning'); return false; }
      }
    } else {
      const d = teacherData;
      if (step === 1) {
        if (!d.email) { showToast('Email is required.', 'warning'); return false; }
        if (d.password.length < 6) { showToast('Password must be at least 6 characters.', 'warning'); return false; }
      }
      if (step === 2) {
        const first = sanitize(d.firstName);
        const last = sanitize(d.lastName);
        if (first.length < NAME_MIN) { showToast(`First name must be at least ${NAME_MIN} characters.`, 'warning'); return false; }
        if (!/[a-zA-Z]/.test(first)) { showToast('First name must contain letters.', 'warning'); return false; }
        if (last.length < NAME_MIN) { showToast(`Last name must be at least ${NAME_MIN} characters.`, 'warning'); return false; }
        if (!/[a-zA-Z]/.test(last)) { showToast('Last name must contain letters.', 'warning'); return false; }
        const mi = sanitize(d.middleInitial);
        if (mi && !/^[a-zA-Z]$/.test(mi)) { showToast('Middle initial must be a single letter.', 'warning'); return false; }
      }
      if (step === 3) {
        if (!sanitize(d.employeeId)) { showToast('Employee ID is required.', 'warning'); return false; }
        if (!sanitize(d.contact)) { showToast('Contact info is required.', 'warning'); return false; }
      }
      if (step === 4) {
        if (!sanitize(d.position)) { showToast('Position / Designation is required.', 'warning'); return false; }
        if (!sanitize(d.gradeSection)) { showToast('Track / Strand is required.', 'warning'); return false; }
      }
    }
    return true;
  };

  const handleNext = () => { if (validateStep()) setStep(s => s + 1); };

  // ── Student signup ───────────────────────────────────────────────────────────
  const handleStudentSignup = async () => {
    const name    = buildFullName(studentData.firstName, studentData.middleInitial, studentData.lastName);
    const lrn     = sanitize(studentData.lrn);
    const grade   = sanitize(studentData.grade);
    const section = sanitize(studentData.section);
    const email   = sanitize(studentData.email).toLowerCase();
    const { password } = studentData;
    const combined = `${grade} - ${section}`;

    const { data: existingLrn } = await localDb.from('users').select('id').eq('lrn', lrn).maybeSingle();
    if (existingLrn) { showToast('This LRN is already registered. Contact your librarian.', 'error'); return false; }

    const signupResult = await localDb.auth.signUp({ email, password });
    if (signupResult.error) throw signupResult.error;
    const authUser = signupResult.data?.user;
    if (!authUser) throw new Error('Signup failed unexpectedly.');

    const { error: profileError } = await localDb.from('users').insert([{
      auth_id: authUser.id, name, student_id: lrn, lrn,
      grade_section: combined, course_year: combined,
      role: signupResult.isAdmin ? 'librarian' : 'student', status: 'active',
    }]);
    if (profileError) {
      if (profileError.code === '23505') throw new Error('This LRN is already registered.');
      throw profileError;
    }
    return signupResult;
  };

  // ── Teacher signup ───────────────────────────────────────────────────────────
  const handleTeacherSignup = async () => {
    const name         = buildFullName(teacherData.firstName, teacherData.middleInitial, teacherData.lastName);
    const employeeId   = sanitize(teacherData.employeeId);
    const position     = sanitize(teacherData.position);
    const gradeSection = sanitize(teacherData.gradeSection);
    const contact      = sanitize(teacherData.contact);
    const email        = sanitize(teacherData.email).toLowerCase();
    const { password } = teacherData;

    const { data: existingEmp } = await localDb.from('users').select('id').eq('student_id', employeeId).maybeSingle();
    if (existingEmp) { showToast('This Employee ID is already registered.', 'error'); return false; }

    const signupResult = await localDb.auth.signUp({ email, password });
    if (signupResult.error) throw signupResult.error;
    const authUser = signupResult.data?.user;
    if (!authUser) throw new Error('Signup failed unexpectedly.');

    const { error: profileError } = await localDb.from('users').insert([{
      auth_id: authUser.id, name, student_id: employeeId,
      grade_section: gradeSection, course_year: position, lrn: contact,
      role: signupResult.isAdmin ? 'librarian' : 'teacher', status: 'active',
    }]);
    if (profileError) {
      if (profileError.code === '23505') throw new Error('This Employee ID is already registered.');
      throw profileError;
    }
    return signupResult;
  };

  // ── Final submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    try {
      const result = role === 'student'
        ? await handleStudentSignup()
        : await handleTeacherSignup();
      if (!result) return;
      if (result.verified) {
        showToast('Account created! You can sign in now.', 'success');
      } else {
        showToast('Account created — check your email to confirm before signing in.', 'success');
        if (result.verifyUrl) console.log('[verify]', result.verifyUrl);
      }
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      showToast('Error: ' + (err.message || 'Could not create account.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSC = (e) => setStudentData({ ...studentData, [e.target.name]: e.target.value });
  const handleTC = (e) => setTeacherData({ ...teacherData, [e.target.name]: e.target.value });

  // ── Step content ─────────────────────────────────────────────────────────────
  const renderNameFields = (data, handler) => (
    <>
      <InputField icon={icons.user} label="First Name" name="firstName" type="text"
        placeholder="Juan" value={data.firstName} onChange={handler}
        required minLength={NAME_MIN} maxLength={NAME_MAX} />
      <InputField icon={icons.user} label="Last Name" name="lastName" type="text"
        placeholder="Dela Cruz" value={data.lastName} onChange={handler}
        required minLength={NAME_MIN} maxLength={NAME_MAX} />
      {/* Middle initial: narrow field */}
      <div style={s.fieldGroup}>
        <label style={s.label}>
          Middle Initial
          <span style={s.hint}> — optional</span>
        </label>
        <div style={s.inputWrap}>
          <span style={s.inputIcon}>{icons.user}</span>
          <input
            name="middleInitial"
            type="text"
            placeholder="e.g. B"
            value={data.middleInitial}
            onChange={(e) => {
              // Allow only a single alpha character
              const val = e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 1).toUpperCase();
              handler({ target: { name: 'middleInitial', value: val } });
            }}
            maxLength={1}
            style={{ ...s.input, maxWidth: 120 }}
            className="sm-input"
          />
        </div>
      </div>
    </>
  );

  const renderStep = () => {
    if (role === 'student') {
      if (step === 1) return (
        <>
          <InputField icon={icons.mail} label="Email Address" name="email" type="email"
            placeholder="email@example.com" value={studentData.email} onChange={handleSC} required />
          <InputField icon={icons.lock} label="Password" name="password" type="password"
            placeholder="Min. 6 characters" value={studentData.password} onChange={handleSC} required minLength={6} />
        </>
      );
      if (step === 2) return renderNameFields(studentData, handleSC);
      if (step === 3) return (
        <InputField icon={icons.id} label="LRN (12 Digits)" name="lrn" type="text"
          placeholder="123456789012" inputMode="numeric" maxLength={12}
          value={studentData.lrn} onChange={(e) => {
            const numericOnly = e.target.value.replace(/\D/g, '');
            setStudentData({ ...studentData, lrn: numericOnly });
          }} required />
      );
      if (step === 4) return (
        <>
          <div style={s.fieldGroup}>
            <label style={s.label}>Grade Level</label>
            <div style={s.selectWrap}>
              <span style={s.inputIcon}>{icons.book}</span>
              <select name="grade" value={studentData.grade} onChange={handleSC}
                required style={{ ...s.input, paddingLeft: 42, paddingRight: 40, appearance: 'none', cursor: 'pointer' }}
                className="sm-input">
                <option value="">Select Grade</option>
                {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <span style={s.selectChevron}>{icons.chevronDown}</span>
            </div>
          </div>
          <InputField icon={icons.tag} label="Section / Strand" name="section" type="text"
            placeholder="e.g. STEM or Rizal" value={studentData.section} onChange={handleSC}
            required maxLength={50} />
        </>
      );
    } else {
      if (step === 1) return (
        <>
          <InputField icon={icons.mail} label="Account Email" name="email" type="email"
            placeholder="email@example.com" value={teacherData.email} onChange={handleTC} required />
          <InputField icon={icons.lock} label="Password" name="password" type="password"
            placeholder="Min. 6 characters" value={teacherData.password} onChange={handleTC} required minLength={6} />
        </>
      );
      if (step === 2) return renderNameFields(teacherData, handleTC);
      if (step === 3) return (
        <>
          <InputField icon={icons.id} label="Employee ID" name="employeeId" type="text"
            placeholder="e.g. EMP-2024-001" value={teacherData.employeeId} onChange={handleTC}
            required maxLength={50} />
          <InputField icon={icons.phone} label="Contact Info" name="contact" type="text"
            placeholder="e.g. 09171234567 or teacher@school.edu"
            value={teacherData.contact} onChange={handleTC} required maxLength={100} />
        </>
      );
      if (step === 4) return (
        <>
          <InputField icon={icons.briefcase} label="Position / Designation" name="position" type="text"
            placeholder="e.g. Teacher I" value={teacherData.position} onChange={handleTC}
            required maxLength={80} />
          <InputField icon={icons.layers} label="Track / Strand" name="gradeSection" type="text"
            placeholder="e.g. STEM or Grade 9" value={teacherData.gradeSection} onChange={handleTC}
            required maxLength={50} />
        </>
      );
    }
  };

  const stepLabels = ['Account', 'Personal', 'Details', 'Education'];

  return (
    <div style={s.wrapper(isMobile)}>
      <style>{STYLES}</style>
      <Toast {...toast} onClose={() => setToast({ message: '' })} />

      {/* Left panel */}
      {!isMobile && (
        <div style={s.leftPanel}>
          <div style={s.patternOverlay} />
          <div style={s.leftContent}>
            <img src={myLogo} alt="Logo" style={{ width: 64, marginBottom: 28, borderRadius: 16 }} />
            <h1 style={s.leftHeading}>Join ShelfMaster</h1>
            <p style={s.leftSub}>Create your account and start exploring our library collection today.</p>
            <div style={s.featuresList}>
              {['Access thousands of titles', 'Real-time availability checks', 'Automated due-date reminders'].map((f, i) => (
                <div key={i} style={s.featureItem}>
                  <span style={s.check}>{<FaCheck style={{verticalAlign:"middle"}} />}</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Right panel */}
      <div style={s.rightPanel(isMobile)}>
        {isMobile && (
          <div style={s.mobileHeader}>
            <img src={myLogo} alt="Logo" style={{ width: 52, marginBottom: 14, borderRadius: 12 }} />
            <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: '1.9rem', fontWeight: 700, margin: 0 }}>Join ShelfMaster</h1>
            <p style={{ color: 'rgba(255,255,255,.8)', fontSize: '.9rem', margin: '6px 0 0' }}>Create your account now</p>
          </div>
        )}

        <div style={s.formCard(isMobile)}>
          <h2 style={s.formTitle}>Sign up</h2>
          <p style={s.formSub}>Create your account to get started with ShelfMaster.</p>

          {/* Step indicator */}
          <div style={s.stepRow}>
            {stepLabels.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const active = n === step;
              return (
                <React.Fragment key={n}>
                  <div style={s.stepItem}>
                    <div style={s.stepCircle(active, done)}>
                      {done ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : n}
                    </div>
                    <span style={s.stepLabel(active || done)}>{label.toUpperCase()}</span>
                  </div>
                  {i < stepLabels.length - 1 && (
                    <div style={s.stepLine(done)} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Role toggle — only on step 1 */}
          {step === 1 && (
            <>
              <p style={s.sectionLabel}>Account Type</p>
              <div style={s.roleToggle}>
                <button type="button" onClick={() => setRole('student')} style={s.roleBtn(role === 'student')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {icons.user} Student
                  </span>
                </button>
                <button type="button" onClick={() => setRole('teacher')} style={s.roleBtn(role === 'teacher')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {icons.briefcase} Teacher
                  </span>
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <p style={s.sectionLabel}>Full Name</p>
          )}
          {step === 3 && (
            <p style={s.sectionLabel}>{role === 'student' ? 'Student ID' : 'Employee Details'}</p>
          )}
          {step === 4 && (
            <p style={s.sectionLabel}>{role === 'student' ? 'Grade & Section' : 'Position & Track'}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: step === 1 ? 0 : 4 }}>
            {renderStep()}
          </div>

          <div style={s.btnRow}>
            <button type="button" onClick={handleBack} style={s.backBtn}>Back</button>
            {step < 4 ? (
              <button type="button" onClick={handleNext} style={s.nextBtn}>Next</button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={loading} style={s.nextBtn}>
                {loading ? 'Creating…' : 'Complete Sign up'}
              </button>
            )}
          </div>

          <p style={s.switchText}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--maroon)', fontWeight: 700, textDecoration: 'none' }}>
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── InputField helper ────────────────────────────────────────────────────────
function InputField({ icon, label, hint, ...props }) {
  return (
    <div style={s.fieldGroup}>
      <label style={s.label}>
        {label}
        {hint && <span style={s.hint}>{hint}</span>}
      </label>
      <div style={s.inputWrap}>
        <span style={s.inputIcon}>{icon}</span>
        <input {...props} style={s.input} className="sm-input" />
      </div>
    </div>
  );
}

// ── Styles (unchanged from original) ─────────────────────────────────────────
const STYLES = `
  .sm-input:focus {
    border-color: var(--maroon) !important;
    background: white !important;
    box-shadow: 0 0 0 3px rgba(123,31,31,.1) !important;
    outline: none;
  }
  .sm-input::placeholder { color: #adb5bd; }
`;

const s = {
  wrapper: (isMobile) => ({
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
  }),
  leftPanel: {
    flex: 1.2,
    background: 'linear-gradient(145deg, #7B1F1F 0%, #5A1515 100%)',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  patternOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `radial-gradient(circle at 20% 80%, rgba(255,255,255,.06) 0%, transparent 55%), radial-gradient(circle at 80% 20%, rgba(255,255,255,.04) 0%, transparent 50%)`,
    zIndex: 0,
  },
  leftContent: { position: 'relative', zIndex: 1, padding: '60px', width: '100%' },
  leftHeading: { fontFamily: 'var(--ff-display)', color: 'white', fontSize: '3rem', fontWeight: 700, margin: '0 0 14px', letterSpacing: '-.02em', lineHeight: 1.1 },
  leftSub: { color: 'rgba(255,255,255,.75)', fontSize: '1.05rem', lineHeight: 1.7, margin: '0 0 40px', maxWidth: 340 },
  featuresList: { display: 'flex', flexDirection: 'column', gap: 12 },
  featureItem: { display: 'flex', alignItems: 'center', gap: 12, fontSize: '.95rem', color: 'rgba(255,255,255,.82)' },
  check: { width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#D4A843', fontSize: '.8rem', fontWeight: 700, flexShrink: 0 },
  mobileHeader: {
    background: 'linear-gradient(145deg, #7B1F1F 0%, #5A1515 100%)',
    padding: '44px 24px 36px',
    textAlign: 'center',
    color: 'white',
  },
  rightPanel: (isMobile) => ({
    flex: 1,
    background: 'var(--cream, #f8f5f0)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    overflowY: 'auto',
    padding: isMobile ? '0 0 40px' : 0,
  }),
  formCard: (isMobile) => ({
    width: '100%',
    maxWidth: isMobile ? '100%' : 500,
    padding: isMobile ? '32px 22px' : '40px 40px',
    background: isMobile ? 'transparent' : 'white',
    borderRadius: isMobile ? 0 : 20,
    boxShadow: isMobile ? 'none' : '0 8px 40px rgba(90,21,21,.1)',
  }),
  formTitle: {
    fontFamily: 'var(--ff-display)',
    color: '#1a1a2e',
    margin: '0 0 4px',
    fontSize: '1.9rem',
    fontWeight: 700,
    letterSpacing: '-.02em',
  },
  formSub: { color: '#64748b', margin: '0 0 28px', fontSize: '.9rem' },
  stepRow: { display: 'flex', alignItems: 'center', marginBottom: 28 },
  stepItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 },
  stepCircle: (active, done) => ({
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: '.85rem',
    background: (active || done) ? '#7B1F1F' : '#e2e8f0',
    color: (active || done) ? 'white' : '#94a3b8',
    transition: 'all .25s',
    boxShadow: active ? '0 2px 10px rgba(123,31,31,.35)' : 'none',
  }),
  stepLabel: (activeOrDone) => ({
    fontSize: '.6rem', fontWeight: 700, letterSpacing: '.07em',
    color: activeOrDone ? '#7B1F1F' : '#94a3b8', whiteSpace: 'nowrap',
  }),
  stepLine: (done) => ({
    flex: 1, height: 2,
    background: done ? '#7B1F1F' : '#e2e8f0',
    margin: '0 4px', marginBottom: 22, transition: 'background .25s',
  }),
  sectionLabel: {
    fontSize: '.75rem', fontWeight: 700, letterSpacing: '.08em',
    color: '#64748b', margin: '0 0 8px', textTransform: 'uppercase',
  },
  roleToggle: {
    display: 'flex', gap: 8, marginBottom: 20,
    background: '#f1f5f9', borderRadius: 12, padding: 4,
  },
  roleBtn: (active) => ({
    flex: 1, padding: '10px 12px', borderRadius: 9, border: 'none',
    cursor: 'pointer', fontWeight: 700, fontSize: '.88rem', transition: 'all .2s',
    background: active ? '#7B1F1F' : 'transparent',
    color: active ? 'white' : '#64748b',
    boxShadow: active ? '0 2px 8px rgba(123,31,31,.3)' : 'none',
  }),
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: '.8rem', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 },
  hint: { color: '#94a3b8', fontWeight: 400, fontSize: '.72rem' },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  selectWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none', zIndex: 1 },
  selectChevron: { position: 'absolute', right: 14, color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none' },
  input: {
    padding: '13px 16px 13px 42px',
    border: '1.5px solid #e2e8f0', borderRadius: 10,
    fontSize: '.92rem', background: '#f8fafc', outline: 'none',
    transition: 'border-color .2s, background .2s, box-shadow .2s',
    color: '#1e293b', width: '100%', boxSizing: 'border-box',
  },
  btnRow: { display: 'flex', gap: 10, marginTop: 24 },
  backBtn: {
    flex: 1, padding: '13px', borderRadius: 10,
    border: '1.5px solid #e2e8f0', background: 'white',
    color: '#475569', fontWeight: 700, fontSize: '.95rem',
    cursor: 'pointer', transition: 'all .2s',
  },
  nextBtn: {
    flex: 2, padding: '13px', borderRadius: 10, border: 'none',
    background: '#7B1F1F', color: 'white', fontWeight: 700,
    fontSize: '.95rem', cursor: 'pointer', transition: 'background .2s',
    letterSpacing: '.02em', boxShadow: '0 2px 10px rgba(123,31,31,.3)',
  },
  switchText: { color: '#64748b', fontSize: '.88rem', textAlign: 'center', marginTop: 18 },
};