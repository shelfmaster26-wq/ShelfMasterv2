import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { localDb } from './localDbClient';
import myLogo from './assets/logo.png';
import Toast from './Toast';
import { useResponsive } from './useResponsive';

const LRN_PATTERN   = /^\d{12}$/;
const PHONE_PATTERN = /^\d{11}$/;
const NAME_MIN = 2;
const NAME_MAX = 40;

const DEFAULT_STRANDS = [
  'STEM', 'HUMSS', 'ABM', 'GAS',
  'TVL - Industrial Arts', 'TVL - Home Economics',
  'TVL - ICT', 'TVL - Agri-Fishery Arts',
  'Sports', 'Arts & Design',
];
const GRADE_OPTIONS = ['Grade 11', 'Grade 12'];

const sanitize = (s) => s.replace(/<[^>]*>/g, '').trim();
const buildFullName = (first, mi, last) => {
  const parts = [first.trim()];
  if (mi.trim()) parts.push(`${mi.trim().charAt(0).toUpperCase()}.`);
  parts.push(last.trim());
  return parts.join(' ');
};

const STEPS = [
  { label: 'Personal', desc: 'Your name & role' },
  { label: 'Details',  desc: 'ID & contact' },
  { label: 'Education', desc: 'Grade / employment info' },
];

export default function CompleteProfile() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { isMobile, isTablet } = useResponsive();
  const compact = isMobile || isTablet;

  const email    = location.state?.email    || '';
  const password = location.state?.password || '';

  const [step,    setStep]    = useState(1);
  const [role,    setRole]    = useState('student');
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState({ message: '', type: 'success' });
  const [strands, setStrands] = useState(DEFAULT_STRANDS);

  const showToast = (msg, type = 'error') => setToast({ message: msg, type });

  const [sd, setSd] = useState({
    firstName: '', lastName: '', middleInitial: '',
    lrn: '', contactNumber: '',
    grade: '', strand: '', section: '', adviser: '',
  });
  const [td, setTd] = useState({
    firstName: '', lastName: '', middleInitial: '',
    employeeId: '', contactNumber: '',
    position: '', gradeSection: '',
  });

  useEffect(() => {
    if (!email || !password) { navigate('/login'); return; }
    localDb.from('site_content').select('strands').limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.strands) {
          try {
            const arr = JSON.parse(data.strands);
            if (Array.isArray(arr) && arr.length) setStrands(arr);
          } catch { /* keep default */ }
        }
      });
  }, []);

  const handleSd = (e) => setSd(p => ({ ...p, [e.target.name]: e.target.value }));
  const handleTd = (e) => setTd(p => ({ ...p, [e.target.name]: e.target.value }));

  const validate = () => {
    if (role === 'student') {
      if (step === 1) {
        if (sanitize(sd.firstName).length < NAME_MIN) { showToast('First name must be at least 2 characters.', 'warning'); return false; }
        if (!/[a-zA-Z]/.test(sd.firstName))           { showToast('First name must contain letters.', 'warning'); return false; }
        if (sanitize(sd.lastName).length  < NAME_MIN) { showToast('Last name must be at least 2 characters.', 'warning'); return false; }
        if (!/[a-zA-Z]/.test(sd.lastName))            { showToast('Last name must contain letters.', 'warning'); return false; }
      }
      if (step === 2) {
        if (!LRN_PATTERN.test(sanitize(sd.lrn)))      { showToast('LRN must be exactly 12 digits.', 'warning'); return false; }
        if (!PHONE_PATTERN.test(sd.contactNumber))    { showToast('Contact number must be exactly 11 digits (e.g. 09171234567).', 'warning'); return false; }
      }
      if (step === 3) {
        if (!sd.grade)                                { showToast('Please select a grade level.', 'warning'); return false; }
        if (!sd.strand)                               { showToast('Please select a strand.', 'warning'); return false; }
        if (!sanitize(sd.section))                    { showToast('Section is required.', 'warning'); return false; }
        if (!sanitize(sd.adviser))                    { showToast('Adviser name is required.', 'warning'); return false; }
      }
    } else {
      if (step === 1) {
        if (sanitize(td.firstName).length < NAME_MIN) { showToast('First name must be at least 2 characters.', 'warning'); return false; }
        if (!/[a-zA-Z]/.test(td.firstName))           { showToast('First name must contain letters.', 'warning'); return false; }
        if (sanitize(td.lastName).length  < NAME_MIN) { showToast('Last name must be at least 2 characters.', 'warning'); return false; }
        if (!/[a-zA-Z]/.test(td.lastName))            { showToast('Last name must contain letters.', 'warning'); return false; }
      }
      if (step === 2) {
        if (!/^\d{7}$/.test(sanitize(td.employeeId))) { showToast('Employee ID must be exactly 7 digits.', 'warning'); return false; }
        if (!PHONE_PATTERN.test(td.contactNumber))    { showToast('Contact number must be exactly 11 digits.', 'warning'); return false; }
      }
      if (step === 3) {
        if (!sanitize(td.position))                   { showToast('Position is required.', 'warning'); return false; }
        if (!sanitize(td.gradeSection))               { showToast('Track / Strand is required.', 'warning'); return false; }
      }
    }
    return true;
  };

  const handleNext = () => { if (validate()) setStep(s => s + 1); };
  const handleBack = () => { if (step > 1) setStep(s => s - 1); else navigate('/login'); };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      let profile;
      if (role === 'student') {
        const name     = buildFullName(sd.firstName, sd.middleInitial, sd.lastName);
        const lrn      = sanitize(sd.lrn);
        const combined = [sd.grade, sd.strand, sanitize(sd.section)].filter(Boolean).join(' - ');
        profile = {
          name,
          student_id:     lrn,
          lrn,
          grade_section:  combined,
          course_year:    combined,
          section:        sanitize(sd.section),
          contact_number: sanitize(sd.contactNumber),
          adviser:        sanitize(sd.adviser),
          role:           'student',
        };
      } else {
        const name       = buildFullName(td.firstName, td.middleInitial, td.lastName);
        const employeeId = sanitize(td.employeeId);
        profile = {
          name,
          student_id:     employeeId,
          grade_section:  sanitize(td.gradeSection),
          position:       sanitize(td.position),
          course_year:    sanitize(td.position),
          contact_number: sanitize(td.contactNumber),
          role:           'teacher',
        };
      }

      const result = await localDb.auth.repairProfile({ email, password, profile });
      if (result?.error) {
        showToast(result.error.message || 'Could not complete profile.', 'error');
        return;
      }

      showToast('Profile created! Signing you in…', 'success');
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      showToast(err.message || 'Something went wrong.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, name, type = 'text', placeholder, value, onChange, hint, ...rest }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#475569' }}>
        {label} {hint && <span style={{ fontWeight: 400, color: '#94a3b8' }}>({hint})</span>}
      </label>
      <input
        name={name} type={type} placeholder={placeholder} value={value} onChange={onChange}
        style={{
          padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10,
          fontSize: '.9rem', background: '#f8fafc', color: '#1e293b', outline: 'none',
          fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
        }}
        onFocus={e => { e.target.style.borderColor = '#7B1F1F'; e.target.style.background = 'white'; e.target.style.boxShadow = '0 0 0 3px rgba(123,31,31,.1)'; }}
        onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
        {...rest}
      />
    </div>
  );

  const Select = ({ label, name, value, onChange, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#475569' }}>{label}</label>
      <select
        name={name} value={value} onChange={onChange}
        style={{
          padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10,
          fontSize: '.9rem', background: '#f8fafc', color: '#1e293b', outline: 'none',
          fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', appearance: 'none',
        }}
        onFocus={e => { e.target.style.borderColor = '#7B1F1F'; e.target.style.background = 'white'; }}
        onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
      >
        {children}
      </select>
    </div>
  );

  const renderStep = () => {
    if (role === 'student') {
      if (step === 1) return (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First Name"  name="firstName" placeholder="Juan"       value={sd.firstName} onChange={handleSd} required maxLength={NAME_MAX} />
            <Field label="Last Name"   name="lastName"  placeholder="Dela Cruz"  value={sd.lastName}  onChange={handleSd} required maxLength={NAME_MAX} />
          </div>
          <Field label="Middle Initial" name="middleInitial" hint="optional" placeholder="e.g. B"
            value={sd.middleInitial}
            onChange={(e) => {
              const v = e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 1).toUpperCase();
              handleSd({ target: { name: 'middleInitial', value: v } });
            }}
            maxLength={1} style={{ maxWidth: 140 }} />
        </>
      );
      if (step === 2) return (
        <>
          <Field label="LRN (12 Digits)" name="lrn" placeholder="123456789012" inputMode="numeric" maxLength={12}
            value={sd.lrn}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 12); setSd(p => ({ ...p, lrn: v })); }} required />
          <Field label="Contact Number" name="contactNumber" placeholder="e.g. 09171234567" type="tel" maxLength={11} inputMode="numeric"
            value={sd.contactNumber}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 11); handleSd({ target: { name: 'contactNumber', value: v } }); }} required />
        </>
      );
      if (step === 3) return (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Grade Level" name="grade" value={sd.grade} onChange={handleSd}>
              <option value="">Select Grade</option>
              {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </Select>
            <Select label="Strand / Track" name="strand" value={sd.strand} onChange={handleSd}>
              <option value="">Select Strand</option>
              {strands.map(st => <option key={st} value={st}>{st}</option>)}
            </Select>
          </div>
          <Field label="Section" name="section" placeholder="e.g. Rizal, Section A" value={sd.section} onChange={handleSd} required maxLength={50} />
          <Field label="Adviser"  name="adviser"  placeholder="e.g. Mr. Juan Santos"   value={sd.adviser}  onChange={handleSd} required maxLength={80} />
        </>
      );
    } else {
      if (step === 1) return (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First Name" name="firstName" placeholder="Maria"      value={td.firstName} onChange={handleTd} required maxLength={NAME_MAX} />
            <Field label="Last Name"  name="lastName"  placeholder="Santos"     value={td.lastName}  onChange={handleTd} required maxLength={NAME_MAX} />
          </div>
          <Field label="Middle Initial" name="middleInitial" hint="optional" placeholder="e.g. A"
            value={td.middleInitial}
            onChange={(e) => {
              const v = e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 1).toUpperCase();
              handleTd({ target: { name: 'middleInitial', value: v } });
            }}
            maxLength={1} />
        </>
      );
      if (step === 2) return (
        <>
          <Field label="Employee ID" name="employeeId" placeholder="e.g. 1435418" inputMode="numeric" maxLength={7}
            value={td.employeeId}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 7); handleTd({ target: { name: 'employeeId', value: v } }); }} required />
          <Field label="Contact Number" name="contactNumber" placeholder="e.g. 09171234567" type="tel" maxLength={11} inputMode="numeric"
            value={td.contactNumber}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 11); handleTd({ target: { name: 'contactNumber', value: v } }); }} required />
        </>
      );
      if (step === 3) return (
        <>
          <Field label="Position"       name="position"    placeholder="e.g. Subject Teacher" value={td.position}    onChange={handleTd} required maxLength={80} />
          <Field label="Track / Strand" name="gradeSection" placeholder="e.g. STEM"           value={td.gradeSection} onChange={handleTd} required maxLength={80} />
        </>
      );
    }
  };

  const isLastStep = step === 3;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f5f0', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <Toast {...toast} onClose={() => setToast({ message: '' })} />

      {/* Left panel — desktop only */}
      {!compact && (
        <aside style={{
          width: 400, flexShrink: 0,
          background: 'linear-gradient(155deg, #5a1515 0%, #7B1F1F 50%, #8b2020 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '60px 48px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 15% 85%, rgba(255,255,255,.07) 0%, transparent 50%), radial-gradient(circle at 85% 15%, rgba(255,255,255,.05) 0%, transparent 45%), linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)', backgroundSize: 'auto, auto, 36px 36px, 36px 36px', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48, position: 'relative' }}>
            <img src={myLogo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 12 }} />
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white', letterSpacing: '-.02em' }}>ShelfMaster</span>
          </div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: 'white', lineHeight: 1.1, letterSpacing: '-.03em', margin: '0 0 16px', position: 'relative' }}>
            Almost<br />there.
          </h1>
          <p style={{ color: 'rgba(255,255,255,.72)', fontSize: '.95rem', lineHeight: 1.7, margin: '0 0 40px', position: 'relative' }}>
            Your login credentials are ready. Just fill in your library profile details to complete your registration.
          </p>
          {/* Step indicators */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.78rem', fontWeight: 700,
                  background: i + 1 < step ? 'rgba(255,255,255,.85)' : i + 1 === step ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)',
                  border: `1px solid ${i + 1 <= step ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.15)'}`,
                  color: i + 1 < step ? '#7B1F1F' : 'rgba(255,255,255,.9)',
                }}>
                  {i + 1 < step ? '✓' : i + 1}
                </div>
                <div>
                  <div style={{ color: i + 1 === step ? 'white' : 'rgba(255,255,255,.6)', fontWeight: i + 1 === step ? 700 : 400, fontSize: '.9rem' }}>{s.label}</div>
                  <div style={{ color: 'rgba(255,255,255,.45)', fontSize: '.75rem' }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Right panel */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: compact ? 'flex-start' : 'center', overflowY: 'auto', padding: compact ? 0 : '48px 32px 60px' }}>
        {/* Mobile banner */}
        {compact && (
          <div style={{ width: '100%', background: 'linear-gradient(155deg, #5a1515 0%, #7B1F1F 60%)', padding: '36px 24px 32px', textAlign: 'center', color: 'white' }}>
            <img src={myLogo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 12 }} />
            <div style={{ fontSize: '1.7rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-.02em' }}>Complete Registration</div>
            <div style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.7)' }}>Step {step} of 3 — {STEPS[step - 1].label}</div>
          </div>
        )}

        <div style={{
          width: '100%', maxWidth: 460,
          background: 'white', borderRadius: 22, padding: compact ? '24px 18px' : '36px 32px',
          boxShadow: '0 8px 48px rgba(90,21,21,.09), 0 2px 8px rgba(0,0,0,.04)',
          marginTop: compact ? 24 : 0,
        }}>
          <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7B1F1F', fontWeight: 600, fontSize: '.8rem', opacity: .65, padding: 0, marginBottom: 20, fontFamily: 'inherit' }}>
            ← Back
          </button>

          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-.02em', marginBottom: 4, textAlign: 'center' }}>
            Complete Your Profile
          </div>
          <div style={{ fontSize: '.85rem', color: '#64748b', textAlign: 'center', marginBottom: 24 }}>
            Step {step} of 3 — {STEPS[step - 1].desc}
          </div>

          {/* Step progress bar */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i + 1 <= step ? '#7B1F1F' : '#e2e8f0', transition: 'background .3s' }} />
            ))}
          </div>

          {/* Role tabs — only on step 1 */}
          {step === 1 && (
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 20 }}>
              {[{ key: 'student', label: 'Student' }, { key: 'teacher', label: 'Teacher' }].map(({ key, label }) => (
                <button key={key} onClick={() => setRole(key)} style={{
                  flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontWeight: 700, fontSize: '.88rem', fontFamily: 'inherit', transition: 'all .2s',
                  background: role === key ? 'white' : 'transparent',
                  color: role === key ? '#7B1F1F' : '#64748b',
                  boxShadow: role === key ? '0 1px 6px rgba(0,0,0,.1)' : 'none',
                }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {renderStep()}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
            {step > 1 && (
              <button onClick={handleBack} style={{
                flex: '0 0 auto', padding: '12px 20px', borderRadius: 11, border: '1.5px solid #e2e8f0',
                background: 'white', color: '#475569', fontWeight: 700, fontSize: '.9rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Back
              </button>
            )}
            <button
              onClick={isLastStep ? handleSubmit : handleNext}
              disabled={loading}
              style={{
                flex: 1, padding: '13px', borderRadius: 11, border: 'none',
                background: '#7B1F1F', color: 'white', fontWeight: 700, fontSize: '.95rem',
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .65 : 1,
                fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(123,31,31,.32)',
                transition: 'opacity .2s, transform .15s',
              }}
            >
              {loading ? 'Saving…' : isLastStep ? 'Complete Registration →' : 'Next →'}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: '.82rem', color: '#94a3b8' }}>
            Signing in as <strong style={{ color: '#475569' }}>{email}</strong>
          </div>
        </div>
      </main>
    </div>
  );
}
