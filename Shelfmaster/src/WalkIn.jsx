import React, { useEffect, useState, useMemo } from 'react';
import { localDbAdmin } from './localDbAdmin';
import Toast from './Toast';
import ConfirmModal from './ConfirmModal';
import {
  FaBookOpen, FaChalkboardTeacher, FaCheck, FaGraduationCap,
  FaSearch, FaTrash, FaClipboardList, FaInfoCircle,
  FaExclamationCircle, FaCheckCircle, FaSpinner, FaBook,
} from 'react-icons/fa';
import { MdClose } from 'react-icons/md';

/* ─── Input restrictions ─── */
const ALPHA_ONLY     = /^[a-zA-ZÀ-ÿñÑ\s\-'.]*$/;
const ALPHANUMERIC   = /^[a-zA-Z0-9\s\-_.]*$/;
const EMAIL_OR_PHONE = /^[a-zA-Z0-9@.\-+_()\s]*$/;
const restrict = (value, pattern) => pattern.test(value) ? value : undefined;
const capFirst = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const DEFAULT_STRANDS = ['STEM', 'HUMSS', 'ABM', 'GAS', 'TVL - Industrial Arts', 'TVL - Home Economics', 'TVL - ICT', 'TVL - Agri-Fishery Arts', 'Sports', 'Arts & Design'];
const GRADE_LEVELS = ['Grade 11', 'Grade 12'];

const parseCombinedGS = (combined) => {
  if (!combined) return { grade: '', strand: '', section: '' };
  const parts = combined.split(' - ');
  if (parts.length >= 3) return { grade: parts[0].trim(), strand: parts[1].trim(), section: parts.slice(2).join(' - ').trim() };
  if (parts.length === 2) return { grade: parts[0].trim(), strand: '', section: parts[1].trim() };
  return { grade: '', strand: '', section: combined.trim() };
};

const EMPTY_STUDENT = { firstName: '', lastName: '', middleInitial: '', grade: '', strand: '', lrn: '', adviser: '', contact: '' };
const EMPTY_TEACHER = { firstName: '', lastName: '', middleInitial: '', employeeId: '', position: '', gradeSection: '', contact: '' };

export default function WalkIn() {
  const [borrowerType, setBorrowerType] = useState('student');
  const [toast, setToast]               = useState({ message: '', type: 'success' });
  const showToast = (msg, type = 'success') => setToast({ message: msg, type });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, danger: false, confirmText: 'Confirm' });
  const openConfirm = (opts) => setConfirmModal({ isOpen: true, ...opts });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, isOpen: false }));

  const [strands, setStrands] = useState(DEFAULT_STRANDS);
  const [books, setBooks]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [booksLoaded, setBooksLoaded] = useState(false);

  const [studentForm, setStudentForm]       = useState(EMPTY_STUDENT);
  const [studentLinked, setStudentLinked]   = useState(null);
  const [lrnLookupState, setLrnLookupState] = useState('idle');

  const [teacherForm, setTeacherForm]       = useState(EMPTY_TEACHER);
  const [teacherLinked, setTeacherLinked]   = useState(null);
  const [empLookupState, setEmpLookupState] = useState('idle');

  const [bookQuery, setBookQuery]   = useState('');
  const [borrowList, setBorrowList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [defaultBorrowDays, setDefaultBorrowDays] = useState(7);
  const [maxBorrow, setMaxBorrow] = useState(3);

  const [studentErrors, setStudentErrors] = useState({});
  const [teacherErrors, setTeacherErrors] = useState({});

  /* ── Load settings ── */
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
          try { const arr = JSON.parse(data.strands); if (Array.isArray(arr) && arr.length) setStrands(arr); } catch { /* keep default */ }
        }
      });
  }, []);

  /* ── Load books once ── */
  useEffect(() => {
    if (booksLoaded) return;
    setLoading(true);
    setBooksLoaded(true);
    localDbAdmin.from('books')
      .select('id, title, authors, barcode, accession_num, quantity, book_type, status, cover_image, category')
      .eq('status', 'active')
      .order('title', { ascending: true })
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

  /* ── Switch type ── */
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
      const parts = (data.name || '').split(' ');
      const gs = parseCombinedGS(data.grade_section);
      setStudentForm(f => ({
        ...f, lrn: clean,
        firstName: parts[0] || f.firstName,
        lastName:  parts[parts.length - 1] || f.lastName,
        grade:     gs.grade || f.grade,
        strand:    gs.strand || f.strand,
        section:   gs.section || f.section,
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

  /* ── Employee lookup ── */
  const lookupByEmployeeId = async (empId) => {
    setTeacherForm(f => ({ ...f, employeeId: empId }));
    if (!empId.trim()) { setTeacherLinked(null); setEmpLookupState('idle'); return; }
    setEmpLookupState('searching');

    const { data: userData } = await localDbAdmin.from('users')
      .select('id, name, student_id, grade_section')
      .eq('student_id', empId.trim())
      .eq('role', 'teacher')
      .limit(1).maybeSingle();

    if (userData) {
      setTeacherLinked(userData);
      setEmpLookupState('found');
      const parts = (userData.name || '').split(' ');
      setTeacherForm(f => ({
        ...f,
        employeeId:   empId,
        firstName:    parts[0] || f.firstName,
        lastName:     parts[parts.length - 1] || f.lastName,
        gradeSection: userData.grade_section || f.gradeSection,
      }));
      return;
    }

    const { data: txnData } = await localDbAdmin.from('transactions')
      .select('walk_in_name, walk_in_employee_id, walk_in_department, walk_in_grade_section, walk_in_contact')
      .eq('walk_in_employee_id', empId.trim())
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (txnData) {
      setTeacherLinked(txnData);
      setEmpLookupState('found');
      const parts = (txnData.walk_in_name || '').split(' ');
      setTeacherForm(f => ({
        ...f,
        employeeId:   empId,
        firstName:    parts[0] || f.firstName,
        lastName:     parts[parts.length - 1] || f.lastName,
        gradeSection: txnData.walk_in_grade_section || f.gradeSection,
        contact:      txnData.walk_in_contact || f.contact,
      }));
      return;
    }

    setTeacherLinked(null);
    setEmpLookupState('notfound');
  };

  const unlinkTeacher = () => {
    setTeacherLinked(null); setEmpLookupState('idle');
    setTeacherForm({ ...EMPTY_TEACHER, employeeId: teacherForm.employeeId });
  };

  /* ── Books ── */
  const addBook = (b) => {
    if (borrowList.length >= maxBorrow) {
      showToast(`Borrowers are limited to ${maxBorrow} books per transaction.`, 'error');
      return;
    }
    if (b.quantity <= 0) { showToast(`"${b.title}" has no available copies.`, 'error'); return; }
    const already = borrowList.filter(sb => sb.id === b.id).length;
    if (already >= 1) { showToast(`"${b.title}" is already in the borrow list. Only 1 copy per book is allowed.`, 'error'); return; }
    const uid = `${b.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setBorrowList(prev => [...prev, { ...b, days: defaultBorrowDays, uid }]);
  };
  const removeBook = (uid) => setBorrowList(prev => prev.filter(b => b.uid !== uid));
  const updateDays = (uid, days) =>
    setBorrowList(prev => prev.map(b => b.uid === uid ? { ...b, days: Math.max(1, parseInt(days) || 1) } : b));

  /* ── Validation ── */
  const validateStudent = () => {
    const e = {};
    if (!studentForm.firstName.trim())             e.firstName = 'First name is required';
    if (!studentForm.lastName.trim())              e.lastName  = 'Last name is required';
    if (!/^\d{12}$/.test(studentForm.lrn.trim())) e.lrn       = 'LRN must be exactly 12 digits';
    if (!studentForm.grade)                        e.grade   = 'Grade level is required';
    if (!studentForm.strand)                       e.strand  = 'Strand is required';
    if (!studentForm.adviser.trim())               e.adviser = 'Adviser name is required';
    if (!studentForm.contact.trim())               e.contact   = 'Contact is required';
    setStudentErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateTeacher = () => {
    const e = {};
    if (!teacherForm.firstName.trim())    e.firstName    = 'First name is required';
    if (!teacherForm.lastName.trim())     e.lastName     = 'Last name is required';
    if (!teacherForm.employeeId.trim())   e.employeeId   = 'Employee No. is required';
    if (!teacherForm.position.trim())     e.position     = 'Position is required';
    if (!teacherForm.gradeSection.trim()) e.gradeSection = 'Track / Strand is required';
    if (!teacherForm.contact.trim())      e.contact      = 'Contact is required';
    setTeacherErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Submit ── */
  const assignAvailableCopy = async (bookId) => {
    const { data, error } = await localDbAdmin.from('book_copies')
      .select('id, accession_id, copy_number')
      .eq('book_id', bookId).eq('status', 'available')
      .order('copy_number', { ascending: true }).limit(1).maybeSingle();
    if (error && error.code !== '42P01') return null;
    return data || null;
  };

  const buildFullName = (f) =>
    `${f.firstName.trim()}${f.middleInitial.trim() ? ' ' + f.middleInitial.trim().toUpperCase() + '.' : ''} ${f.lastName.trim()}`.trim();

  const handleSubmit = async () => {
    const isTeacher = borrowerType === 'teacher';
    const valid = isTeacher ? validateTeacher() : validateStudent();
    if (!valid) { showToast('Please fix the highlighted fields.', 'error'); return; }
    if (borrowList.length === 0) { showToast('Please add at least one book.', 'error'); return; }

    setSubmitting(true);
    try {
      const borrowDate = new Date().toISOString();
      let success = 0;
      const failures = [];

      for (const book of borrowList) {
        try {
          const { data: freshBook, error: bErr } = await localDbAdmin.from('books').select('quantity').eq('id', book.id).single();
          if (bErr) throw bErr;
          if ((freshBook?.quantity || 0) <= 0) { failures.push(`${book.title} — no copies left`); continue; }

          const copy    = await assignAvailableCopy(book.id);
          const dueDate = isTeacher ? null : new Date(Date.now() + book.days * 86400000).toISOString();

          const payload = {
            user_id: studentLinked?.id || null,
            book_id: book.id, status: 'borrowed',
            borrow_date: borrowDate, due_date: dueDate, copy_id: copy?.id || null,
          };

          if (isTeacher) {
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
        } catch (err) {
          console.error(err); failures.push(`${book.title} — ${err.message}`);
        }
      }

      const name = isTeacher
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

  /* ══════════════════════════════ RENDER ══════════════════════════════ */

  const isTeacher = borrowerType === 'teacher';
  const accentColor = isTeacher ? 'var(--maroon, #7f1d1d)' : 'var(--green, #166534)';

  const setSF = (key, val) => { setStudentForm(f => ({ ...f, [key]: val })); setStudentErrors(e => ({ ...e, [key]: '' })); };
  const setTF = (key, val) => { setTeacherForm(f => ({ ...f, [key]: val })); setTeacherErrors(e => ({ ...e, [key]: '' })); };

  return (
    <div style={S.page}>
      <Toast {...toast} onClose={() => setToast({ message: '' })} />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        danger={confirmModal.danger}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
      <style>{CSS}</style>

      {/* ══ Header row ══ */}
      <div style={S.pageTop}>
        <div>
          <h1 style={S.pageTitle}>Walk-in Borrowing</h1>
          <p style={S.pageSub}>Issue books in person — switch borrower type anytime</p>
        </div>

        {/* ── Sliding pill toggle ── */}
        <div className="walkin-toggle">
          <div
            className="walkin-toggle-pill"
            style={{
              left: isTeacher ? 'calc(50% + 2px)' : '4px',
              background: accentColor,
            }}
          />
          <button
            className={`walkin-toggle-btn${!isTeacher ? ' active' : ''}`}
            onClick={() => switchType('student')}
          >
            <FaGraduationCap />
            Student
          </button>
          <button
            className={`walkin-toggle-btn${isTeacher ? ' active' : ''}`}
            onClick={() => switchType('teacher')}
          >
            <FaChalkboardTeacher />
            Teacher
          </button>
        </div>
      </div>

      {/* ══ Sliding panels ══ */}
      <div style={S.slideOuter}>
        <div style={{ ...S.slideTrack, transform: isTeacher ? 'translateX(-50%)' : 'translateX(0%)' }}>

          {/* ─ STUDENT PANEL ─ */}
          <div style={S.slidePanel}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* TOP: Student form — full width */}
              <div style={S.card}>
                <SectionHeader num="1" icon={<FaGraduationCap />}
                  title="Student Information" color="var(--green, #166534)" />
                <div style={S.formGrid}>
                  {/* LRN */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldLabel label="LRN" required hint="12 digits — auto-fills from account" />
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...S.input, fontFamily: 'monospace', letterSpacing: '0.06em', ...(studentErrors.lrn ? S.inputErr : {}) }}
                        value={studentForm.lrn} inputMode="numeric" maxLength={12}
                        onChange={e => lookupByLrn(e.target.value)}
                        placeholder="123456789012" />
                      <LookupBadge state={lrnLookupState} />
                    </div>
                    {studentErrors.lrn && <FieldError msg={studentErrors.lrn} />}
                    <LookupBanner state={lrnLookupState} linked={studentLinked}
                      name={studentLinked?.name} sub={studentLinked?.grade_section}
                      onUnlink={unlinkStudent}
                      notFoundMsg="No registered account — fill in manually." />
                  </div>

                  {/* Name row */}
                  <div>
                    <FieldLabel label="First Name" required />
                    <input style={{ ...S.input, ...(studentErrors.firstName ? S.inputErr : {}) }}
                      value={studentForm.firstName} maxLength={50}
                      onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setSF('firstName', capFirst(v)); }}
                      placeholder="Juan" />
                    {studentErrors.firstName && <FieldError msg={studentErrors.firstName} />}
                  </div>
                  <div>
                    <FieldLabel label="Last Name" required />
                    <input style={{ ...S.input, ...(studentErrors.lastName ? S.inputErr : {}) }}
                      value={studentForm.lastName} maxLength={50}
                      onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setSF('lastName', capFirst(v)); }}
                      placeholder="Dela Cruz" />
                    {studentErrors.lastName && <FieldError msg={studentErrors.lastName} />}
                  </div>
                  <div style={{ maxWidth: '110px' }}>
                    <FieldLabel label="M.I." hint="Optional" />
                    <input style={S.input} value={studentForm.middleInitial} maxLength={1}
                      onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setSF('middleInitial', v.toUpperCase()); }}
                      placeholder="S" />
                  </div>

                  {/* Grade / Strand / Section */}
                  <div>
                    <FieldLabel label="Grade Level" required />
                    <select style={{ ...S.input, ...(studentErrors.grade ? S.inputErr : {}), cursor: 'pointer' }}
                      value={studentForm.grade}
                      onChange={e => setSF('grade', e.target.value)}>
                      <option value="">Select Grade</option>
                      {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    {studentErrors.grade && <FieldError msg={studentErrors.grade} />}
                  </div>
                  <div>
                    <FieldLabel label="Strand / Track" required />
                    <select style={{ ...S.input, ...(studentErrors.strand ? S.inputErr : {}), cursor: 'pointer' }}
                      value={studentForm.strand}
                      onChange={e => setSF('strand', e.target.value)}>
                      <option value="">Select Strand</option>
                      {strands.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {studentErrors.strand && <FieldError msg={studentErrors.strand} />}
                  </div>

                  <div>
                    <FieldLabel label="Adviser" required />
                    <input style={{ ...S.input, ...(studentErrors.adviser ? S.inputErr : {}) }}
                      value={studentForm.adviser} maxLength={80}
                      onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setSF('adviser', v); }}
                      placeholder="e.g. Ms. Reyes" />
                    {studentErrors.adviser && <FieldError msg={studentErrors.adviser} />}
                  </div>
                  <div>
                    <FieldLabel label="Contact / Email" required />
                    <input style={{ ...S.input, ...(studentErrors.contact ? S.inputErr : {}) }}
                      value={studentForm.contact} maxLength={80}
                      onChange={e => { const v = restrict(e.target.value, EMAIL_OR_PHONE); if (v !== undefined) setSF('contact', v); }}
                      placeholder="0917-123-4567 or juan@email.com" />
                    {studentErrors.contact && <FieldError msg={studentErrors.contact} />}
                  </div>
                </div>
              </div>

              {/* BOTTOM: Book picker + Borrow list side by side */}
              <div className="walkin-two-col">
                <BookPicker
                  loading={loading} bookQuery={bookQuery} setBookQuery={setBookQuery}
                  filteredBooks={filteredBooks} inListCounts={inListCounts} addBook={addBook}
                  accentColor="var(--green, #166534)"
                  maxReached={borrowList.length >= maxBorrow}
                />
                <BorrowListCard
                  borrowList={borrowList} removeBook={removeBook} updateDays={updateDays}
                  isTeacher={false} submitting={submitting}
                  handleSubmit={handleSubmit} resetAll={resetAll}
                  accentColor="var(--green, #166634)"
                  openConfirm={openConfirm} closeConfirm={closeConfirm}
                  maxBorrow={maxBorrow}
                />
              </div>

            </div>
          </div>

          {/* ─ TEACHER PANEL ─ */}
          <div style={S.slidePanel}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* TOP: Teacher form — full width */}
              <div style={S.card}>
                <SectionHeader num="1" icon={<FaChalkboardTeacher />}
                  title="Teacher Information" color="var(--maroon, #7f1d1d)" />
                <div style={S.formGrid}>
                  {/* Employee ID */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldLabel label="Employee No." required hint="Auto-fills from account or previous records" />
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...S.input, ...(teacherErrors.employeeId ? S.inputErr : {}) }}
                        value={teacherForm.employeeId} maxLength={20}
                        onChange={e => { const v = restrict(e.target.value, ALPHANUMERIC); if (v !== undefined) lookupByEmployeeId(v.toUpperCase()); }}
                        placeholder="e.g. EMP-2026-001" />
                      <LookupBadge state={empLookupState} />
                    </div>
                    {teacherErrors.employeeId && <FieldError msg={teacherErrors.employeeId} />}
                    <LookupBanner state={empLookupState} linked={teacherLinked}
                      name={teacherLinked?.name || teacherLinked?.walk_in_name}
                      sub={teacherLinked?.position || teacherLinked?.walk_in_position}
                      onUnlink={unlinkTeacher} notFoundMsg="No previous record — fill in manually." />
                  </div>

                  {/* Name */}
                  <div>
                    <FieldLabel label="First Name" required />
                    <input style={{ ...S.input, ...(teacherErrors.firstName ? S.inputErr : {}) }}
                      value={teacherForm.firstName} maxLength={50}
                      onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setTF('firstName', capFirst(v)); }}
                      placeholder="Maria" />
                    {teacherErrors.firstName && <FieldError msg={teacherErrors.firstName} />}
                  </div>
                  <div>
                    <FieldLabel label="Last Name" required />
                    <input style={{ ...S.input, ...(teacherErrors.lastName ? S.inputErr : {}) }}
                      value={teacherForm.lastName} maxLength={50}
                      onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setTF('lastName', capFirst(v)); }}
                      placeholder="Reyes" />
                    {teacherErrors.lastName && <FieldError msg={teacherErrors.lastName} />}
                  </div>
                  <div style={{ maxWidth: '110px' }}>
                    <FieldLabel label="M.I." hint="Optional" />
                    <input style={S.input} value={teacherForm.middleInitial} maxLength={1}
                      onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setTF('middleInitial', v.toUpperCase()); }}
                      placeholder="A" />
                  </div>

                  {/* Position */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldLabel label="Position / Designation" required />
                    <input style={{ ...S.input, ...(teacherErrors.position ? S.inputErr : {}) }}
                      value={teacherForm.position} maxLength={80}
                      onChange={e => { const v = restrict(e.target.value, ALPHA_ONLY); if (v !== undefined) setTF('position', v); }}
                      placeholder="e.g. Teacher I, Master Teacher II" />
                    {teacherErrors.position && <FieldError msg={teacherErrors.position} />}
                  </div>

                  <div>
                    <FieldLabel label="Track / Strand" required />
                    <select style={{ ...S.input, ...(teacherErrors.gradeSection ? S.inputErr : {}), cursor: 'pointer' }}
                      value={teacherForm.gradeSection}
                      onChange={e => setTF('gradeSection', e.target.value)}>
                      <option value="">Select Strand</option>
                      {strands.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {teacherErrors.gradeSection && <FieldError msg={teacherErrors.gradeSection} />}
                  </div>
                  <div>
                    <FieldLabel label="Contact / Email" required />
                    <input style={{ ...S.input, ...(teacherErrors.contact ? S.inputErr : {}) }}
                      value={teacherForm.contact} maxLength={80}
                      onChange={e => { const v = restrict(e.target.value, EMAIL_OR_PHONE); if (v !== undefined) setTF('contact', v); }}
                      placeholder="0917-123-4567 or email@school.edu" />
                    {teacherErrors.contact && <FieldError msg={teacherErrors.contact} />}
                  </div>
                </div>
              </div>

              {/* BOTTOM: Book picker + Borrow list side by side */}
              <div className="walkin-two-col">
                <BookPicker
                  loading={loading} bookQuery={bookQuery} setBookQuery={setBookQuery}
                  filteredBooks={filteredBooks} inListCounts={inListCounts} addBook={addBook}
                  accentColor="var(--maroon, #7f1d1d)"
                  maxReached={borrowList.length >= maxBorrow}
                />
                <BorrowListCard
                  borrowList={borrowList} removeBook={removeBook} updateDays={updateDays}
                  isTeacher={true} submitting={submitting}
                  handleSubmit={handleSubmit} resetAll={resetAll}
                  accentColor="var(--maroon, #7f1d1d)"
                  openConfirm={openConfirm} closeConfirm={closeConfirm}
                  maxBorrow={maxBorrow}
                />
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ══════════════════ Shared sub-components ══════════════════ */

function BorrowListCard({ borrowList, removeBook, updateDays, isTeacher, submitting, handleSubmit, resetAll, accentColor, openConfirm, closeConfirm, maxBorrow }) {
  const atLimit = borrowList.length >= maxBorrow;
  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', paddingBottom: '11px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '25px', height: '25px', borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.73rem', fontWeight: 800, flexShrink: 0 }}>3</div>
          <span style={{ color: '#6366f1', fontSize: '0.86rem', flexShrink: 0 }}><FaClipboardList /></span>
          <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700, color: 'var(--dark-blue)' }}>Borrow List</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: atLimit ? '#fee2e2' : '#f1f5f9', borderRadius: '999px', padding: '3px 10px', border: `1.5px solid ${atLimit ? '#fca5a5' : '#e2e8f0'}` }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: atLimit ? '#dc2626' : '#475569' }}>{borrowList.length}/{maxBorrow}</span>
          <span style={{ fontSize: '0.7rem', color: atLimit ? '#ef4444' : '#94a3b8' }}>books</span>
        </div>
      </div>
      {atLimit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.78rem', color: '#be123c', fontWeight: 600 }}>
          <FaExclamationCircle style={{ flexShrink: 0 }} /> Limit reached — max {maxBorrow} books per borrower.
        </div>
      )}

      {borrowList.length === 0 ? (
        <div style={S.emptyState}>
          <FaBookOpen style={{ fontSize: '2rem', color: '#cbd5e1', marginBottom: '8px' }} />
          <span>No books added yet — search and tap a book to add.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {borrowList.map((b, idx) => {
            const sameIdx   = borrowList.filter((x, i) => x.id === b.id && i <= idx).length;
            const sameTotal = borrowList.filter(x => x.id === b.id).length;
            return (
              <div key={b.uid} style={S.borrowRow}>
                <div style={S.borrowCover}>
                  {b.cover_image
                    ? <img src={b.cover_image} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '5px' }} />
                    : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}><FaBook style={{ color: '#cbd5e1', fontSize: '1.1rem' }} /></div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--dark-blue)', fontSize: '0.86rem', lineHeight: 1.3 }}>
                    {b.title}
                    {sameTotal > 1 && <span style={{ marginLeft: '6px', fontSize: '0.69rem', color: 'var(--green)', fontWeight: 700 }}>copy {sameIdx}/{sameTotal}</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>{b.authors || '—'}</div>
                  {!isTeacher && (
                    <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.71rem', color: '#475569', fontWeight: 600 }}>Days:</span>
                      <input type="number" min={1} max={365} value={b.days}
                        onChange={e => updateDays(b.uid, e.target.value)}
                        style={{ ...S.input, width: '66px', padding: '4px 8px', textAlign: 'center', fontSize: '0.81rem' }} />
                      <span style={{ fontSize: '0.69rem', color: '#94a3b8' }}>
                        Due: <strong style={{ color: '#334155' }}>
                          {new Date(Date.now() + b.days * 86400000).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
                <button onClick={() => openConfirm({
                    title: 'Remove Book',
                    message: `Remove "${b.title}" from the borrow list?`,
                    confirmText: 'Remove',
                    danger: false,
                    onConfirm: () => { closeConfirm(); removeBook(b.uid); },
                  })} style={S.removeBtn} title="Remove">
                  <FaTrash style={{ fontSize: '0.75rem' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isTeacher && (
        <div style={S.infoBox}>
          <FaInfoCircle style={{ flexShrink: 0, marginTop: '2px' }} />
          Teachers borrow with <strong>no due date</strong>.
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
        {borrowList.length > 0 && (
          <button onClick={() => openConfirm({
              title: 'Clear All Books',
              message: 'Remove all books from the borrow list?',
              confirmText: 'Clear All',
              danger: true,
              onConfirm: () => { closeConfirm(); resetAll(); },
            })} style={S.clearBtn}>Clear all</button>
        )}
        <button
          onClick={() => openConfirm({
            title: 'Issue Books',
            message: `Issue ${borrowList.length} book${borrowList.length !== 1 ? 's' : ''} to this borrower?`,
            confirmText: 'Issue',
            danger: false,
            onConfirm: () => { closeConfirm(); handleSubmit(); },
          })}
          disabled={submitting || borrowList.length === 0}
          style={{
            ...S.submitBtn, flex: 1,
            background: submitting || borrowList.length === 0 ? '#94a3b8' : accentColor,
            cursor: submitting || borrowList.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting
            ? <><FaSpinner className="spin" /> Issuing…</>
            : <><FaCheck /> Issue {borrowList.length || ''} Book{borrowList.length !== 1 ? 's' : ''}</>}
        </button>
      </div>
    </div>
  );
}

function BookPicker({ loading, bookQuery, setBookQuery, filteredBooks, inListCounts, addBook, accentColor, maxReached }) {
  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column' }}>
      <SectionHeader num="2" icon={<FaSearch />} title="Pick Books" color="#f59e0b" />

      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.8rem', pointerEvents: 'none' }} />
        <input
          style={{ ...S.input, paddingLeft: '36px', paddingRight: bookQuery ? '36px' : '12px' }}
          placeholder="Search title, author, category, barcode…"
          value={bookQuery}
          onChange={e => setBookQuery(e.target.value)}
        />
        {bookQuery && (
          <button onClick={() => setBookQuery('')} style={S.clearSearch}><MdClose /></button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '200px', gap: '10px' }}>
          <FaSpinner className="spin" style={{ fontSize: '1.6rem', color: accentColor }} />
          <span style={{ fontSize: '0.84rem', color: '#94a3b8' }}>Loading books…</span>
        </div>
      ) : (
        <div style={S.bookGrid}>
          {filteredBooks.length === 0 ? (
            <div style={{ ...S.emptyState, gridColumn: '1 / -1' }}>
              <FaSearch style={{ fontSize: '1.8rem', color: '#cbd5e1', marginBottom: '8px' }} />
              <span>No books match your search.</span>
            </div>
          ) : filteredBooks.map(b => {
            const inCart    = inListCounts.get(b.id) || 0;
            const remaining = Math.max(0, b.quantity - inCart);
            const disabled  = remaining <= 0 || maxReached;
            return (
              <button key={b.id} onClick={() => addBook(b)} disabled={disabled}
                className="book-card"
                style={{
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  borderColor: inCart > 0 ? 'var(--green, #166534)' : '#e2e8f0',
                  outline: inCart > 0 ? '2px solid #d1fae5' : 'none',
                }}
              >
                {inCart > 0 && <div style={S.cartBadge}>{inCart}</div>}
                <div style={S.coverWrap}>
                  {b.cover_image
                    ? <img src={b.cover_image} alt={b.title} style={S.coverImg} onError={e => { e.target.style.display = 'none'; }} />
                    : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaBook style={{ color: '#cbd5e1', fontSize: '1.8rem' }} /></div>}
                  {inCart > 0 && <div style={S.addedOverlay}><FaCheck /></div>}
                </div>
                <div style={{ padding: '8px 8px 10px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--dark-blue)', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.35em' }}>
                    {b.title}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.authors || '—'}
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: remaining > 0 ? '#059669' : '#ef4444', background: remaining > 0 ? '#d1fae5' : '#fee2e2', padding: '2px 6px', borderRadius: '999px' }}>
                      {remaining > 0 ? `${remaining} avail.` : 'Out of stock'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ num, icon, title, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', paddingBottom: '11px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: '25px', height: '25px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.73rem', fontWeight: 800, flexShrink: 0 }}>
        {num}
      </div>
      <span style={{ color, fontSize: '0.86rem', flexShrink: 0 }}>{icon}</span>
      <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700, color: 'var(--dark-blue)' }}>{title}</h3>
    </div>
  );
}

function FieldLabel({ label, required, hint }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>
      {label}
      {required && <span style={{ color: '#ef4444' }}>*</span>}
      {hint && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '2px' }}>({hint})</span>}
    </label>
  );
}

function FieldError({ msg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.7rem', color: '#ef4444' }}>
      <FaExclamationCircle style={{ fontSize: '0.67rem' }} /> {msg}
    </div>
  );
}

function LookupBadge({ state }) {
  const map = {
    searching: { label: 'Searching…', color: '#6366f1' },
    found:     { label: 'Found',      color: '#059669' },
    notfound:  { label: 'Not found',  color: '#94a3b8' },
    typing:    { label: 'Keep typing…', color: '#f59e0b' },
  };
  const info = map[state];
  if (!info) return null;
  return (
    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.67rem', fontWeight: 700, color: info.color, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      {state === 'found' && <FaCheckCircle style={{ marginRight: '3px', fontSize: '0.67rem' }} />}
      {info.label}
    </span>
  );
}

function LookupBanner({ state, linked, name, sub, onUnlink, notFoundMsg }) {
  if (state === 'found' && linked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '9px 12px', marginTop: '8px' }}>
        <FaCheckCircle style={{ color: '#059669', flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: '0.8rem', color: '#166534' }}>
          <strong>{name}</strong>{sub ? ` · ${sub}` : ''} — auto-filled
        </div>
        <button onClick={onUnlink} style={{ background: 'none', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '0.73rem', fontWeight: 600, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MdClose style={{ fontSize: '0.78rem' }} /> Clear
        </button>
      </div>
    );
  }
  if (state === 'notfound') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '0.73rem', color: '#94a3b8' }}>
        <FaInfoCircle /> {notFoundMsg}
      </div>
    );
  }
  return null;
}

/* ─── Style objects ─── */

const S = {
  page:      { padding: '4px 0', maxWidth: '1400px' },
  pageTop:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '1.4rem' },
  pageTitle: { margin: '0 0 3px', fontSize: '1.38rem', fontWeight: 800, color: 'var(--dark-blue)' },
  pageSub:   { margin: 0, fontSize: '0.83rem', color: '#64748b' },

  slideOuter: { overflow: 'hidden', width: '100%' },
  slideTrack: { display: 'flex', width: '200%', transition: 'transform 0.30s cubic-bezier(0.4, 0, 0.2, 1)', willChange: 'transform' },
  slidePanel: { width: '50%', minWidth: '50%', paddingRight: '1px' },

  card:     { background: 'white', borderRadius: '14px', padding: '20px', border: '1px solid #e8edf2', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '12px' },

  input:    { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.87rem', boxSizing: 'border-box', background: '#fafbfc', color: '#1e293b', transition: 'border-color 0.15s' },
  inputErr: { borderColor: '#fca5a5', background: '#fff5f5' },

  bookGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(125px, 1fr))', gap: '10px', maxHeight: '66vh', overflowY: 'auto', padding: '2px' },
  coverWrap:   { width: '100%', paddingTop: '140%', position: 'relative', background: '#f1f5f9' },
  coverImg:    { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  cartBadge:   { position: 'absolute', top: '6px', right: '6px', background: 'var(--green, #166534)', color: 'white', borderRadius: '999px', minWidth: '21px', height: '21px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, zIndex: 2, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' },
  addedOverlay:{ position: 'absolute', inset: 0, background: 'rgba(22,163,74,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', fontSize: '1.3rem' },

  borrowRow:   { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', background: '#f8fafc', border: '1px solid #e8edf2', borderRadius: '9px' },
  borrowCover: { width: '42px', height: '58px', flexShrink: 0, borderRadius: '5px', overflow: 'hidden', background: '#f1f5f9' },
  removeBtn:   { background: 'transparent', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', color: '#ef4444', padding: '5px 7px', flexShrink: 0, display: 'flex', alignItems: 'center' },

  submitBtn:   { padding: '12px', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'opacity 0.15s' },
  clearBtn:    { padding: '12px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', background: 'white', color: '#64748b', fontWeight: 600, fontSize: '0.84rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  clearSearch: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.95rem', display: 'flex', alignItems: 'center' },

  emptyState:  { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '26px', color: '#94a3b8', fontSize: '0.83rem', textAlign: 'center' },
  infoBox:     { display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '9px 13px', color: '#92400e', fontSize: '0.81rem', marginTop: '13px' },
};

const CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; display: inline-block; }

  .walkin-toggle {
    position: relative;
    display: flex;
    background: #f1f5f9;
    border-radius: 12px;
    padding: 4px;
    flex-shrink: 0;
  }
  .walkin-toggle-pill {
    position: absolute;
    top: 4px;
    bottom: 4px;
    width: calc(50% - 6px);
    border-radius: 9px;
    transition: left 0.25s cubic-bezier(0.4,0,0.2,1), background 0.25s;
    z-index: 0;
  }
  .walkin-toggle-btn {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 22px;
    border: none;
    background: transparent;
    border-radius: 9px;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.87rem;
    color: #64748b;
    transition: color 0.2s;
    white-space: nowrap;
  }
  .walkin-toggle-btn.active { color: white; }

  .walkin-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    align-items: start;
  }

  .book-card {
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    padding: 0;
    text-align: left;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.13s, box-shadow 0.13s;
    position: relative;
  }
  .book-card:not(:disabled):hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0,0,0,0.10);
  }

  input:focus {
    outline: none;
    border-color: #6366f1 !important;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
    background: white !important;
  }

  @media (max-width: 860px) {
    .walkin-two-col { grid-template-columns: 1fr !important; }
  }
`;