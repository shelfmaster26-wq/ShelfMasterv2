import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { localDb } from './localDbClient';
import { localDbAdmin } from './localDbAdmin';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Toast from './Toast';
import ConfirmModal from './ConfirmModal';
import {
  FaArchive, FaBook, FaBookOpen, FaCheckCircle, FaClipboardList, FaClock,
  FaExclamationTriangle, FaInfoCircle, FaRecycle, FaTrash, FaSearch,
  FaFileCsv, FaFilePdf, FaFilter, FaChevronDown, FaDownload,
} from 'react-icons/fa';
import { MdClose } from 'react-icons/md';

/* ─── Design tokens ─── */
const P = {
  ivory:    '#F9F7F2',
  ivoryDk:  '#F1EDE3',
  border:   '#E8E2D7',
  muted:    '#8C8070',
  text:     '#2A2118',
  textSoft: '#6B5F52',
};
const card = { background: '#fff', border: `1px solid ${P.border}`, borderRadius: 16, padding: 24 };

/* ─── FIX: explicit FK hints so Supabase resolves joins unambiguously ─── */
const TX_SELECT = `
  id, status, borrow_date, due_date, return_date, processed_by_user_id,
  walk_in_borrowers!walk_in_borrower_id(name,lrn,grade_section,contact,employee_id,position,teacher),
  users!user_id(name,student_profiles(lrn,student_id,grade_section)),
  processed_by_user:users!processed_by_user_id(name,role),
  books(title),
  book_copies(accession_id,copy_number),
  fines!fine_id(id,amount,status,overdue_days)
`.replace(/\s+/g, ' ').trim();

/* Fallback select used when processed_by_user_id column doesn't exist yet */
const TX_SELECT_FALLBACK = `
  id, status, borrow_date, due_date, return_date,
  walk_in_borrowers!walk_in_borrower_id(name,lrn,grade_section,contact,employee_id,position,teacher),
  users!user_id(name,student_profiles(lrn,student_id,grade_section)),
  books(title),
  book_copies(accession_id,copy_number),
  fines!fine_id(id,amount,status,overdue_days)
`.replace(/\s+/g, ' ').trim();

/* ─── Utilities ─── */
const fmtISO = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};
const fmtLocale = (d) => d ? new Date(d).toLocaleDateString() : '—';

const csvEsc = (v) => {
  const s = v == null ? '' : String(v);
  return (/[,"\n=+\-@]/.test(s[0]) || s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
};

/* ─── Global styles ─── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');

  .bh * { box-sizing: border-box; font-family: 'DM Sans', sans-serif; }
  .bh-fade { opacity: 0; animation: bhIn 0.55s ease 0.1s forwards; }
  .bh-rise { opacity: 0; transform: translateY(20px); animation: bhRise 0.5s cubic-bezier(0.22,1,0.36,1) forwards; }
  @keyframes bhIn   { to { opacity: 1; } }
  @keyframes bhRise { to { opacity: 1; transform: translateY(0); } }
  @keyframes spin   { to { transform: rotate(360deg); } }

  .bh-tab { position: relative; padding: 9px 22px; border: none; background: transparent; cursor: pointer; font-weight: 600; font-size: 0.9rem; color: #8C8070; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: color .2s; }
  .bh-tab.on { color: var(--maroon); border-bottom-color: var(--maroon); }
  .bh-tab:hover:not(.on) { color: #2A2118; }

  .bh-chip { display: flex; align-items: center; gap: 5px; padding: 6px 14px; border-radius: 20px; border: 1.5px solid #E8E2D7; background: #fff; color: #6B5F52; font-weight: 600; font-size: 0.8rem; cursor: pointer; transition: all .15s; }
  .bh-chip.on { background: var(--maroon); border-color: var(--maroon); color: #fff; box-shadow: 0 3px 10px rgba(139,0,0,.2); }
  .bh-chip:hover:not(.on) { border-color: var(--maroon); color: var(--maroon); }

  .bh-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 18px; border-radius: 9px; border: none; font-weight: 600; font-size: 0.82rem; cursor: pointer; transition: all .18s; }
  .bh-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.12); }
  .bh-btn:active { transform: none; }
  .bh-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }

  .bh-tr { transition: background .15s; }
  .bh-tr:hover { background: rgba(249,247,242,.8) !important; }

  .bh-search { width: 100%; padding: 13px 18px 13px 44px; border-radius: 12px; border: 1.5px solid #E8E2D7; background: #fff; font-size: 0.9rem; color: #2A2118; outline: none; transition: border-color .2s, box-shadow .2s; }
  .bh-search:focus { border-color: var(--maroon); box-shadow: 0 0 0 3px rgba(139,0,0,.08); }
  .bh-search::placeholder { color: #8C8070; }

  .bh-badge { opacity: 0; transform: translateY(16px); animation: bhRise 0.5s cubic-bezier(0.22,1,0.36,1) forwards; transition: transform .2s, box-shadow .2s; }
  .bh-badge:hover { transform: translateY(-3px) !important; box-shadow: 0 10px 30px rgba(0,0,0,.1) !important; }

  .bh-table-wrap { overflow-x: auto; }
  .bh-table { width: 100%; border-collapse: collapse; min-width: 780px; }
  td { overflow-wrap: break-word; word-break: break-word; }

  .bh-popover { position: fixed; z-index: 9999; background: #fff; border: 1px solid #E8E2D7; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.13); padding: 16px 18px; min-width: 240px; max-width: min(290px,90vw); font-size: 0.82rem; animation: bhIn .15s ease; word-break: break-word; }

  .bh-dd { position: absolute; width: 100%; background: #fff; border: 1px solid #E8E2D7; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.1); z-index: 100; overflow: hidden; animation: bhIn .12s ease; }
  .bh-dd-item { padding: 13px 16px; cursor: pointer; border-bottom: 1px solid #F1EDE3; display: flex; align-items: center; justify-content: space-between; transition: background .12s; }
  .bh-dd-item:last-child { border-bottom: none; }
  .bh-dd-item:hover { background: #F9F7F2; }

  /* Export dropdown */
  .exp-wrap { position: relative; display: inline-block; }
  .exp-btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 9px; border: none; font-weight: 600; font-size: 0.82rem; cursor: pointer; background: var(--maroon); color: #fff; transition: all .18s; box-shadow: 0 2px 8px rgba(139,0,0,.18); }
  .exp-btn:hover { background: #7a0000; transform: translateY(-1px); box-shadow: 0 5px 16px rgba(139,0,0,.28); }
  .exp-btn .chv { transition: transform .2s; opacity: .7; }
  .exp-btn.open .chv { transform: rotate(180deg); }
  .exp-menu { position: absolute; right: 0; top: calc(100% + 8px); min-width: 230px; background: #fff; border: 1.5px solid #E8E2D7; border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,.13); z-index: 200; overflow: hidden; animation: bhIn .15s ease; }
  .exp-hdr { padding: 11px 15px 9px; background: #faf7f3; border-bottom: 1px solid #F1EDE3; font-size: 0.68rem; font-weight: 700; color: #8C8070; text-transform: uppercase; letter-spacing: .7px; }
  .exp-opt { display: flex; align-items: center; gap: 12px; padding: 13px 15px; cursor: pointer; border-bottom: 1px solid #F9F7F2; transition: background .12s; }
  .exp-opt:last-child { border-bottom: none; }
  .exp-opt:hover { background: #FBF8F4; }
  .exp-opt:hover .exp-ico { transform: scale(1.08); }
  .exp-ico { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform .15s; }
  .exp-ico.csv { background: #f0fdf4; color: #16a34a; }
  .exp-ico.pdf { background: #fef2f2; color: var(--maroon); }

  /* Mobile */
  .bh-cards { display: none; }
  @media (max-width: 640px) {
    .bh-table-wrap { display: none; }
    .bh-cards { display: block; }
    .bh-tab { padding: 9px 14px; font-size: 0.82rem; }
    .bh-chip { padding: 5px 10px; font-size: 0.75rem; }
    .exp-menu { right: auto; left: 0; }
  }
  .bh-card { background: #fff; border: 1px solid #E8E2D7; border-radius: 14px; padding: 14px 16px; margin-bottom: 10px; cursor: pointer; transition: box-shadow .15s; overflow: hidden; }
  .bh-card.ov { border-left: 3px solid #b91c1c; }
  .bh-card.sel { background: #eff6ff; border-color: #bfdbfe; }
  .bh-card-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 10px; }
  .bh-card-ttl { font-weight: 700; font-size: 0.9rem; color: #2A2118; flex: 1; word-break: break-word; }
  .bh-card-ttl.ov { color: #b91c1c; }
  .bh-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .bh-card-lbl { font-size: 0.63rem; font-weight: 700; color: #8C8070; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
  .bh-card-val { font-size: 0.82rem; color: #2A2118; font-weight: 500; word-break: break-word; }
  .bh-card-ftr { border-top: 1px solid #F1EDE3; margin-top: 10px; padding-top: 9px; }
`;

/* ────────────────────────────────────────────────
   Small reusable components
──────────────────────────────────────────────── */
function Heading({ children, sub }) {
  return (
    <div>
      <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 600, color: P.text }}>
        {children}
      </h3>
      {sub && <p style={{ margin: '3px 0 0', fontSize: 13, color: P.muted }}>{sub}</p>}
    </div>
  );
}

const STATUS_MAP = {
  overdue:  { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'OVERDUE' },
  borrowed: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'BORROWED' },
  returned: { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', label: 'RETURNED' },
  pending:  { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: 'PENDING' },
  archived: { bg: P.ivoryDk, color: P.muted,   border: P.border,  label: 'ARCHIVED' },
};
function StatusBadge({ status, overdue }) {
  const s = STATUS_MAP[overdue ? 'overdue' : (status || 'pending')] || STATUS_MAP.pending;
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.4px', background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function AccessionCell({ item }) {
  const acc = item.book_copies?.accession_id;
  if (!acc) return <span style={{ color: P.muted, fontSize: '0.82rem', fontStyle: 'italic' }}>—</span>;
  return (
    <div>
      <code style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: 5, fontSize: '0.76rem', fontFamily: 'monospace', fontWeight: 600 }}>{acc}</code>
      <div style={{ fontSize: '0.7rem', color: P.muted, marginTop: 2 }}>Copy #{item.book_copies.copy_number}</div>
    </div>
  );
}

function FineCell({ amount, overdue, estimated }) {
  if (amount > 0) return <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.87rem' }}>₱{amount.toFixed(2)}</span>;
  if (overdue && estimated > 0) return <span style={{ color: '#e11d48', fontSize: '0.78rem', fontStyle: 'italic' }}>~₱{estimated.toFixed(2)}</span>;
  return <span style={{ color: P.border }}>—</span>;
}

function Spinner() {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center', color: P.muted }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${P.border}`, borderTopColor: 'var(--maroon)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }} />
      <p style={{ margin: 0, fontWeight: 500 }}>Loading records…</p>
    </div>
  );
}

function Empty({ icon: Icon, title, sub }) {
  return (
    <div style={{ padding: '60px 0', textAlign: 'center', color: P.muted }}>
      <Icon style={{ fontSize: '2.8rem', opacity: 0.13, display: 'block', margin: '0 auto 14px' }} />
      <p style={{ margin: 0, fontWeight: 600, color: P.text }}>{title}</p>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 13 }}>{sub}</p>}
    </div>
  );
}

/* ─── Export Dropdown ─── */
function ExportDropdown({ onCSV, onPDF, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div className="exp-wrap" ref={ref}>
      <button className={`exp-btn${open ? ' open' : ''}`} onClick={() => setOpen(v => !v)} disabled={disabled}>
        <FaDownload size={12} /> Export <FaChevronDown size={10} className="chv" />
      </button>
      {open && (
        <div className="exp-menu">
          <div className="exp-hdr">Choose format</div>
          <div className="exp-opt" onClick={() => { setOpen(false); onCSV(); }}>
            <div className="exp-ico csv"><FaFileCsv size={16} /></div>
            <div><div style={{ fontWeight: 700, fontSize: '0.85rem', color: P.text }}>Export as CSV</div><div style={{ fontSize: '0.72rem', color: P.muted }}>Spreadsheet-ready · Excel &amp; Google Sheets</div></div>
          </div>
          <div className="exp-opt" onClick={() => { setOpen(false); onPDF(); }}>
            <div className="exp-ico pdf"><FaFilePdf size={15} /></div>
            <div><div style={{ fontWeight: 700, fontSize: '0.85rem', color: P.text }}>Export as PDF</div><div style={{ fontSize: '0.72rem', color: P.muted }}>Printable report · formatted table</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Borrower info popover ─── */
function InfoPopover({ item, position, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const walkin  = !item.users?.name && !!item.walk_in_borrowers?.name;
  const wi      = item.walk_in_borrowers || {};
  const sp      = item.users?.student_profiles || {};
  const rows    = [
    { label: 'Name',              value: walkin ? wi.name : item.users?.name },
    { label: 'LRN / Student ID',  value: walkin ? wi.lrn  : (sp.lrn || sp.student_id) },
    { label: 'Employee ID',       value: wi.employee_id },
    { label: 'Grade & Section',   value: walkin ? wi.grade_section : sp.grade_section },
    { label: 'Position',          value: wi.position },
    { label: 'Adviser / Teacher', value: wi.teacher },
  ];

  return (
    <div ref={ref} className="bh-popover" style={{ top: Math.min(position.y + 8, window.innerHeight - 280), left: Math.min(position.x, window.innerWidth - 300) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${P.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--maroon)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11 }}><FaInfoCircle /></div>
          <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600, fontSize: '0.9rem', color: P.text }}>Borrower Info</span>
          {walkin && <span style={{ fontSize: '0.6rem', background: '#fffbeb', color: '#92400e', padding: '1px 7px', borderRadius: 10, fontWeight: 700, border: '1px solid #fde68a' }}>Walk-in</span>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.muted, lineHeight: 1, display: 'flex' }}><MdClose size={15} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.filter(r => r.value).map(r => (
          <div key={r.label}>
            <div style={{ fontSize: '0.67rem', fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 2 }}>{r.label}</div>
            <div style={{ color: P.text, fontWeight: 500, wordBreak: 'break-word' }}>{r.value}</div>
          </div>
        ))}
        {wi.contact && (
          <div style={{ borderTop: `1px solid ${P.ivoryDk}`, paddingTop: 10 }}>
            <div style={{ fontSize: '0.67rem', fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 3 }}>Contact</div>
            <div style={{ color: P.text, fontWeight: 600 }}>📞 {wi.contact}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Borrower name cell (desktop) ─── */
function BorrowerCell({ item, onInfoClick, activeId }) {
  const name    = item.users?.name || item.walk_in_borrowers?.name || '—';
  const walkin  = !item.users?.name && !!item.walk_in_borrowers?.name;
  const contact = item.walk_in_borrowers?.contact;
  return (
    <td style={td()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: P.text, fontSize: '0.88rem' }}>{name}</span>
        {walkin && <span style={{ fontSize: '0.62rem', background: '#fffbeb', color: '#92400e', padding: '1px 6px', borderRadius: 10, fontWeight: 700, border: '1px solid #fde68a' }}>Walk-in</span>}
        <button
          onClick={(e) => { e.stopPropagation(); onInfoClick(e, item); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: activeId === item.id ? 'var(--maroon)' : P.border, lineHeight: 1, display: 'flex', alignItems: 'center', transition: 'color .15s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--maroon)'}
          onMouseLeave={e => e.currentTarget.style.color = activeId === item.id ? 'var(--maroon)' : P.border}
          title="View borrower info"
        >
          <FaInfoCircle size={12} />
        </button>
      </div>
      {contact && <div style={{ fontSize: '0.72rem', color: P.muted, marginTop: 2 }}>📞 {contact}</div>}
    </td>
  );
}

/* ─── Pagination ─── */
function Pagination({ page, totalPages, total, pageSize, onPage }) {
  if (totalPages <= 1) return null;
  const from  = (page - 1) * pageSize + 1;
  const to    = Math.min(page * pageSize, total);
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  const Btn = ({ disabled, label, onClick }) => (
    <button onClick={onClick} disabled={disabled} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #E8E2D7', background: disabled ? '#F9F7F2' : '#fff', color: disabled ? '#C8BFAF' : '#2A2118', cursor: disabled ? 'default' : 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid #F1EDE3', flexWrap: 'wrap', gap: 10 }}>
      <span style={{ fontSize: '0.78rem', color: P.muted }}>Showing <strong style={{ color: P.text }}>{from}–{to}</strong> of <strong style={{ color: P.text }}>{total}</strong></span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Btn disabled={page <= 1} label="‹ Prev" onClick={() => onPage(page - 1)} />
        {pages.map((p, i) => p === '…'
          ? <span key={`e${i}`} style={{ padding: '5px 6px', fontSize: '0.8rem', color: P.muted }}>…</span>
          : <button key={p} onClick={() => onPage(p)} style={{ padding: '5px 10px', borderRadius: 7, border: `1.5px solid ${p === page ? 'var(--maroon)' : '#E8E2D7'}`, background: p === page ? 'var(--maroon)' : '#fff', color: p === page ? '#fff' : P.text, cursor: 'pointer', fontSize: '0.8rem', fontWeight: p === page ? 700 : 500, minWidth: 34 }}>{p}</button>
        )}
        <Btn disabled={page >= totalPages} label="Next ›" onClick={() => onPage(page + 1)} />
      </div>
    </div>
  );
}

/* ─── Style helpers ─── */
const th = () => ({ padding: '13px 14px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: P.muted, textTransform: 'uppercase', letterSpacing: '0.6px' });
const td = () => ({ padding: '13px 14px', verticalAlign: 'middle' });

/* ════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */
export default function BorrowingHistory() {
  const [searchQuery,     setSearchQuery]     = useState('');
  const [students,        setStudents]        = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentHistory,  setStudentHistory]  = useState([]);
  const [globalHistory,   setGlobalHistory]   = useState([]);
  const [archivedHistory, setArchivedHistory] = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [activeFilter,    setActiveFilter]    = useState('all');
  const [activeTab,       setActiveTab]       = useState('active');
  const [selectedIds,     setSelectedIds]     = useState(new Set());
  const [actionLoading,   setActionLoading]   = useState(false);
  const [toast,           setToast]           = useState({ message: '', type: 'success' });
  const [confirm,         setConfirm]         = useState({ isOpen: false });
  const [finePolicy,      setFinePolicy]      = useState({ fine_amount: 5, fine_increment_type: 'per_day' });
  const [infoPopover,     setInfoPopover]     = useState(null); // { item, x, y }

  const [activePage,      setActivePage]      = useState(1);
  const [archivedPage,    setArchivedPage]    = useState(1);
  const [releasedByFilter, setReleasedByFilter] = useState(null);
  const PAGE_SIZE = 20;

  const showToast   = useCallback((message, type = 'success') => setToast({ message, type }), []);
  const openConfirm = useCallback((opts) => setConfirm({ isOpen: true, ...opts }), []);
  const closeConfirm = useCallback(() => setConfirm(m => ({ ...m, isOpen: false })), []);

  /* ── Fine helpers ── */
  const computeFine = useCallback((dueDate) => {
    if (!dueDate) return 0;
    const ms = Date.now() - new Date(dueDate).getTime();
    if (ms <= 0) return 0;
    const units = finePolicy.fine_increment_type === 'per_hour'
      ? Math.ceil(ms / 3_600_000) : Math.ceil(ms / 86_400_000);
    return units * (finePolicy.fine_amount ?? 5);
  }, [finePolicy]);

  const isOverdue    = useCallback((item) => item.status === 'borrowed' && item.due_date && new Date(item.due_date) < new Date(), []);
  const getFineAmt   = useCallback((item) => {
    if (Array.isArray(item.fines) && item.fines.length > 0) return Number(item.fines[0].amount) || 0;
    return item.fines?.amount != null ? Number(item.fines.amount) : 0;
  }, []);
  const getBorrowerName    = useCallback((item) => item.users?.name || item.walk_in_borrowers?.name || '—', []);
  const getBorrowerContact = useCallback((item) => item.walk_in_borrowers?.contact || null, []);
  const isWalkIn           = useCallback((item) => !item.users?.name && !!item.walk_in_borrowers?.name, []);

  /* ── Fetchers ── */
  const fetchFinePolicy = useCallback(async () => {
    const { data } = await localDbAdmin.from('fine_policy').select('fine_per_day,fine_increment_type').limit(1).maybeSingle();
    if (data) setFinePolicy({ fine_amount: data.fine_per_day ?? 5, fine_increment_type: data.fine_increment_type || 'per_day' });
  }, []);

  const safeSelect = useCallback(async (query) => {
    const { data, error } = await query(TX_SELECT);
    if (error && (
      error.code === '42703' ||
      error.code === 'PGRST200' ||
      error.code === 'PGRST201' ||
      error.message?.includes('processed_by') ||
      error.message?.includes('more than one relationship')
    )) {
      const { data: fallback, error: fallbackErr } = await query(TX_SELECT_FALLBACK);
      if (fallbackErr) console.error('[history-fallback]', fallbackErr);
      return fallback || [];
    }
    if (error) console.error('[history]', error);
    return data || [];
  }, []);

  const fetchGlobal = useCallback(async () => {
    setLoading(true);
    const rows = await safeSelect(sel =>
      localDbAdmin.from('transactions').select(sel).neq('status', 'archived').order('created_at', { ascending: false }).limit(200)
    );
    setGlobalHistory(rows);
    setLoading(false);
  }, [safeSelect]);

  const fetchArchived = useCallback(async () => {
    const rows = await safeSelect(sel =>
      localDbAdmin.from('transactions').select(sel).eq('status', 'archived').order('created_at', { ascending: false })
    );
    setArchivedHistory(rows);
  }, [safeSelect]);

  const fetchStudentHistory = useCallback(async (student) => {
    setLoading(true);
    setSelectedStudent(student);
    setSearchQuery('');
    setStudents([]);
    const rows = await safeSelect(sel =>
      localDbAdmin.from('transactions').select(sel).eq('user_id', student.id).order('created_at', { ascending: false })
    );
    setStudentHistory(rows);
    setLoading(false);
  }, [safeSelect]);

  const searchStudents = useCallback(async () => {
    if (searchQuery.length < 2) { setStudents([]); return; }
    const { data } = await localDb.from('users').select('id,name,role,student_profiles(student_id,grade_section)').ilike('name', `%${searchQuery}%`).in('role', ['student', 'teacher']).limit(5);
    setStudents(data || []);
  }, [searchQuery]);

  useEffect(() => { fetchFinePolicy(); fetchGlobal(); fetchArchived(); }, []);
  useEffect(() => {
    const h = () => { if (!document.hidden) { fetchGlobal(); fetchArchived(); } };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [fetchGlobal, fetchArchived]);
  useEffect(() => { searchStudents(); }, [searchStudents]);
  useEffect(() => { setActivePage(1); }, [activeFilter, activeTab, selectedStudent]);
  useEffect(() => { setArchivedPage(1); }, [activeTab]);

  /* ── Selection ── */
  const toggleSelect = useCallback((id) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  }), []);
  const toggleSelectAll = useCallback((rows) => {
    setSelectedIds(rows.every(r => selectedIds.has(r.id)) ? new Set() : new Set(rows.map(r => r.id)));
  }, [selectedIds]);

  /* ── Actions ── */
  const bulkUpdate = useCallback(async (ids, update) => {
    let failed = 0;
    for (const id of ids) { const { error } = await localDbAdmin.from('transactions').update(update).eq('id', id); if (error) failed++; }
    return failed;
  }, []);

  const handleArchive = useCallback(() => {
    if (!selectedIds.size) return;
    openConfirm({ title: 'Archive Records', message: `Archive ${selectedIds.size} record(s)?`, confirmText: 'Archive', danger: false, onConfirm: async () => {
      closeConfirm(); setActionLoading(true);
      const failed = await bulkUpdate([...selectedIds], { status: 'archived' });
      setSelectedIds(new Set()); await fetchGlobal(); await fetchArchived(); setActionLoading(false);
      showToast(failed > 0 ? `${failed} record(s) failed.` : 'Records archived.', failed > 0 ? 'error' : 'success');
    }});
  }, [selectedIds, openConfirm, closeConfirm, bulkUpdate, fetchGlobal, fetchArchived, showToast]);

  const handleUnarchive = useCallback(() => {
    if (!selectedIds.size) return;
    openConfirm({ title: 'Restore Records', message: `Restore ${selectedIds.size} record(s)?`, confirmText: 'Restore', danger: false, onConfirm: async () => {
      closeConfirm(); setActionLoading(true);
      const failed = await bulkUpdate([...selectedIds], { status: 'returned' });
      setSelectedIds(new Set()); await fetchGlobal(); await fetchArchived(); setActionLoading(false);
      showToast(failed > 0 ? `${failed} failed.` : 'Records restored.', failed > 0 ? 'error' : 'success');
    }});
  }, [selectedIds, openConfirm, closeConfirm, bulkUpdate, fetchGlobal, fetchArchived, showToast]);

  const handleDelete = useCallback(() => {
    if (!selectedIds.size) return;
    openConfirm({ title: 'Permanently Delete', message: `Delete ${selectedIds.size} record(s)? Cannot be undone.`, confirmText: 'Delete Forever', danger: true, onConfirm: async () => {
      closeConfirm(); setActionLoading(true);
      let failed = 0;
      for (const id of selectedIds) { const { error } = await localDbAdmin.from('transactions').delete().eq('id', id); if (error) failed++; }
      setSelectedIds(new Set()); await fetchArchived(); setActionLoading(false);
      showToast(failed > 0 ? `${failed} failed.` : 'Deleted permanently.', failed > 0 ? 'error' : 'success');
    }});
  }, [selectedIds, openConfirm, closeConfirm, fetchArchived, showToast]);

  /* ── Computed display data ── */
  const baseData = selectedStudent ? studentHistory : globalHistory;

  const releasedByOptions = useMemo(() => {
    const map = {};
    globalHistory.forEach(item => {
      if (item.processed_by_user?.name && item.processed_by_user_id) {
        map[item.processed_by_user_id] = item.processed_by_user.name;
      }
    });
    return Object.entries(map)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [globalHistory]);

  const displayData = useMemo(() => {
    let data = baseData;
    if (activeFilter === 'active')   data = data.filter(i => i.status === 'borrowed');
    if (activeFilter === 'returned') data = data.filter(i => i.status === 'returned');
    if (activeFilter === 'overdue')  data = data.filter(i => isOverdue(i));
    if (activeFilter === 'pending')  data = data.filter(i => i.status === 'pending');
    if (releasedByFilter)            data = data.filter(i => i.processed_by_user_id === releasedByFilter);
    return data;
  }, [baseData, activeFilter, isOverdue, releasedByFilter]);

  const activeLoansCount = useMemo(() => baseData.filter(i => i.status === 'borrowed').length, [baseData]);
  const overdueCount     = useMemo(() => baseData.filter(i => isOverdue(i)).length, [baseData, isOverdue]);

  const activeTotalPg  = Math.ceil(displayData.length / PAGE_SIZE);
  const pagedDisplay   = displayData.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const archTotalPg    = Math.ceil(archivedHistory.length / PAGE_SIZE);
  const pagedArch      = archivedHistory.slice((archivedPage - 1) * PAGE_SIZE, archivedPage * PAGE_SIZE);

  /* ── Exports ── */
  const buildPDFRows = (data) => data.map(item => {
    const ov = isOverdue(item); const fa = getFineAmt(item);
    return [
      item.users?.name || selectedStudent?.name || 'Unknown',
      item.books?.title || 'Untitled',
      item.book_copies?.accession_id ? `${item.book_copies.accession_id} (Copy #${item.book_copies.copy_number})` : '—',
      item.status?.toUpperCase() || '-',
      fmtISO(item.due_date) || '—',
      ov ? 'YES' : 'NO',
      fa > 0 ? `PHP ${fa.toFixed(2)}` : (ov ? `~PHP ${computeFine(item.due_date).toFixed(2)}` : '—'),
    ];
  });

  const exportPDF = useCallback((data, title, fileName) => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(18); doc.setTextColor(30, 58, 138); doc.text(title, 14, 20);
      doc.setFontSize(10); doc.setTextColor(100); doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
      autoTable(doc, { startY: 35, head: [['Student','Book','Copy / Accession ID','Status','Due Date','Overdue','Fine (PHP)']], body: buildPDFRows(data), theme: 'grid', headStyles: { fillColor: [139,0,0] } });
      doc.save(fileName);
      showToast('PDF exported.', 'success');
    } catch (err) { console.error(err); showToast('PDF export failed.', 'error'); }
  }, [buildPDFRows, showToast]);

  const exportCSV = useCallback((data, fileName) => {
    try {
      const headers = ['Student','Student ID','LRN','Grade & Section','Walk-in','Book Title','Accession ID','Copy #','Status','Borrow Date (YYYY-MM-DD)','Due Date (YYYY-MM-DD)','Return Date (YYYY-MM-DD)','Overdue','Fine (PHP)'];
      const rows = data.map(item => {
        const ov = isOverdue(item); const fa = getFineAmt(item);
        return [
          item.users?.name || item.walk_in_borrowers?.name || '',
          item.users?.student_profiles?.student_id || '',
          item.users?.student_profiles?.lrn || item.walk_in_borrowers?.lrn || '',
          item.users?.student_profiles?.grade_section || item.walk_in_borrowers?.grade_section || '',
          isWalkIn(item) ? 'Yes' : 'No',
          item.books?.title || '',
          item.book_copies?.accession_id || '',
          item.book_copies?.copy_number != null ? String(item.book_copies.copy_number) : '',
          item.status || '',
          fmtISO(item.borrow_date), fmtISO(item.due_date), fmtISO(item.return_date),
          ov ? 'Yes' : 'No',
          fa > 0 ? fa.toFixed(2) : (ov ? computeFine(item.due_date).toFixed(2) : ''),
        ].map(csvEsc).join(',');
      });
      const csv  = [headers.map(csvEsc).join(','), ...rows].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: fileName }).click();
      URL.revokeObjectURL(url);
      showToast('CSV exported.', 'success');
    } catch (err) { console.error(err); showToast('CSV export failed.', 'error'); }
  }, [isOverdue, getFineAmt, isWalkIn, computeFine, showToast]);

  const activeFile  = selectedStudent ? `${selectedStudent.name}_History` : 'Library_Activity';
  const activePDFTitle = selectedStudent ? `History: ${selectedStudent.name}` : 'ShelfMaster Library Management System';

  /* ── Info popover handler ── */
  const handleInfoClick = useCallback((e, item) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setInfoPopover(prev => prev?.item?.id === item.id ? null : { item, x: rect.left, y: rect.bottom + window.scrollY });
  }, []);

  /* ─── Shared select-all row ─── */
  const SelectAllRow = ({ rows }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${P.ivoryDk}` }}>
      <input type="checkbox" style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--maroon)' }}
        checked={rows.length > 0 && rows.every(r => selectedIds.has(r.id))}
        onChange={() => toggleSelectAll(rows)} />
      <span style={{ fontSize: '0.78rem', color: P.muted, fontWeight: 600 }}>
        {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all on page'}
      </span>
    </div>
  );

  /* ─── Active record mobile card ─── */
  const ActiveCard = ({ item }) => {
    const ov = isOverdue(item); const fa = getFineAmt(item); const sel = selectedIds.has(item.id);
    return (
      <div className={`bh-card${ov ? ' ov' : ''}${sel ? ' sel' : ''}`} onClick={() => toggleSelect(item.id)}>
        <div className="bh-card-hdr">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
            <input type="checkbox" checked={sel} onChange={() => toggleSelect(item.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--maroon)', flexShrink: 0, marginTop: 3 }} />
            <span className={`bh-card-ttl${ov ? ' ov' : ''}`}>{item.books?.title || '—'}{ov && <span style={{ fontSize: '0.68rem', color: '#b91c1c', marginLeft: 6 }}><FaExclamationTriangle size={9} /> Overdue</span>}</span>
          </div>
          <StatusBadge status={item.status} overdue={ov} />
        </div>
        <div className="bh-card-grid">
          {[['Borrow date', fmtLocale(item.borrow_date)], [item.return_date ? 'Returned' : 'Due date', fmtLocale(item.return_date || item.due_date)]].map(([l, v]) => (
            <div key={l}><div className="bh-card-lbl">{l}</div><div className="bh-card-val" style={{ color: P.textSoft, fontWeight: 400 }}>{v}</div></div>
          ))}
          <div><div className="bh-card-lbl">Accession</div><AccessionCell item={item} /></div>
          <div><div className="bh-card-lbl">Fine</div><div className="bh-card-val"><FineCell amount={fa} overdue={ov} estimated={computeFine(item.due_date)} /></div></div>
        </div>
        {(!selectedStudent || getBorrowerContact(item)) && (
          <div className="bh-card-ftr">
            {!selectedStudent && <div style={{ fontSize: '0.8rem', color: P.textSoft, display: 'flex', gap: 5, flexWrap: 'wrap' }}><span style={{ fontWeight: 600, color: P.text }}>{getBorrowerName(item)}</span>{isWalkIn(item) && <span style={{ fontSize: '0.6rem', background: '#fffbeb', color: '#92400e', padding: '1px 6px', borderRadius: 10, fontWeight: 700, border: '1px solid #fde68a' }}>Walk-in</span>}</div>}
            {getBorrowerContact(item) && <div style={{ fontSize: '0.72rem', color: P.muted }}>📞 {getBorrowerContact(item)}</div>}
          </div>
        )}
      </div>
    );
  };

  /* ── Render ── */
  return (
    <div className="bh" style={{ background: P.ivory, minHeight: '100vh', padding: '32px 28px 56px' }}>
      <style>{STYLES}</style>
      <Toast {...toast} onClose={() => setToast({ message: '' })} />
      <ConfirmModal isOpen={confirm.isOpen} title={confirm.title} message={confirm.message} confirmText={confirm.confirmText} danger={confirm.danger} onConfirm={confirm.onConfirm} onCancel={closeConfirm} />

      {/* Header */}
      <header style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--maroon)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}><FaClipboardList /></div>
            <h1 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,4vw,30px)', fontWeight: 700, color: 'var(--maroon)', letterSpacing: '-0.3px' }}>Borrowing History</h1>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: P.textSoft, paddingLeft: 52 }}>View, filter, and export all borrowing activity.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {activeLoansCount > 0 && (
            <div className="bh-badge" style={{ ...card, padding: '12px 20px', textAlign: 'center', animationDelay: '0.05s' }}>
              <div style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>{activeLoansCount}</div>
              <div style={{ fontSize: '0.7rem', color: P.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 }}>Active Loans</div>
            </div>
          )}
          {overdueCount > 0 && (
            <div className="bh-badge" style={{ ...card, padding: '12px 20px', textAlign: 'center', animationDelay: '0.15s', borderColor: '#fecaca' }}>
              <div style={{ fontSize: '1.7rem', fontWeight: 700, color: '#b91c1c', lineHeight: 1 }}>{overdueCount}</div>
              <div style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 }}>Overdue</div>
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: `2px solid ${P.border}`, marginBottom: 24, display: 'flex', gap: 4 }}>
        {[{ key: 'active', icon: <FaClipboardList />, label: 'Active History', count: globalHistory.length }, { key: 'archived', icon: <FaArchive />, label: 'Archived', count: archivedHistory.length }].map(t => (
          <button key={t.key} className={`bh-tab${activeTab === t.key ? ' on' : ''}`} onClick={() => { setActiveTab(t.key); setSelectedIds(new Set()); setActiveFilter('all'); }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t.icon} {t.label}
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: activeTab === t.key ? '#fef2f2' : P.ivoryDk, color: activeTab === t.key ? 'var(--maroon)' : P.muted }}>{t.count}</span>
            </span>
          </button>
        ))}
      </div>

      {/* ── ACTIVE TAB ── */}
      {activeTab === 'active' && (
        <div className="bh-fade">
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <FaSearch style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: P.muted, fontSize: 14 }} />
            <input className="bh-search" type="text" placeholder="Search student or teacher…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {students.length > 0 && (
              <div className="bh-dd" style={{ top: 'calc(100% + 6px)' }}>
                {students.map(s => (
                  <div key={s.id} className="bh-dd-item" onClick={() => fetchStudentHistory(s)}>
                    <div>
                      <span style={{ fontWeight: 600, color: P.text }}>{s.name}</span>
                      {s.student_profiles?.student_id && <span style={{ color: P.muted, fontSize: '0.8rem', marginLeft: 6 }}>#{s.student_profiles.student_id}</span>}
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: s.role === 'teacher' ? '#FFF0F5' : '#F0FDF4', color: s.role === 'teacher' ? 'var(--maroon)' : '#15803d' }}>{s.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: releasedByOptions.length > 0 ? 12 : 20, flexWrap: 'wrap' }}>
            {[['all','All Records',<FaFilter size={10} />],['active','Active Loans',<FaBookOpen size={10} />],['returned','Returned',<FaCheckCircle size={10} />],['pending','Pending',<FaClock size={10} />],['overdue','Overdue',<FaExclamationTriangle size={10} />]].map(([key, label, icon]) => (
              <button key={key} className={`bh-chip${activeFilter === key ? ' on' : ''}`} onClick={() => setActiveFilter(key)}>{icon} {label}</button>
            ))}
          </div>

          {/* Released By filter */}
          {releasedByOptions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: P.muted, whiteSpace: 'nowrap' }}>Released by:</span>
              <select
                value={releasedByFilter || ''}
                onChange={e => { setReleasedByFilter(e.target.value || null); setActivePage(1); }}
                style={{
                  appearance: 'none',
                  background: releasedByFilter ? 'var(--maroon)' : '#fff',
                  border: `1.5px solid ${releasedByFilter ? 'var(--maroon)' : P.border}`,
                  borderRadius: 20,
                  color: releasedByFilter ? '#fff' : P.textSoft,
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  outline: 'none',
                  padding: '6px 28px 6px 14px',
                  backgroundImage: releasedByFilter
                    ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='white' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\")"
                    : "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%238C8070' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  transition: 'all .15s',
                }}
              >
                <option value="">All Staff</option>
                {releasedByOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              {releasedByFilter && (
                <button
                  onClick={() => { setReleasedByFilter(null); setActivePage(1); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.muted, fontSize: '0.78rem', fontWeight: 600, padding: '4px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <MdClose size={13} /> Clear
                </button>
              )}
            </div>
          )}

          <div className="bh-rise" style={{ ...card, animationDelay: '0.1s' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <Heading sub={`${displayData.length} record${displayData.length !== 1 ? 's' : ''} shown`}>
                {selectedStudent ? `History — ${selectedStudent.name}` : 'Recent Library Activity'}
              </Heading>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {selectedIds.size > 0 && (
                  <button className="bh-btn" onClick={handleArchive} disabled={actionLoading} style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                    <FaArchive size={12} /> Archive {selectedIds.size}
                  </button>
                )}
                {selectedStudent && (
                  <button className="bh-btn" onClick={() => { setSelectedStudent(null); setActiveFilter('all'); setSelectedIds(new Set()); fetchGlobal(); }} style={{ background: P.ivoryDk, color: P.textSoft, border: `1px solid ${P.border}` }}>
                    <MdClose size={13} /> Clear Filter
                  </button>
                )}
                <ExportDropdown
                  disabled={displayData.length === 0}
                  onCSV={() => exportCSV(displayData, `${activeFile}.csv`)}
                  onPDF={() => openConfirm({ title: 'Export PDF', message: `Export ${displayData.length} record(s) as PDF?\nFile: ${activeFile}.pdf`, confirmText: 'Export PDF', danger: false, onConfirm: () => { closeConfirm(); exportPDF(displayData, activePDFTitle, `${activeFile}.pdf`); } })}
                />
              </div>
            </div>
            <div style={{ height: 1, background: P.border }} />

            {loading ? <Spinner /> : displayData.length === 0 ? <Empty icon={FaBook} title="No records found" sub="Try adjusting your filters or search." /> : (
              <>
                {/* Desktop table */}
                <div className="bh-table-wrap">
                  <table className="bh-table">
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${P.ivoryDk}` }}>
                        <th style={th()}><input type="checkbox" style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--maroon)' }} checked={displayData.length > 0 && displayData.every(r => selectedIds.has(r.id))} onChange={() => toggleSelectAll(displayData)} /></th>
                        {!selectedStudent && <th style={th()}>Student</th>}
                        <th style={th()}>Book Title</th>
                        <th style={th()}>Copy / Accession</th>
                        <th style={{ ...th(), whiteSpace: 'nowrap' }}>Status</th>
                        <th style={th()}>Borrow Date</th>
                        <th style={th()}>Due Date</th>
                        <th style={th()}>Returned</th>
                        <th style={th()}>Released By</th>
                        <th style={th()}>Fine</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDisplay.map(item => {
                        const ov = isOverdue(item); const sel = selectedIds.has(item.id); const fa = getFineAmt(item);
                        return (
                          <tr key={item.id} className="bh-tr" style={{ borderBottom: `1px solid ${P.ivoryDk}`, background: sel ? '#eff6ff' : ov ? '#fff5f5' : 'transparent' }}>
                            <td style={td()}><input type="checkbox" checked={sel} onChange={() => toggleSelect(item.id)} style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--maroon)' }} /></td>
                            {!selectedStudent && <BorrowerCell item={item} onInfoClick={handleInfoClick} activeId={infoPopover?.item?.id} />}
                            <td style={td()}>
                              <span style={{ fontWeight: ov ? 700 : 500, color: ov ? '#b91c1c' : P.text, fontSize: '0.87rem' }}>{item.books?.title || '—'}</span>
                              {ov && <div style={{ fontSize: '0.68rem', color: '#b91c1c', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}><FaExclamationTriangle size={9} /> Overdue</div>}
                            </td>
                            <td style={td()}><AccessionCell item={item} /></td>
                            <td style={{ ...td(), whiteSpace: 'nowrap' }}><StatusBadge status={item.status} overdue={ov} /></td>
                            <td style={{ ...td(), color: P.textSoft, fontSize: '0.83rem' }}>{fmtLocale(item.borrow_date)}</td>
                            <td style={{ ...td(), color: ov ? '#b91c1c' : P.textSoft, fontSize: '0.83rem', fontWeight: ov ? 600 : 400 }}>{fmtLocale(item.due_date)}</td>
                            <td style={{ ...td(), color: P.textSoft, fontSize: '0.83rem' }}>{fmtLocale(item.return_date)}</td>
                            <td style={{ ...td(), fontSize: '0.82rem' }}>
                              {item.processed_by_user?.name
                                ? <span style={{ color: P.textSoft, fontWeight: 500 }}>{item.processed_by_user.name}</span>
                                : <span style={{ color: P.border }}>—</span>}
                            </td>
                            <td style={{ ...td(), whiteSpace: 'nowrap' }}><FineCell amount={fa} overdue={ov} estimated={computeFine(item.due_date)} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination page={activePage} totalPages={activeTotalPg} total={displayData.length} pageSize={PAGE_SIZE} onPage={setActivePage} />
                </div>

                {/* Mobile cards */}
                <div className="bh-cards" style={{ paddingTop: 12 }}>
                  <SelectAllRow rows={pagedDisplay} />
                  {pagedDisplay.map(item => <ActiveCard key={item.id} item={item} />)}
                  <Pagination page={activePage} totalPages={activeTotalPg} total={displayData.length} pageSize={PAGE_SIZE} onPage={setActivePage} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ARCHIVED TAB ── */}
      {activeTab === 'archived' && (
        <div className="bh-fade">
          <div className="bh-rise" style={{ ...card, animationDelay: '0.1s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <Heading sub="Restore records or permanently delete them.">Archived Records</Heading>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selectedIds.size > 0 && (
                  <>
                    <button className="bh-btn" onClick={handleUnarchive} disabled={actionLoading} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}><FaRecycle size={12} /> Restore {selectedIds.size}</button>
                    <button className="bh-btn" onClick={handleDelete} disabled={actionLoading} style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}><FaTrash size={12} /> Delete {selectedIds.size}</button>
                  </>
                )}
                <ExportDropdown
                  disabled={archivedHistory.length === 0}
                  onCSV={() => exportCSV(archivedHistory, 'Archived_Records.csv')}
                  onPDF={() => openConfirm({ title: 'Export Archived PDF', message: `Export ${archivedHistory.length} archived record(s) as PDF?`, confirmText: 'Export PDF', danger: false, onConfirm: () => { closeConfirm(); exportPDF(archivedHistory, 'ShelfMaster — Archived Records', 'Archived_Records.pdf'); } })}
                />
              </div>
            </div>
            <div style={{ height: 1, background: P.border }} />

            {archivedHistory.length === 0 ? <Empty icon={FaArchive} title="No archived records" sub="Records you archive from Active History will appear here." /> : (
              <>
                <div className="bh-table-wrap">
                  <table className="bh-table">
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${P.ivoryDk}` }}>
                        <th style={th()}><input type="checkbox" style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--maroon)' }} checked={archivedHistory.length > 0 && archivedHistory.every(r => selectedIds.has(r.id))} onChange={() => toggleSelectAll(archivedHistory)} /></th>
                        <th style={th()}>Student</th>
                        <th style={th()}>Book Title</th>
                        <th style={th()}>Copy / Accession</th>
                        <th style={{ ...th(), whiteSpace: 'nowrap' }}>Status</th>
                        <th style={th()}>Borrow Date</th>
                        <th style={th()}>Returned</th>
                        <th style={{ ...th(), whiteSpace: 'nowrap' }}>Fine</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedArch.map(item => {
                        const sel = selectedIds.has(item.id); const fa = getFineAmt(item);
                        return (
                          <tr key={item.id} className="bh-tr" style={{ borderBottom: `1px solid ${P.ivoryDk}`, background: sel ? '#eff6ff' : 'transparent' }}>
                            <td style={td()}><input type="checkbox" checked={sel} onChange={() => toggleSelect(item.id)} style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--maroon)' }} /></td>
                            <BorrowerCell item={item} onInfoClick={handleInfoClick} activeId={infoPopover?.item?.id} />
                            <td style={{ ...td(), color: P.text, fontSize: '0.87rem', fontWeight: 500 }}>{item.books?.title || '—'}</td>
                            <td style={td()}><AccessionCell item={item} /></td>
                            <td style={{ ...td(), whiteSpace: 'nowrap' }}><StatusBadge status="archived" /></td>
                            <td style={{ ...td(), color: P.textSoft, fontSize: '0.83rem' }}>{fmtLocale(item.borrow_date)}</td>
                            <td style={{ ...td(), color: P.textSoft, fontSize: '0.83rem' }}>{fmtLocale(item.return_date)}</td>
                            <td style={{ ...td(), whiteSpace: 'nowrap' }}>{fa > 0 ? <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.87rem' }}>₱{fa.toFixed(2)}</span> : <span style={{ color: P.border }}>—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination page={archivedPage} totalPages={archTotalPg} total={archivedHistory.length} pageSize={PAGE_SIZE} onPage={setArchivedPage} />
                </div>

                <div className="bh-cards" style={{ paddingTop: 12 }}>
                  <SelectAllRow rows={pagedArch} />
                  {pagedArch.map(item => {
                    const sel = selectedIds.has(item.id); const fa = getFineAmt(item);
                    return (
                      <div key={item.id} className={`bh-card${sel ? ' sel' : ''}`} onClick={() => toggleSelect(item.id)}>
                        <div className="bh-card-hdr">
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0 }}>
                            <input type="checkbox" checked={sel} onChange={() => toggleSelect(item.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', width: 14, height: 14, accentColor: 'var(--maroon)', flexShrink: 0, marginTop: 3 }} />
                            <span className="bh-card-ttl">{item.books?.title || '—'}</span>
                          </div>
                          <StatusBadge status="archived" />
                        </div>
                        <div className="bh-card-grid">
                          <div><div className="bh-card-lbl">Borrow date</div><div className="bh-card-val" style={{ color: P.textSoft, fontWeight: 400 }}>{fmtLocale(item.borrow_date)}</div></div>
                          <div><div className="bh-card-lbl">Returned</div><div className="bh-card-val" style={{ color: P.textSoft, fontWeight: 400 }}>{fmtLocale(item.return_date)}</div></div>
                          <div><div className="bh-card-lbl">Accession</div><AccessionCell item={item} /></div>
                          <div><div className="bh-card-lbl">Fine</div><div className="bh-card-val">{fa > 0 ? <span style={{ color: '#b91c1c', fontWeight: 700 }}>₱{fa.toFixed(2)}</span> : <span style={{ color: P.border }}>—</span>}</div></div>
                        </div>
                        {getBorrowerName(item) !== '—' && (
                          <div className="bh-card-ftr">
                            <div style={{ fontSize: '0.8rem', color: P.textSoft, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, color: P.text }}>{getBorrowerName(item)}</span>
                              {isWalkIn(item) && <span style={{ fontSize: '0.6rem', background: '#fffbeb', color: '#92400e', padding: '1px 6px', borderRadius: 10, fontWeight: 700, border: '1px solid #fde68a' }}>Walk-in</span>}
                            </div>
                            {getBorrowerContact(item) && <div style={{ fontSize: '0.72rem', color: P.muted }}>📞 {getBorrowerContact(item)}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <Pagination page={archivedPage} totalPages={archTotalPg} total={archivedHistory.length} pageSize={PAGE_SIZE} onPage={setArchivedPage} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Borrower info popover */}
      {infoPopover && (
        <InfoPopover item={infoPopover.item} position={{ x: infoPopover.x, y: infoPopover.y }} onClose={() => setInfoPopover(null)} />
      )}
    </div>
  );
}