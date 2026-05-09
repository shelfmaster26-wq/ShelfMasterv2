import React, { useEffect, useState, useMemo } from 'react';
import { localDbAdmin } from './localDbAdmin';
import Toast from './Toast';
import ConfirmModal from './ConfirmModal';
import {
  FaBookOpen, FaChalkboardTeacher, FaCheck, FaGraduationCap,
  FaSearch, FaTrash, FaClipboardList, FaInfoCircle,
  FaExclamationCircle, FaCheckCircle, FaSpinner, FaBook,
  FaCalendarAlt, FaUserGraduate, FaIdCard,
} from 'react-icons/fa';
import { MdClose } from 'react-icons/md';

/* ─── Input restrictions ─── */
const ALPHA_ONLY     = /^[a-zA-ZÀ-ÿñÑ\s\-'.]*$/;
const ALPHANUMERIC   = /^[a-zA-Z0-9\s\-_.]*$/;
const EMAIL_OR_PHONE = /^[a-zA-Z0-9@.\-+_()\s]*$/;
const restrict = (value, pattern) => pattern.test(value) ? value : undefined;
const capFirst = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const DEFAULT_STRANDS = ['STEM','HUMSS','ABM','GAS','TVL - Industrial Arts','TVL - Home Economics','TVL - ICT','TVL - Agri-Fishery Arts','Sports','Arts & Design'];
const GRADE_LEVELS = ['Grade 11', 'Grade 12'];

const parseCombinedGS = (combined) => {
  if (!combined) return { grade: '', strand: '', section: '' };
  const parts = combined.split(' - ');
  if (parts.length >= 3) return { grade: parts[0].trim(), strand: parts[1].trim(), section: parts.slice(2).join(' - ').trim() };
  if (parts.length === 2) return { grade: parts[0].trim(), strand: '', section: parts[1].trim() };
  return { grade: '', strand: '', section: combined.trim() };
};

/* Smart name parser: "Juan S. Dela Cruz" → first=Juan, mi=S, last=Dela Cruz */
const parseName = (fullName = '') => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', middleInitial: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleInitial: '', lastName: '' };
  const miCandidate = parts.length >= 3 ? parts[parts.length - 2] : '';
  const isMI = /^[A-ZÑ]\.?$/.test(miCandidate);
  if (isMI && parts.length >= 3) {
    return {
      firstName: parts.slice(0, parts.length - 2).join(' '),
      middleInitial: miCandidate.replace('.', ''),
      lastName: parts[parts.length - 1],
    };
  }
  return {
    firstName: parts.slice(0, parts.length - 1).join(' '),
    middleInitial: '',
    lastName: parts[parts.length - 1],
  };
};

const EMPTY_STUDENT = { firstName: '', lastName: '', middleInitial: '', grade: '', strand: '', lrn: '', adviser: '', contact: '' };
const EMPTY_TEACHER = { firstName: '', lastName: '', middleInitial: '', employeeId: '', position: '', gradeSection: '', contact: '' };

export default function WalkIn() {
  const [borrowerType, setBorrowerType] = useState('student');
  const [toast, setToast]               = useState({ message: '', type: 'success' });
  const showToast = (msg, type = 'success') => setToast({ message: msg, type });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, danger: false, confirmText: 'Confirm' });
  const openConfirm  = (opts) => setConfirmModal({ isOpen: true, ...opts });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, isOpen: false }));

  const [strands, setStrands]           = useState(DEFAULT_STRANDS);
  const [books, setBooks]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [booksLoaded, setBooksLoaded]   = useState(false);

  const [studentForm, setStudentForm]     = useState(EMPTY_STUDENT);
  const [studentLinked, setStudentLinked] = useState(null);
  const [lrnLookupState, setLrnLookupState] = useState('idle');

  const [teacherForm, setTeacherForm]     = useState(EMPTY_TEACHER);
  const [teacherLinked, setTeacherLinked] = useState(null);
  const [empLookupState, setEmpLookupState] = useState('idle');

  const [bookQuery, setBookQuery]   = useState('');
  const [borrowList, setBorrowList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [defaultBorrowDays, setDefaultBorrowDays] = useState(7);
  const [maxBorrow, setMaxBorrow]   = useState(3);

  const [studentErrors, setStudentErrors] = useState({});
  const [teacherErrors, setTeacherErrors] = useState({});

  /* ── Load policy & strands ── */
  useEffect(() => {
    localDbAdmin.from('fine_policy')
      .select('borrow_duration_value, borrow_duration_unit, max_borrow_count')
      .eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (data?.borrow_duration_value) {
          const days = data.borrow_duration_unit === 'hours'
            ? Math.ceil(data.borrow_duration_value / 24)
            : data.borrow_duration_value;
          setDefaultBorrowDays(Math.max(1, days));
        }
        if (data?.max_borrow_count) setMaxBorrow(Math.max(1, data.max_borrow_count));
      });
    localDbAdmin.from('site_content').select('strands').limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.strands) {
          try { const arr = JSON.parse(data.strands); if (Array.isArray(arr) && arr.length) setStrands(arr); } catch {}
        }
      });
  }, []);

  /* ── Load books ── */
  useEffect(() => {
    if (booksLoaded) return;
    setLoading(true); setBooksLoaded(true);
    localDbAdmin.from('books')
      .select('id, title, authors, barcode, accession_num, quantity, book_type, status, cover_image, category')
      .eq('status', 'active').order('title', { ascending: true })
      .then(({ data, error }) => {
        if (error) showToast('Failed to load books: ' + error.message, 'error');
        else setBooks((data || []).filter(b => (b.book_type || '').toLowerCase() !== 'ebook'));
        setLoading(false);
      });
  }, [booksLoaded]);

  const inListCounts = useMemo(() => {
    const m = new Map();
    for (const b of borrowList) m.set(b.id, (m.get(b.id) || 0) + 1);
    return m;
  }, [borrowList]);

  const filteredBooks = useMemo(() => {
    const q = bookQuery.trim().toLowerCase();
    if (!q) return books;
    return books.filter(b =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.authors || '').toLowerCase().includes(q) ||
      (b.barcode || '').toLowerCase().includes(q) ||
      (b.accession_num || '').toLowerCase().includes(q) ||
      (b.category || '').toLowerCase().includes(q)
    );
  }, [books, bookQuery]);

  const switchType = (type) => {
    if (type === borrowerType) return;
    setBorrowerType(type);
    setStudentErrors({});
    setTeacherErrors({});
  };

  const resetAll = () => {
    setBorrowList([]); setBookQuery('');
    setStudentForm(EMPTY_STUDENT); setTeacherForm(EMPTY_TEACHER);
    setStudentLinked(null); setTeacherLinked(null);
    setLrnLookupState('idle'); setEmpLookupState('idle');
    setStudentErrors({}); setTeacherErrors({});
  };

  /* ── LRN lookup ── */
  const lookupByLrn = async (lrn) => {
    const clean = lrn.replace(/\D/g, '').slice(0, 12);
    setStudentForm(f => ({ ...f, lrn: clean }));
    if (clean.length < 12) {
      setStudentLinked(null);
      setLrnLookupState(clean.length ? 'typing' : 'idle');
      return;
    }
    setLrnLookupState('searching');
    const { data } = await localDbAdmin.from('users')
      .select('id, name, lrn, grade_section, student_id')
      .eq('lrn', clean).eq('role', 'student').limit(1).maybeSingle();
    if (data) {
      setStudentLinked(data);
      setLrnLookupState('found');
      const parsed = parseName(data.name);
      const gs = parseCombinedGS(data.grade_section);
      setStudentForm(f => ({
        ...f, lrn: clean,
        firstName:     parsed.firstName     || f.firstName,
        lastName:      parsed.lastName      || f.lastName,
        middleInitial: parsed.middleInitial || f.middleInitial,
        grade:  gs.grade  || f.grade,
        strand: gs.strand || f.strand,
      }));
    } else {
      setStudentLinked(null);
      setLrnLookupState('notfound');
    }
  };

  const unlinkStudent = () => {
    setStudentLinked(null); setLrnLookupState('idle');
    setStudentForm({ ...EMPTY_STUDENT, lrn: studentForm.lrn });
  };

  /* ── Employee ID lookup ── */
  const lookupByEmployeeId = async (empId) => {
    setTeacherForm(f => ({ ...f, employeeId: empId }));
    if (!empId.trim()) { setTeacherLinked(null); setEmpLookupState('idle'); return; }
    setEmpLookupState('searching');

    const { data: userData } = await localDbAdmin.from('users')
      .select('id, name, student_id, grade_section, position')
      .eq('student_id', empId.trim()).eq('role', 'teacher')
      .limit(1).maybeSingle();

    if (userData) {
      setTeacherLinked(userData); setEmpLookupState('found');
      const parsed = parseName(userData.name);
      setTeacherForm(f => ({
        ...f,
        employeeId:    empId,
        firstName:     parsed.firstName     || f.firstName,
        lastName:      parsed.lastName      || f.lastName,
        middleInitial: parsed.middleInitial || f.middleInitial,
        position:      userData.position    || f.position,
        gradeSection:  userData.grade_section || f.gradeSection,
      }));
      return;
    }

    const { data: txnData } = await localDbAdmin.from('transactions')
      .select('walk_in_name, walk_in_employee_id, walk_in_position, walk_in_grade_section, walk_in_contact')
      .eq('walk_in_employee_id', empId.trim())
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (txnData) {
      setTeacherLinked(txnData); setEmpLookupState('found');
      const parsed = parseName(txnData.walk_in_name);
      setTeacherForm(f => ({
        ...f,
        employeeId:    empId,
        firstName:     parsed.firstName     || f.firstName,
        lastName:      parsed.lastName      || f.lastName,
        middleInitial: parsed.middleInitial || f.middleInitial,
        position:      txnData.walk_in_position    || f.position,
        gradeSection:  txnData.walk_in_grade_section || f.gradeSection,
        contact:       txnData.walk_in_contact      || f.contact,
      }));
      return;
    }

    setTeacherLinked(null); setEmpLookupState('notfound');
  };

  const unlinkTeacher = () => {
    setTeacherLinked(null); setEmpLookupState('idle');
    setTeacherForm({ ...EMPTY_TEACHER, employeeId: teacherForm.employeeId });
  };

  /* ── Book list ops ── */
  const addBook = (b) => {
    if (borrowList.length >= maxBorrow) { showToast(`Borrowers are limited to ${maxBorrow} books per transaction.`, 'error'); return; }
    if (b.quantity <= 0) { showToast(`"${b.title}" has no available copies.`, 'error'); return; }
    if (borrowList.some(sb => sb.id === b.id)) { showToast(`"${b.title}" is already in the list.`, 'error'); return; }
    const uid = `${b.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setBorrowList(prev => [...prev, { ...b, uid }]);
  };
  const removeBook = (uid) => setBorrowList(prev => prev.filter(b => b.uid !== uid));

  /* ── Validation ── */
  const validateStudent = () => {
    const e = {};
    if (!studentForm.firstName.trim())             e.firstName = 'First name is required';
    if (!studentForm.lastName.trim())              e.lastName  = 'Last name is required';
    if (!/^\d{12}$/.test(studentForm.lrn.trim())) e.lrn       = 'LRN must be exactly 12 digits';
    if (!studentForm.grade)                        e.grade     = 'Grade level is required';
    if (!studentForm.strand)                       e.strand    = 'Strand is required';
    if (!studentForm.adviser.trim())               e.adviser   = 'Adviser name is required';
    if (!studentForm.contact.trim())               e.contact   = 'Contact is required';
    setStudentErrors(e); return Object.keys(e).length === 0;
  };

  const validateTeacher = () => {
    const e = {};
    if (!teacherForm.firstName.trim())    e.firstName    = 'First name is required';
    if (!teacherForm.lastName.trim())     e.lastName     = 'Last name is required';
    if (!teacherForm.employeeId.trim())   e.employeeId   = 'Employee No. is required';
    if (!teacherForm.position.trim())     e.position     = 'Position is required';
    if (!teacherForm.gradeSection.trim()) e.gradeSection = 'Track / Strand is required';
    if (!teacherForm.contact.trim())      e.contact      = 'Contact is required';
    setTeacherErrors(e); return Object.keys(e).length === 0;
  };

  /* ── Submit ── */
  const assignAvailableCopy = async (bookId) => {
    const { data, error } = await localDbAdmin.from('book_copies')
      .select('id, accession_id, copy_number').eq('book_id', bookId).eq('status', 'available')
      .order('copy_number', { ascending: true }).limit(1).maybeSingle();
    if (error && error.code !== '42P01') return null;
    return data || null;
  };

  const buildFullName = (f) =>
    `${f.firstName.trim()}${f.middleInitial.trim() ? ' ' + f.middleInitial.trim().toUpperCase() + '.' : ''} ${f.lastName.trim()}`.trim();

  const handleSubmit = async () => {
    const isTchr = borrowerType === 'teacher';
    const valid  = isTchr ? validateTeacher() : validateStudent();
    if (!valid) { showToast('Please fix the highlighted fields.', 'error'); return; }
    if (borrowList.length === 0) { showToast('Please add at least one book.', 'error'); return; }

    setSubmitting(true);
    try {
      const borrowDate = new Date().toISOString();
      const dueDate    = new Date(Date.now() + defaultBorrowDays * 86400000).toISOString();
      let success = 0; const failures = [];

      for (const book of borrowList) {
        try {
          const { data: freshBook, error: bErr } = await localDbAdmin.from('books').select('quantity').eq('id', book.id).single();
          if (bErr) throw bErr;
          if ((freshBook?.quantity || 0) <= 0) { failures.push(`${book.title} — no copies left`); continue; }

          const copy = await assignAvailableCopy(book.id);

          const payload = {
            user_id: studentLinked?.id || teacherLinked?.id || null,
            book_id: book.id, status: 'borrowed',
            borrow_date: borrowDate, due_date: dueDate, copy_id: copy?.id || null,
          };

          if (isTchr) {
            payload.walk_in_name          = buildFullName(teacherForm);
            payload.walk_in_employee_id   = teacherForm.employeeId.trim();
            payload.walk_in_position      = teacherForm.position.trim();
            payload.walk_in_grade_section = teacherForm.gradeSection.trim();
            payload.walk_in_contact       = teacherForm.contact.trim();
          } else {
            payload.walk_in_name          = buildFullName(studentForm);
            payload.walk_in_grade_section = [studentForm.grade, studentForm.strand].filter(Boolean).join(' - ');
            payload.walk_in_lrn           = studentForm.lrn.trim();
            payload.walk_in_teacher       = studentForm.adviser.trim();
            payload.walk_in_contact       = studentForm.contact.trim();
          }

          const { error: txnErr } = await localDbAdmin.from('transactions').insert([payload]).select().single();
          if (txnErr) throw txnErr;
          if (copy) await localDbAdmin.from('book_copies').update({ status: 'borrowed' }).eq('id', copy.id);
          await localDbAdmin.from('books').update({ quantity: (freshBook.quantity || 0) - 1 }).eq('id', book.id);
          success++;
        } catch (err) { console.error(err); failures.push(`${book.title} — ${err.message}`); }
      }

      const name = isTchr
        ? `${teacherForm.firstName.trim()} ${teacherForm.lastName.trim()}`
        : `${studentForm.firstName.trim()} ${studentForm.lastName.trim()}`;

      if (success > 0) {
        showToast(
          `${success} book${success > 1 ? 's' : ''} issued to ${name}.` +
          (failures.length ? ` ${failures.length} failed.` : ''),
          failures.length ? 'warning' : 'success'
        );
        if (failures.length === 0) resetAll();
      } else {
        showToast('Walk-in failed: ' + failures.join('; '), 'error');
      }
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setSubmitting(false); }
  };

  /* ── Derived ── */
  const isTeacher   = borrowerType === 'teacher';
  const accentColor = isTeacher ? 'var(--maroon, #7f1d1d)' : 'var(--green, #166534)';
  const accentHex   = isTeacher ? '#7f1d1d' : '#166534';
  const setSF = (key, val) => { setStudentForm(f => ({ ...f, [key]: val })); setStudentErrors(e => ({ ...e, [key]: '' })); };
  const setTF = (key, val) => { setTeacherForm(f => ({ ...f, [key]: val })); setTeacherErrors(e => ({ ...e, [key]: '' })); };

  /* ── Computed due date label (shared by all borrow list rows) ── */
  const dueDateLabel = new Date(Date.now() + defaultBorrowDays * 86400000)
    .toLocaleDateString('en-PH', { dateStyle: 'medium' });

  /* ════════ RENDER ════════ */
  return (
    <div style={S.page}>
      <Toast {...toast} onClose={() => setToast({ message: '' })} />
      <ConfirmModal
        isOpen={confirmModal.isOpen} title={confirmModal.title}
        message={confirmModal.message} confirmText={confirmModal.confirmText}
        danger={confirmModal.danger} onConfirm={confirmModal.onConfirm} onCancel={closeConfirm}
      />
      <style>{CSS}</style>

      {/* ══ Page header ══ */}
      <div style={S.pageTop}>
        <div>
          <h1 style={S.pageTitle}>
            <FaBookOpen style={{ marginRight: '10px', fontSize: '1.1rem', verticalAlign: 'middle', color: accentHex }} />
            Walk-in Borrowing
          </h1>
          <p style={S.pageSub}>Issue books in person — fill borrower info below, pick books, then submit.</p>
        </div>
        {/* Summary chips */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ ...S.chip, background: isTeacher ? '#fef2f2' : '#f0fdf4', color: isTeacher ? '#991b1b' : '#166534', border: `1px solid ${isTeacher ? '#fecaca' : '#bbf7d0'}` }}>
            {isTeacher ? <FaChalkboardTeacher /> : <FaGraduationCap />}
            {isTeacher ? 'Teacher' : 'Student'}
          </div>
          {borrowList.length > 0 && (
            <div style={{ ...S.chip, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
              <FaClipboardList /> {borrowList.length}/{maxBorrow} books
            </div>
          )}
        </div>
      </div>

      {/* ══ ROW 1: Pick Books + Borrow List ══ */}
      <div className="wi-top-row">

        {/* ─ Pick Books ─ */}
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={S.cardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ ...S.numBadge, background: '#f59e0b' }}>1</div>
              <FaSearch style={{ color: '#f59e0b', fontSize: '0.9rem' }} />
              <h3 style={S.cardTitle}>Pick Books</h3>
            </div>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>
              {filteredBooks.length} available
            </span>
          </div>

          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem', pointerEvents: 'none' }} />
            <input
              style={{ ...S.input, paddingLeft: '36px', paddingRight: bookQuery ? '36px' : '12px' }}
              placeholder="Search title, author, barcode, category…"
              value={bookQuery} onChange={e => setBookQuery(e.target.value)}
            />
            {bookQuery && (
              <button onClick={() => setBookQuery('')} style={S.clearSearch}><MdClose /></button>
            )}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '220px', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaSpinner className="spin" style={{ fontSize: '1.2rem', color: '#f59e0b' }} />
              </div>
              <span style={{ fontSize: '0.84rem', color: '#94a3b8' }}>Loading books…</span>
            </div>
          ) : (
            <div className="wi-book-grid">
              {filteredBooks.length === 0 ? (
                <div style={{ ...S.emptyState, gridColumn: '1 / -1' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <FaSearch style={{ fontSize: '1.3rem', color: '#cbd5e1' }} />
                  </div>
                  <span style={{ fontWeight: 600, color: '#64748b' }}>No books found</span>
                  <span style={{ fontSize: '0.78rem', marginTop: '3px' }}>Try a different search term</span>
                </div>
              ) : filteredBooks.map(b => {
                const inCart    = inListCounts.get(b.id) || 0;
                const remaining = Math.max(0, b.quantity - inCart);
                const disabled  = remaining <= 0 || borrowList.length >= maxBorrow;
                return (
                  <button key={b.id} onClick={() => addBook(b)} disabled={disabled}
                    className="wi-book-card"
                    style={{
                      opacity: disabled ? 0.48 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      borderColor: inCart > 0 ? '#16a34a' : '#e2e8f0',
                      boxShadow: inCart > 0 ? '0 0 0 2px #d1fae5' : 'none',
                    }}
                  >
                    {inCart > 0 && (
                      <div style={{ position: 'absolute', top: '6px', right: '6px', background: '#16a34a', color: 'white', borderRadius: '999px', minWidth: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, zIndex: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>{inCart}</div>
                    )}
                    <div style={{ width: '100%', height: '145px', position: 'relative', background: '#f1f5f9', borderRadius: '7px 7px 0 0', overflow: 'hidden', flexShrink: 0 }}>
                      {b.cover_image
                        ? <img src={b.cover_image} alt={b.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                        : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#e2e8f0,#f1f5f9)' }}><FaBook style={{ color: '#cbd5e1', fontSize: '1.6rem' }} /></div>}
                      {inCart > 0 && <div style={{ position: 'absolute', inset: 0, background: 'rgba(22,163,74,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', fontSize: '1.4rem' }}><FaCheck /></div>}
                    </div>
                    <div style={{ padding: '6px 7px 7px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {b.title}
                      </div>
                      <div style={{ fontSize: '0.63rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.authors || '—'}
                      </div>
                      <div>
                        <span style={{ fontSize: '0.61rem', fontWeight: 700, color: remaining > 0 ? '#059669' : '#dc2626', background: remaining > 0 ? '#d1fae5' : '#fee2e2', padding: '1px 6px', borderRadius: '999px' }}>
                          {remaining > 0 ? `${remaining} avail.` : 'Out'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─ Borrow List ─ */}
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }}>
          <div style={S.cardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ ...S.numBadge, background: '#6366f1' }}>2</div>
              <FaClipboardList style={{ color: '#6366f1', fontSize: '0.9rem' }} />
              <h3 style={S.cardTitle}>Borrow List</h3>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: borrowList.length >= maxBorrow ? '#fef2f2' : '#f8fafc',
              border: `1.5px solid ${borrowList.length >= maxBorrow ? '#fecaca' : '#e2e8f0'}`,
              borderRadius: '999px', padding: '3px 10px',
            }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: borrowList.length >= maxBorrow ? '#dc2626' : '#475569' }}>
                {borrowList.length}/{maxBorrow}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>books</span>
            </div>
          </div>

          {/* Due date notice — shown whenever there are books or always as a policy hint */}
          <div style={S.dueBanner}>
            <FaCalendarAlt style={{ flexShrink: 0, color: '#6366f1' }} />
            <span>
              Due date: <strong>{dueDateLabel}</strong>
              <span style={{ color: '#94a3b8', marginLeft: '4px' }}>({defaultBorrowDays} day{defaultBorrowDays !== 1 ? 's' : ''} · set by policy)</span>
            </span>
          </div>

          {borrowList.length >= maxBorrow && (
            <div style={{ ...S.warnBar, marginTop: '8px' }}>
              <FaExclamationCircle style={{ flexShrink: 0 }} />
              Max {maxBorrow} books per borrower reached.
            </div>
          )}

          {borrowList.length === 0 ? (
            <div style={{ ...S.emptyState, flex: 1, minHeight: '160px' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                <FaBookOpen style={{ fontSize: '1.3rem', color: '#cbd5e1' }} />
              </div>
              <span style={{ fontWeight: 600, color: '#64748b' }}>No books yet</span>
              <span style={{ fontSize: '0.78rem', marginTop: '3px' }}>Search and click a book to add it</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              {borrowList.map((b) => (
                <div key={b.uid} style={S.borrowRow}>
                  <div style={S.borrowCover}>
                    {b.cover_image
                      ? <img src={b.cover_image} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '5px' }} />
                      : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#f1f5f9', borderRadius: '5px' }}><FaBook style={{ color: '#cbd5e1', fontSize: '1rem' }} /></div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.83rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.title}
                    </div>
                    <div style={{ fontSize: '0.71rem', color: '#64748b', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.authors || '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => openConfirm({ title: 'Remove Book', message: `Remove "${b.title}" from the borrow list?`, confirmText: 'Remove', danger: false, onConfirm: () => { closeConfirm(); removeBook(b.uid); } })}
                    style={S.removeBtn} title="Remove"
                  >
                    <FaTrash style={{ fontSize: '0.72rem' }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            {borrowList.length > 0 && (
              <button
                onClick={() => openConfirm({ title: 'Clear All', message: 'Remove all books from the list?', confirmText: 'Clear All', danger: true, onConfirm: () => { closeConfirm(); resetAll(); } })}
                style={S.clearBtn}
              >
                Clear
              </button>
            )}
            <button
              onClick={() => openConfirm({
                title: 'Issue Books',
                message: `Issue ${borrowList.length} book${borrowList.length !== 1 ? 's' : ''} to this borrower?`,
                confirmText: 'Issue', danger: false,
                onConfirm: () => { closeConfirm(); handleSubmit(); },
              })}
              disabled={submitting || borrowList.length === 0}
              style={{
                ...S.submitBtn, flex: 1,
                background: (submitting || borrowList.length === 0) ? '#94a3b8' : accentHex,
                cursor: (submitting || borrowList.length === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting
                ? <><FaSpinner className="spin" /> Issuing…</>
                : <><FaCheck /> Issue {borrowList.length > 0 ? borrowList.length : ''} Book{borrowList.length !== 1 ? 's' : ''}</>}
            </button>
          </div>
        </div>
      </div>

      {/* ══ ROW 2: Borrower Information (slides) ══ */}
      <div style={S.infoOuter}>
        {/* Header with toggle */}
        <div style={S.infoHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ ...S.numBadge, background: accentHex }}>3</div>
            <span style={{ color: accentHex, fontSize: '0.9rem' }}>
              {isTeacher ? <FaChalkboardTeacher /> : <FaGraduationCap />}
            </span>
            <h3 style={S.cardTitle}>Borrower Information</h3>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              {isTeacher ? '— Teacher / Staff' : '— Student'}
            </span>
          </div>
          {/* Toggle */}
          <div className="wi-toggle">
            <div className="wi-toggle-pill" style={{ left: isTeacher ? 'calc(50% + 2px)' : '4px', background: accentHex }} />
            <button className={`wi-toggle-btn${!isTeacher ? ' active' : ''}`} onClick={() => switchType('student')}>
              <FaGraduationCap /> Student
            </button>
            <button className={`wi-toggle-btn${isTeacher ? ' active' : ''}`} onClick={() => switchType('teacher')}>
              <FaChalkboardTeacher /> Teacher
            </button>
          </div>
        </div>

        {/* Slide container */}
        <div style={{ overflow: 'hidden', width: '100%' }}>
          <div style={{ display: 'flex', width: '200%', transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)', transform: isTeacher ? 'translateX(-50%)' : 'translateX(0%)' }}>

            {/* ─ Student form ─ */}
            <div style={{ width: '50%', minWidth: '50%', padding: '20px 22px 22px' }}>
              <div style={S.formGrid}>

                {/* LRN — full width */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel label="LRN" required hint="12 digits · auto-fills name & grade from account" icon={<FaIdCard />} />
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...S.input, fontFamily: 'monospace', letterSpacing: '0.08em', ...(studentErrors.lrn ? S.inputErr : {}) }}
                      value={studentForm.lrn} inputMode="numeric" maxLength={12}
                      onChange={e => lookupByLrn(e.target.value)} placeholder="123456789012"
                    />
                    <LookupBadge state={lrnLookupState} />
                  </div>
                  {studentErrors.lrn && <FieldError msg={studentErrors.lrn} />}
                  <LookupBanner state={lrnLookupState} linked={studentLinked}
                    name={studentLinked?.name} sub={studentLinked?.grade_section}
                    onUnlink={unlinkStudent} notFoundMsg="No account found — fill in fields manually." />
                </div>

                <div>
                  <FieldLabel label="First Name" required />
                  <input style={{ ...S.input, ...(studentErrors.firstName ? S.inputErr : {}) }}
                    value={studentForm.firstName} maxLength={50} placeholder="Juan"
                    onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setSF('firstName', capFirst(v)); }} />
                  {studentErrors.firstName && <FieldError msg={studentErrors.firstName} />}
                </div>

                <div>
                  <FieldLabel label="Last Name" required />
                  <input style={{ ...S.input, ...(studentErrors.lastName ? S.inputErr : {}) }}
                    value={studentForm.lastName} maxLength={50} placeholder="Dela Cruz"
                    onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setSF('lastName', capFirst(v)); }} />
                  {studentErrors.lastName && <FieldError msg={studentErrors.lastName} />}
                </div>

                <div style={{ maxWidth: '110px' }}>
                  <FieldLabel label="M.I." hint="Optional" />
                  <input style={S.input} value={studentForm.middleInitial} maxLength={1} placeholder="S"
                    onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setSF('middleInitial', v.toUpperCase()); }} />
                </div>

                <div>
                  <FieldLabel label="Grade Level" required />
                  <select style={{ ...S.input, ...(studentErrors.grade ? S.inputErr : {}), cursor: 'pointer' }}
                    value={studentForm.grade} onChange={e => setSF('grade', e.target.value)}>
                    <option value="">Select Grade</option>
                    {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  {studentErrors.grade && <FieldError msg={studentErrors.grade} />}
                </div>

                <div>
                  <FieldLabel label="Strand / Track" required />
                  <select style={{ ...S.input, ...(studentErrors.strand ? S.inputErr : {}), cursor: 'pointer' }}
                    value={studentForm.strand} onChange={e => setSF('strand', e.target.value)}>
                    <option value="">Select Strand</option>
                    {strands.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {studentErrors.strand && <FieldError msg={studentErrors.strand} />}
                </div>

                <div>
                  <FieldLabel label="Adviser" required />
                  <input style={{ ...S.input, ...(studentErrors.adviser ? S.inputErr : {}) }}
                    value={studentForm.adviser} maxLength={80} placeholder="Ms. Reyes"
                    onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setSF('adviser', v); }} />
                  {studentErrors.adviser && <FieldError msg={studentErrors.adviser} />}
                </div>

                <div>
                  <FieldLabel label="Contact / Email" required />
                  <input style={{ ...S.input, ...(studentErrors.contact ? S.inputErr : {}) }}
                    value={studentForm.contact} maxLength={80} placeholder="0917-123-4567"
                    onChange={e => { const v = restrict(e.target.value, EMAIL_OR_PHONE); if (v !== undefined) setSF('contact', v); }} />
                  {studentErrors.contact && <FieldError msg={studentErrors.contact} />}
                </div>

              </div>
            </div>

            {/* ─ Teacher form ─ */}
            <div style={{ width: '50%', minWidth: '50%', padding: '20px 22px 22px' }}>
              <div style={S.formGrid}>

                {/* Employee ID — full width */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel label="Employee No." required hint="Auto-fills from registered account or past records" icon={<FaIdCard />} />
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...S.input, ...(teacherErrors.employeeId ? S.inputErr : {}) }}
                      value={teacherForm.employeeId} maxLength={20} placeholder="EMP-2026-001"
                      onChange={e => { const v = restrict(e.target.value, ALPHANUMERIC); if (v !== undefined) lookupByEmployeeId(v.toUpperCase()); }}
                    />
                    <LookupBadge state={empLookupState} />
                  </div>
                  {teacherErrors.employeeId && <FieldError msg={teacherErrors.employeeId} />}
                  <LookupBanner state={empLookupState} linked={teacherLinked}
                    name={teacherLinked?.name || teacherLinked?.walk_in_name}
                    sub={teacherLinked?.position || teacherLinked?.walk_in_position}
                    onUnlink={unlinkTeacher} notFoundMsg="No record found — fill in fields manually." />
                </div>

                <div>
                  <FieldLabel label="First Name" required />
                  <input style={{ ...S.input, ...(teacherErrors.firstName ? S.inputErr : {}) }}
                    value={teacherForm.firstName} maxLength={50} placeholder="Maria"
                    onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setTF('firstName', capFirst(v)); }} />
                  {teacherErrors.firstName && <FieldError msg={teacherErrors.firstName} />}
                </div>

                <div>
                  <FieldLabel label="Last Name" required />
                  <input style={{ ...S.input, ...(teacherErrors.lastName ? S.inputErr : {}) }}
                    value={teacherForm.lastName} maxLength={50} placeholder="Reyes"
                    onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setTF('lastName', capFirst(v)); }} />
                  {teacherErrors.lastName && <FieldError msg={teacherErrors.lastName} />}
                </div>

                <div style={{ maxWidth: '110px' }}>
                  <FieldLabel label="M.I." hint="Optional" />
                  <input style={S.input} value={teacherForm.middleInitial} maxLength={1} placeholder="A"
                    onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setTF('middleInitial', v.toUpperCase()); }} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel label="Position / Designation" required />
                  <input style={{ ...S.input, ...(teacherErrors.position ? S.inputErr : {}) }}
                    value={teacherForm.position} maxLength={80} placeholder="Teacher I, Master Teacher II…"
                    onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setTF('position', v); }} />
                  {teacherErrors.position && <FieldError msg={teacherErrors.position} />}
                </div>

                <div>
                  <FieldLabel label="Track / Strand" required />
                  <select style={{ ...S.input, ...(teacherErrors.gradeSection ? S.inputErr : {}), cursor: 'pointer' }}
                    value={teacherForm.gradeSection} onChange={e => setTF('gradeSection', e.target.value)}>
                    <option value="">Select Strand</option>
                    {strands.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {teacherErrors.gradeSection && <FieldError msg={teacherErrors.gradeSection} />}
                </div>

                <div>
                  <FieldLabel label="Contact / Email" required />
                  <input style={{ ...S.input, ...(teacherErrors.contact ? S.inputErr : {}) }}
                    value={teacherForm.contact} maxLength={80} placeholder="0917-123-4567"
                    onChange={e => { const v = restrict(e.target.value, EMAIL_OR_PHONE); if (v !== undefined) setTF('contact', v); }} />
                  {teacherErrors.contact && <FieldError msg={teacherErrors.contact} />}
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════ Helper components ══════════ */

function FieldLabel({ label, required, hint, icon }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', letterSpacing: '0.01em' }}>
      {icon && <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{icon}</span>}
      {label}
      {required && <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>}
      {hint && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '2px', fontSize: '0.68rem' }}>({hint})</span>}
    </label>
  );
}

function FieldError({ msg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.7rem', color: '#ef4444' }}>
      <FaExclamationCircle style={{ fontSize: '0.65rem', flexShrink: 0 }} /> {msg}
    </div>
  );
}

function LookupBadge({ state }) {
  const map = {
    searching: { label: 'Searching…', color: '#6366f1' },
    found:     { label: 'Found ✓',    color: '#059669' },
    notfound:  { label: 'Not found',  color: '#94a3b8' },
    typing:    { label: 'Keep typing…', color: '#f59e0b' },
  };
  const info = map[state];
  if (!info) return null;
  return (
    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', fontWeight: 700, color: info.color, pointerEvents: 'none', whiteSpace: 'nowrap', background: 'white', paddingLeft: '4px' }}>
      {info.label}
    </span>
  );
}

function LookupBanner({ state, linked, name, sub, onUnlink, notFoundMsg }) {
  if (state === 'found' && linked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '9px', padding: '9px 12px', marginTop: '8px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FaCheckCircle style={{ color: '#16a34a', fontSize: '0.85rem' }} />
        </div>
        <div style={{ flex: 1, fontSize: '0.8rem', color: '#166534', minWidth: 0 }}>
          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          {sub && <div style={{ fontSize: '0.71rem', color: '#4ade80', marginTop: '1px' }}>{sub}</div>}
        </div>
        <button onClick={onUnlink} style={{ background: 'white', border: '1px solid #d1fae5', borderRadius: '7px', cursor: 'pointer', color: '#64748b', fontSize: '0.71rem', fontWeight: 600, padding: '4px 9px', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <MdClose style={{ fontSize: '0.8rem' }} /> Clear
        </button>
      </div>
    );
  }
  if (state === 'notfound') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '0.72rem', color: '#94a3b8', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '7px', padding: '7px 10px' }}>
        <FaInfoCircle style={{ flexShrink: 0 }} /> {notFoundMsg}
      </div>
    );
  }
  return null;
}

/* ─── Styles ─── */
const S = {
  page:      { padding: '4px 0', maxWidth: '1400px' },
  pageTop:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '1.3rem' },
  pageTitle: { margin: '0 0 4px', fontSize: '1.38rem', fontWeight: 800, color: 'var(--dark-blue)', display: 'flex', alignItems: 'center' },
  pageSub:   { margin: 0, fontSize: '0.83rem', color: '#64748b' },
  chip:      { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700 },

  card:       { background: 'white', borderRadius: '16px', padding: '18px 20px', border: '1px solid #e8edf2', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', paddingBottom: '13px', borderBottom: '1.5px solid #f1f5f9' },
  cardTitle:  { margin: 0, fontSize: '0.94rem', fontWeight: 800, color: 'var(--dark-blue, #1e293b)' },
  numBadge:   { width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 },

  formGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '13px' },
  input:      { width: '100%', padding: '9px 12px', borderRadius: '9px', border: '1.5px solid #e2e8f0', fontSize: '0.87rem', boxSizing: 'border-box', background: '#fafbfc', color: '#1e293b', transition: 'border-color 0.15s, box-shadow 0.15s', fontFamily: 'inherit' },
  inputErr:   { borderColor: '#fca5a5', background: '#fff5f5' },

  infoOuter:  { background: 'white', borderRadius: '16px', border: '1px solid #e8edf2', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden', marginTop: '16px' },
  infoHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '16px 20px', borderBottom: '1.5px solid #f1f5f9' },

  borrowRow:  { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: '10px' },
  borrowCover:{ width: '40px', height: '55px', flexShrink: 0, borderRadius: '5px', overflow: 'hidden' },
  removeBtn:  { background: 'transparent', border: '1px solid #fecaca', borderRadius: '7px', cursor: 'pointer', color: '#ef4444', padding: '5px 7px', flexShrink: 0, display: 'flex', alignItems: 'center', transition: 'background 0.13s' },

  submitBtn:  { padding: '11px', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'opacity 0.15s, transform 0.15s', fontFamily: 'inherit' },
  clearBtn:   { padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', background: 'white', color: '#64748b', fontWeight: 600, fontSize: '0.83rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  clearSearch:{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.9rem', display: 'flex', alignItems: 'center' },

  dueBanner:  { display: 'flex', alignItems: 'center', gap: '8px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '9px', padding: '8px 12px', marginBottom: '10px', fontSize: '0.78rem', color: '#3730a3', fontWeight: 500 },
  warnBar:    { display: 'flex', alignItems: 'center', gap: '7px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '9px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.78rem', color: '#be123c', fontWeight: 600 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px', color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center' },
};

const CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; display: inline-block; }

  /* ── Top row layout ── */
  .wi-top-row {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 16px;
    align-items: start;
  }

  /* ── Book grid inside picker ── */
  .wi-book-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    grid-auto-rows: 230px;
    gap: 10px;
    max-height: calc(230px * 2 + 10px);
    overflow-y: auto;
    padding: 2px 2px 4px;
    scrollbar-width: thin;
    scrollbar-color: #e2e8f0 transparent;
  }
  .wi-book-grid::-webkit-scrollbar { width: 5px; }
  .wi-book-grid::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }

  /* ── Book card ── */
  .wi-book-card {
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    padding: 0;
    text-align: left;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s;
    position: relative;
  }
  .wi-book-card:not(:disabled):hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0,0,0,0.1);
  }

  /* ── Toggle ── */
  .wi-toggle {
    position: relative; display: flex;
    background: #f1f5f9; border-radius: 11px; padding: 4px; flex-shrink: 0;
  }
  .wi-toggle-pill {
    position: absolute; top: 4px; bottom: 4px;
    width: calc(50% - 6px); border-radius: 8px;
    transition: left 0.25s cubic-bezier(0.4,0,0.2,1), background 0.25s;
    z-index: 0;
  }
  .wi-toggle-btn {
    position: relative; z-index: 1;
    display: flex; align-items: center; gap: 6px;
    padding: 8px 20px; border: none; background: transparent;
    border-radius: 8px; cursor: pointer; font-weight: 700;
    font-size: 0.84rem; color: #64748b;
    transition: color 0.2s; white-space: nowrap; font-family: inherit;
  }
  .wi-toggle-btn.active { color: white; }

  /* ── Focus ── */
  input:focus, select:focus {
    outline: none;
    border-color: #6366f1 !important;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.13) !important;
    background: white !important;
  }

  /* ── Responsive ── */
  @media (max-width: 960px) {
    .wi-top-row { grid-template-columns: 1fr; }
    .wi-book-grid { grid-template-columns: repeat(4, 1fr); }
  }
  @media (max-width: 600px) {
    .wi-book-grid { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 200px; max-height: calc(200px * 2 + 10px); }
    .wi-toggle-btn { padding: 8px 12px; font-size: 0.78rem; }
  }
`;