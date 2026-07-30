import React, { useState, useEffect, useRef, useCallback } from 'react';
import { localDb } from './localDbClient';
import { localDbAdmin } from './localDbAdmin';
import { getBaseURL } from './connectionManager';
import ConfirmModal from './ConfirmModal';
import BarcodeLabel, { generateBarcode, generateCopyAccessionId } from './BarcodeLabel';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import Toast from './Toast';
import { fulfillNextReservation } from './reservationFulfillment';
import {
  FaArchive, FaBookOpen, FaCheck, FaCheckCircle, FaExclamationTriangle,
  FaFileAlt, FaLink, FaSearch, FaTrash, FaBook, FaDownload, FaEdit,
  FaPlus, FaChevronDown, FaChevronUp, FaRedo, FaBan,
} from 'react-icons/fa';
import { MdTabletMac } from 'react-icons/md';

/* ── helpers ── */
const apiUrl = (path) => { const b = getBaseURL(); return b ? b.replace(/\/$/, '') + path : path; };
const nullableNum = ['pages', 'cost_price', 'max_borrowable_copies', 'borrow_duration_days'];
const cleanPayload = (obj) => Object.fromEntries(
  Object.entries(obj).map(([k, v]) => {
    if (nullableNum.includes(k)) { const n = Number(v); return [k, (v === '' || v == null || !Number.isFinite(n)) ? null : n]; }
    return [k, typeof v === 'string' ? v.trim() : v];
  })
);

const joinAuthors = (book) => book.authors || '';

/* ── design tokens ── */
const C = { ivory: '#F9F7F2', ivoryDk: '#F1EDE3', border: '#E8E2D7', muted: '#8C8070', text: '#2A2118', soft: '#6B5F52' };

/* ── global styles ── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
  .inv-root { font-family:'DM Sans',sans-serif; }
  .inv-root *, .inv-root *::before, .inv-root *::after { box-sizing:border-box; }

  .inv-tab { padding:9px 20px; border:1.5px solid transparent; border-radius:30px; font-size:.87rem; font-weight:500; cursor:pointer; transition:all .18s; display:inline-flex; align-items:center; gap:7px; white-space:nowrap; background:transparent; font-family:'DM Sans',sans-serif; }
  .inv-tab:active { transform:scale(.97); }

  .inv-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:thin; scrollbar-color:#D4C9B8 transparent; }
  .inv-table-wrap::-webkit-scrollbar { height:5px; }
  .inv-table-wrap::-webkit-scrollbar-thumb { background:#D4C9B8; border-radius:3px; }

  .inv-tr { transition:background .12s; }
  .inv-tr:hover { background:#FAF7F2 !important; }

  .inv-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 13px; border-radius:7px; font-size:.78rem; font-weight:600; cursor:pointer; transition:all .15s; border:1.5px solid transparent; font-family:'DM Sans',sans-serif; white-space:nowrap; }
  .inv-btn:hover { transform:translateY(-1px); }
  .inv-btn:active { transform:scale(.97); }
  .inv-btn:disabled { opacity:.55; cursor:not-allowed; transform:none; }

  .btn-maroon { background:var(--maroon); color:#fff; border-color:var(--maroon); }
  .btn-maroon:hover { opacity:.88; box-shadow:0 4px 14px rgba(128,0,0,.25); }
  .btn-green  { background:var(--green,#7DB356); color:#fff; border-color:var(--green,#7DB356); }
  .btn-green:hover { opacity:.88; }
  .btn-dark   { background:#1E2A38; color:#fff; border-color:#1E2A38; }
  .btn-dark:hover { background:#2D3E52; }
  .btn-indigo { background:#6366F1; color:#fff; border-color:#6366F1; }
  .btn-indigo:hover { opacity:.88; }
  .btn-ghost  { background:#F4F1EC; color:#5A4E40; border-color:#E0D9CE; }
  .btn-ghost:hover  { background:#ECE7DF; }
  .btn-archive { background:#FFF1F3; color:#C0143A; border-color:#FCC9D3; }
  .btn-archive:hover { background:#FFE4E8; }
  .btn-restore { background:#EDFAF4; color:#137A4E; border-color:#A8EDD1; }
  .btn-restore:hover { background:#D8F5E9; }
  .btn-delete  { background:#FFF1F1; color:#B91C1C; border-color:#FECACA; }
  .btn-delete:hover  { background:#FFE2E2; }
  .btn-expand  { background:#F4F1EC; color:#4A3F32; border-color:#DDD7CC; }
  .btn-expand:hover  { background:#EAE5DC; }
  .btn-expand.open   { background:#2A2118; color:#F9F7F2; border-color:#2A2118; }

  .inv-input { width:100%; padding:10px 14px; border:1.5px solid #DDD7CC; border-radius:9px; font-size:.88rem; font-family:'DM Sans',sans-serif; color:#2A2118; background:#fff; transition:border-color .15s,box-shadow .15s; outline:none; }
  .inv-input:focus { border-color:var(--maroon); box-shadow:0 0 0 3px rgba(128,0,0,.08); }
  .inv-input::placeholder { color:#B5A99A; }
  .inv-input.input-error { border-color:#EF4444 !important; box-shadow:0 0 0 3px rgba(239,68,68,.08) !important; }
  select.inv-input { appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238C8070' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:36px; cursor:pointer; }

  .inv-copy-select { padding:5px 32px 5px 10px; border:1.5px solid #DDD7CC; border-radius:7px; font-size:.78rem; font-family:'DM Sans',sans-serif; background:#fff; cursor:pointer; outline:none; transition:border-color .15s; appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238C8070' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; min-width:120px; }
  .inv-copy-select:focus { border-color:var(--maroon); }

  .inv-status { display:inline-block; padding:3px 10px; border-radius:20px; font-size:.72rem; font-weight:700; white-space:nowrap; }
  .s-available { background:#EDFAF4; color:#137A4E; }
  .s-borrowed  { background:#EEF2FF; color:#4338CA; }
  .s-damaged   { background:#FFFBEB; color:#92400E; }
  .s-lost      { background:#FFF1F1; color:#B91C1C; }

  .no-borrow-tag { display:inline-flex; align-items:center; gap:4px; background:#FFF1F1; color:#B91C1C; border:1px solid #FECACA; border-radius:20px; font-size:.66rem; font-weight:700; padding:2px 8px; white-space:nowrap; }

  @keyframes inv-slideup { from{opacity:0;transform:translateY(24px) scale(.98);} to{opacity:1;transform:translateY(0) scale(1);} }
  .inv-modal { animation:inv-slideup .28s cubic-bezier(.22,1,.36,1) both; }
  @keyframes inv-expandin { from{opacity:0;transform:translateY(-6px);} to{opacity:1;transform:translateY(0);} }
  .inv-expand-panel { animation:inv-expandin .22s ease both; }

  .inv-ebook-card { transition:transform .2s,box-shadow .2s; cursor:default; }
  .inv-ebook-card:hover { transform:translateY(-4px); box-shadow:0 16px 40px rgba(42,33,24,.12) !important; }

  .inv-drop-zone { border:2px dashed #C8BFAF; border-radius:12px; padding:28px 20px; text-align:center; cursor:pointer; background:#FAF8F4; transition:background .15s,border-color .15s; }
  .inv-drop-zone:hover,.inv-drop-zone.drag-over { background:#F0F9EA; border-color:var(--green,#7DB356); }

  .inv-search-bar { padding:14px 20px; border-bottom:1px solid #F1EDE3; display:flex; align-items:center; gap:10px; background:#FDFCF9; flex-wrap:wrap; }
  .inv-search-wrap { display:flex; align-items:center; gap:10px; flex:1; min-width:0; }

  .inv-mobile-cards { display:none; }
  @media(max-width:640px) {
    .inv-table-wrap { display:none; }
    .inv-mobile-cards { display:block; }
    .inv-root { padding:16px 12px 40px !important; }
    .inv-modal { border-radius:20px 20px 0 0 !important; }
  }
  @media(max-width:900px) { .inv-root { padding:24px 16px 48px !important; } }

  .inv-record-card { background:#fff; border:1px solid #E8E2D7; border-radius:14px; padding:14px 16px; margin-bottom:10px; word-break:break-word; }
  .inv-card-label { font-size:.63rem; font-weight:700; color:#8C8070; text-transform:uppercase; letter-spacing:.5px; margin-bottom:2px; }
  .inv-card-val   { font-size:.82rem; color:#2A2118; font-weight:500; word-break:break-word; }
  .inv-card-footer { border-top:1px solid #F1EDE3; margin-top:10px; padding-top:9px; display:flex; gap:8px; flex-wrap:wrap; }

  .field-error-msg { margin:4px 0 0; font-size:.74rem; color:#EF4444; display:flex; align-items:center; gap:4px; }
`;

const MIGRATION_SQL = `CREATE TABLE IF NOT EXISTS book_copies (
  id VARCHAR(36) PRIMARY KEY,
  book_id VARCHAR(36) NOT NULL,
  copy_number INT NOT NULL DEFAULT 1,
  accession_id VARCHAR(100) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  date_acquired DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (book_id),
  CONSTRAINT fk_book_copies_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);`;

const PAGE_SIZE = 10;
const INIT_FORM = {
  barcode: '', title: '', authorsText: '', edition: '', pages: '',
  book_type: 'Hardbound', subject_class: '', cost_price: '', publisher: '',
  isbn: '', copyright: '', source: '', remark: '', status: 'active',
  cover_image: null, is_borrowable: true, max_borrowable_copies: '', borrow_duration_days: '',
  quantity: 1,
};

function isMigErr(e) {
  if (!e) return false;
  const m = e.message || '';
  return m.includes('book_copies') || m.includes('schema cache') || e.code === '42P01' || e.code === 'PGRST200';
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function Inventory() {
  const [tab, setTab]               = useState('books');
  const [books, setBooks]           = useState([]);
  const [ebooks, setEbooks]         = useState([]);
  const [archived, setArchived]     = useState([]);
  const [search, setSearch]         = useState({ books: '', ebooks: '', archived: '' });
  const [pages, setPages]           = useState({ books: 1, ebooks: 1, archived: 1 });
  const [copiesMap, setCopiesMap]   = useState({});
  const [copyCounts, setCopyCounts] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [copiesLoading, setCopiesLoading] = useState(false);
  const [migNeeded, setMigNeeded]   = useState(false);
  const [migChecked, setMigChecked] = useState(false);
  const [showMig, setShowMig]       = useState(false);
  const [coverColOk, setCoverColOk] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState({ message: '' });
  const [confirm, setConfirm]       = useState({ isOpen: false });
  const [showBookModal, setShowBookModal]   = useState(false);
  const [showEbookModal, setShowEbookModal] = useState(false);
  const [isEditing, setIsEditing]   = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(INIT_FORM);
  const [ebookForm, setEbookForm]   = useState({ title: '', url: '' });
  const [editingEbook, setEditingEbook] = useState(null);
  const [coverFile, setCoverFile]   = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverDrag, setCoverDrag]   = useState(false);
  const [ebookImgOk, setEbookImgOk] = useState(false);

  // ── NEW: barcode duplicate validation state ──
  const [barcodeError, setBarcodeError] = useState('');
  const [barcodeChecking, setBarcodeChecking] = useState(false);
  const barcodeCheckTimer = useRef(null);

  const coverRef = useRef(null);

  const showToast  = (message, type = 'success') => setToast({ message, type });
  const openConfirm  = (opts) => setConfirm({ isOpen: true, ...opts });
  const closeConfirm = () => setConfirm(c => ({ ...c, isOpen: false }));

  useEffect(() => { fetchAll(); checkMig(); checkCover(); }, []);

  const fetchAll = useCallback(async () => {
    const { data, error } = await localDbAdmin
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }

    const all = (data || []).map(b => ({
      ...b,
      authors: (b.authors || '').trim(),
    }));

    const active = all.filter(b => b.status !== 'archived');
    setBooks(active.filter(b => b.book_type !== 'eBook'));
    setEbooks(active.filter(b => b.book_type === 'eBook'));
    setArchived(all.filter(b => b.status === 'archived'));

    const activePhysical = active.filter(b => b.book_type !== 'eBook');
    if (activePhysical.length > 0) {
      const { data: copies } = await localDbAdmin
        .from('book_copies')
        .select('book_id, status')
        .in('book_id', activePhysical.map(b => b.id));
      if (copies) {
        const counts = {};
        copies.forEach(c => {
          if (!counts[c.book_id]) counts[c.book_id] = 0;
          if (c.status === 'available') counts[c.book_id]++;
        });
        setCopyCounts(counts);
      }
    }
  }, []);

  async function checkMig() {
    const { error } = await localDbAdmin.from('book_copies').select('id').limit(1);
    setMigNeeded(isMigErr(error));
    setMigChecked(true);
  }
  async function checkCover() {
    const { error } = await localDbAdmin.from('books').select('cover_image').limit(1);
    setCoverColOk(!error || error.code !== '42703');
  }

  async function fetchCopies(bookId) {
    setCopiesLoading(true);
    const { data, error } = await localDbAdmin
      .from('book_copies').select('*').eq('book_id', bookId).order('copy_number');
    if (!error) setCopiesMap(prev => ({ ...prev, [bookId]: data || [] }));
    setCopiesLoading(false);
  }

  const toggleExpand = (bookId) => {
    if (expandedId === bookId) { setExpandedId(null); return; }
    setExpandedId(bookId);
    fetchCopies(bookId);
  };

  async function syncAuthors(bookId, text) {
    const authors = (text || '').split(',').map(n => n.trim()).filter(Boolean).join(', ');
    await localDbAdmin.from('books').update({ authors }).eq('id', bookId);
  }

  /* ── NEW: check barcode uniqueness against DB ── */
  const checkBarcodeUnique = async (val, currentEditId = null) => {
    if (!val || !val.trim()) return true;
    const { data } = await localDbAdmin
      .from('books')
      .select('id')
      .eq('barcode', val.trim());
    if (!data?.length) return true;
    // When editing, allow the same book to keep its own barcode
    if (currentEditId) return data.every(b => b.id === currentEditId);
    return false;
  };

  /* ── NEW: debounced barcode input handler ── */
  const handleBarcodeChange = (val) => {
    setForm(f => ({ ...f, barcode: val }));
    setBarcodeError('');
    if (barcodeCheckTimer.current) clearTimeout(barcodeCheckTimer.current);
    if (!val.trim()) return;
    setBarcodeChecking(true);
    barcodeCheckTimer.current = setTimeout(async () => {
      const isUnique = await checkBarcodeUnique(val, isEditing ? editId : null);
      setBarcodeChecking(false);
      if (!isUnique) {
        setBarcodeError(`Accession No. "${val.trim()}" is already used by another book.`);
      }
    }, 500);
  };

  /* ── copy generation ── */
  async function getNextCopyNum() {
    const { data } = await localDbAdmin
      .from('book_copies')
      .select('accession_id');
    if (!data?.length) return 1;
    const nums = data
      .map(r => parseInt((r.accession_id || '').split('-').pop(), 10))
      .filter(n => Number.isFinite(n) && n > 0);
    return nums.length ? Math.max(...nums) + 1 : 1;
  }

  async function generateCopies(bookId, count, dateAcquired, startCopy = 1) {
    const next = await getNextCopyNum();
    const rows = Array.from({ length: count }, (_, i) => ({
      book_id: bookId,
      copy_number: startCopy + i,
      accession_id: generateCopyAccessionId(next + i),
      status: 'available',
      date_acquired: dateAcquired || new Date().toISOString().split('T')[0],
    }));

    // Pre-check: ensure none of these accession_ids already exist
    const ids = rows.map(r => r.accession_id);
    const { data: existing } = await localDbAdmin
      .from('book_copies')
      .select('accession_id')
      .in('accession_id', ids);

    if (existing?.length) {
      const takenNums = existing
        .map(r => parseInt((r.accession_id || '').split('-').pop(), 10))
        .filter(n => Number.isFinite(n));
      const safeStart = Math.max(...takenNums) + 1;
      const safeRows = Array.from({ length: count }, (_, i) => ({
        book_id: bookId,
        copy_number: startCopy + i,
        accession_id: generateCopyAccessionId(safeStart + i),
        status: 'available',
        date_acquired: dateAcquired || new Date().toISOString().split('T')[0],
      }));
      const { error } = await localDbAdmin.from('book_copies').insert(safeRows);
      if (error) throw error;
      for (let i = 0; i < safeRows.length; i++) await fulfillNextReservation(bookId).catch(() => {});
      return;
    }

    const { error } = await localDbAdmin.from('book_copies').insert(rows);
    if (error) throw error;
    for (let i = 0; i < rows.length; i++) await fulfillNextReservation(bookId).catch(() => {});
  }

  /* ── session token ── */
  async function getToken() {
    const { data } = await localDb.auth.getSession();
    const t = data?.session?.access_token;
    if (!t) throw new Error('Please sign in again.');
    return t;
  }
  async function apiReq(url, opts = {}) {
    const token = await getToken();
    const res = await fetch(apiUrl(url), { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(r.error || 'Request failed.');
    return r;
  }

  /* ── NEW: get next unique barcode by finding numeric max ── */
  const getNextBarcode = async () => {
    const { data } = await localDbAdmin.from('books').select('barcode');
    if (!data?.length) return generateBarcode('00001');
    const nums = data
      .map(b => parseInt((b.barcode || '').replace(/\D/g, ''), 10))
      .filter(n => Number.isFinite(n) && n > 0);
    const max = nums.length ? Math.max(...nums) : 0;
    return generateBarcode((max + 1).toString().padStart(5, '0'));
  };

  /* ── book modal ── */
  const openAdd = async () => {
    setIsEditing(false);
    setEditId(null);
    setBarcodeError('');
    setBarcodeChecking(false);
    const nextBarcode = await getNextBarcode();
    setForm({ ...INIT_FORM, barcode: nextBarcode });
    setCoverFile(null);
    setCoverPreview(null);
    setShowBookModal(true);
  };

  const openEdit = async (book) => {
    setIsEditing(true);
    setEditId(book.id);
    setBarcodeError('');
    setBarcodeChecking(false);
    const { data: copies } = await localDbAdmin.from('book_copies').select('id').eq('book_id', book.id);
    setForm({
      ...INIT_FORM,
      ...book,
      authorsText: book.authors || '',
      quantity: copies?.length || 0,
    });
    setCoverFile(null);
    setCoverPreview(book.cover_image || null);
    setShowBookModal(true);
  };

  const closeBookModal = () => {
    setShowBookModal(false);
    setBarcodeError('');
    setBarcodeChecking(false);
    if (barcodeCheckTimer.current) clearTimeout(barcodeCheckTimer.current);
  };

  const handleCoverFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Select an image file.', 'warning'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be ≤ 5 MB.', 'warning'); return; }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  /* ── FIXED handleSaveBook: validates barcode uniqueness before opening confirm ── */
  const handleSaveBook = async (e) => {
    e.preventDefault();
    if ((form.title || '').trim().length > 100) { showToast('Title must be ≤ 100 characters.', 'error'); return; }

    const barcodeVal = (form.barcode || '').trim();
    if (!barcodeVal) { showToast('Accession / Code No. is required.', 'error'); return; }

    // Block if we already know it's a duplicate from the real-time check
    if (barcodeError) { showToast('Please fix the Accession No. before saving.', 'error'); return; }

    // Final DB uniqueness check (in case user bypassed debounce)
    const isUnique = await checkBarcodeUnique(barcodeVal, isEditing ? editId : null);
    if (!isUnique) {
      setBarcodeError(`Accession No. "${barcodeVal}" is already used by another book.`);
      showToast(`Accession No. "${barcodeVal}" is already in use. Please enter a unique one.`, 'error');
      return;
    }

    openConfirm({
      title: isEditing ? 'Confirm Book Update' : 'Confirm New Book',
      message: `${isEditing ? 'Update' : 'Add'} "${form.title.trim()}"?`,
      confirmText: isEditing ? 'Update Book' : 'Add Book',
      danger: false,
      onConfirm: async () => { closeConfirm(); await doSaveBook(); },
    });
  };

  /* ── FIXED doSaveBook: final uniqueness guard before DB write ── */
  const doSaveBook = async () => {
    setLoading(true);
    try {
      // Final safety check
      const barcodeVal = (form.barcode || '').trim();
      const isUnique = await checkBarcodeUnique(barcodeVal, isEditing ? editId : null);
      if (!isUnique) {
        setBarcodeError(`Accession No. "${barcodeVal}" is already used by another book.`);
        showToast(`Accession No. "${barcodeVal}" is already in use.`, 'error');
        setLoading(false);
        return;
      }

      let coverUrl = form.cover_image || null;
      if (coverFile) {
        const ext = coverFile.name.split('.').pop().toLowerCase();
        const { data: up, error: ue } = await localDbAdmin.storage
          .from('book-covers').upload(`covers/${Date.now()}-${form.barcode || 'book'}.${ext}`, coverFile, { upsert: true, contentType: coverFile.type });
        if (ue) throw new Error('Image upload failed: ' + ue.message);
        coverUrl = up?.publicUrl || null;
      }

      const { authorsText, authors: _a, quantity: _q, book_authors: _ba, ...rest } = form;
      const authors = (authorsText || '').split(',').map(n => n.trim()).filter(Boolean).join(', ');
      const payload = cleanPayload(coverColOk
        ? { ...rest, authors, cover_image: coverUrl }
        : { ...rest, authors });

      if (isEditing) {
        const { error } = await localDbAdmin.from('books').update(payload).eq('id', editId);
        if (error) throw error;

        // ── NEW: reconcile copies on edit ──
        if (!migNeeded) {
          const { data: existingCopies } = await localDbAdmin
            .from('book_copies').select('id').eq('book_id', editId);
          const currentCount = existingCopies?.length || 0;
          const targetCount  = Math.max(1, parseInt(form.quantity) || 1);

          if (targetCount > currentCount) {
            // Add the missing copies
            await generateCopies(
              editId,
              targetCount - currentCount,
              new Date().toISOString().split('T')[0],
              currentCount + 1   // startCopy
            );
          } else if (targetCount < currentCount) {
              const { data: allCopies } = await localDbAdmin
                .from('book_copies').select('id')
                .eq('book_id', editId)
                .order('copy_number', { ascending: false });

              const allCopyIds = (allCopies || []).map(c => c.id);

              // Find copies that ARE on active transactions
              let activeCopyIds = new Set();
              if (allCopyIds.length > 0) {
                const { data: activeTxns } = await localDbAdmin
                  .from('transactions')
                  .select('copy_id')
                  .in('copy_id', allCopyIds)
                  .in('status', ['pending', 'borrowed', 'overdue']);   // explicitly list active statuses
                (activeTxns || []).forEach(r => { if (r.copy_id) activeCopyIds.add(r.copy_id); });
              }

              const toDelete = (allCopies || [])
                .filter(c => !activeCopyIds.has(c.id))
                .slice(0, currentCount - targetCount)
                .map(c => c.id);

              if (toDelete.length > 0) {
                const { error: delErr } = await localDbAdmin
                  .from('book_copies').delete().in('id', toDelete);
                if (delErr) throw new Error('Failed to remove copies: ' + delErr.message);
              }

              const actuallyRemoved = toDelete.length;
              const skipped = (currentCount - targetCount) - actuallyRemoved;
              if (skipped > 0) {
                showToast(
                  `${actuallyRemoved} cop${actuallyRemoved !== 1 ? 'ies' : 'y'} removed. ` +
                  `${skipped} cop${skipped !== 1 ? 'ies' : 'y'} skipped (active transactions).`,
                  'warning'
                );
              }
            }
        }
      } else {
        const { data: ins, error } = await localDbAdmin.from('books').insert([payload]).select();
        if (error) throw error;
        const newId = ins?.[0]?.id;
        if (newId && !migNeeded) {
          try {
            await generateCopies(newId, Math.max(1, parseInt(form.quantity) || 1), new Date().toISOString().split('T')[0]);
          } catch (ce) {
            if (!isMigErr(ce)) showToast('Book saved but copy gen failed: ' + ce.message, 'warning');
          }
        }
      }

      closeBookModal();
      fetchAll();
      if (expandedId) fetchCopies(expandedId);
      showToast(isEditing ? 'Book updated.' : 'Book saved.');
    } catch (err) {
      showToast(err.message || 'Failed to save.', 'error');
    } finally {
      setLoading(false);
    }
  };

  /* ── archive / restore / delete ── */
  const doBookAction = (book, action) => {
    const labels = { archive: ['Archive Book', 'Archive'], restore: ['Restore Book', 'Restore'], delete: ['Delete Forever', 'Delete'] };
    const msgs   = {
      archive: `Archive "${book.title}"? It will be hidden from the catalog.`,
      restore: `Restore "${book.title}" to the active catalog?`,
      delete:  `Permanently delete "${book.title}"? This cannot be undone.`,
    };
    openConfirm({
      title: labels[action][0], message: msgs[action],
      confirmText: labels[action][1], danger: action === 'delete',
      onConfirm: async () => {
        closeConfirm();
        try {
          if (action === 'delete')  await apiReq(`/api/books/${book.id}`, { method: 'DELETE' });
          if (action === 'archive') await apiReq(`/api/books/${book.id}/archive`, { method: 'POST' });
          if (action === 'restore') await apiReq(`/api/books/${book.id}/unarchive`, { method: 'POST' });
          fetchAll();
          showToast(`"${book.title}" ${action === 'delete' ? 'deleted' : action === 'archive' ? 'archived' : 'restored'}.`);
        } catch (err) { showToast(err.message, 'error'); }
      },
    });
  };

  /* ── ebook ── */
  const openEbook = (eb = null) => {
    setEditingEbook(eb);
    setEbookForm(eb ? { title: eb.title, url: eb.source || '' } : { title: '', url: '' });
    setEbookImgOk(false); setShowEbookModal(true);
  };
  const saveEbook = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editingEbook) await apiReq(`/api/ebooks/${editingEbook.id}`, { method: 'PATCH', body: JSON.stringify(ebookForm) });
      else              await apiReq('/api/ebooks', { method: 'POST', body: JSON.stringify(ebookForm) });
      setShowEbookModal(false); fetchAll();
      showToast(editingEbook ? 'eBook updated.' : 'eBook saved.');
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  /* ── copy status ── */
  const updateCopyStatus = async (copyId, bookId, status) => {
    const { error } = await localDbAdmin.from('book_copies').update({ status }).eq('id', copyId);
    if (error) { showToast('Failed to update status.', 'error'); return; }
    fetchCopies(bookId); fetchAll(); showToast('Copy status updated.');
  };

  /* ── PDF export ── */
  const barcodePDF = async (copies, filename) => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const [cols, rows, mX, mY] = [3, 8, 8, 10];
    const cW = (210 - mX * 2) / cols, cH = (297 - mY * 2) / rows;
    let li = 0;
    copies.forEach((c, i) => {
      if (i > 0 && i % (cols * rows) === 0) { pdf.addPage(); li = 0; }
      const x = mX + (li % cols) * cW, y = mY + Math.floor(li / cols) * cH;
      const canvas = document.createElement('canvas');
      try {
        JsBarcode(canvas, c.accession_id, { format: 'CODE128', width: 1.5, height: 36, fontSize: 9, margin: 4, displayValue: true });
        const iW = cW - 6, iH = (canvas.height / canvas.width) * iW;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x + (cW - iW) / 2, y + 2, iW, iH);
        const t = (c.books?.title || '').slice(0, 28);
        pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 41, 59);
        pdf.text(t + (c.books?.title?.length > 28 ? '…' : ''), x + cW / 2, y + 2 + iH + 3, { align: 'center', maxWidth: cW - 4 });
        pdf.setFontSize(6.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 116, 139);
        pdf.text(`Copy #${c.copy_number}`, x + cW / 2, y + 2 + iH + 7, { align: 'center' });
        pdf.setDrawColor(220, 230, 240); pdf.setLineWidth(0.2); pdf.rect(x + 1, y + 1, cW - 2, cH - 2);
      } catch (err) { console.warn('Barcode fail:', c.accession_id); }
      li++;
    });
    pdf.save(filename);
  };
  const exportAll = async () => {
    const { data } = await localDbAdmin.from('book_copies').select('*, books(title,barcode)').order('accession_id');
    if (!data?.length) { showToast('No copies found.', 'warning'); return; }
    barcodePDF(data, `ShelfMaster-CopyBarcodes-${today()}.pdf`);
  };
  const exportAvail = async () => {
    const { data } = await localDbAdmin.from('book_copies').select('*, books(title,barcode)').eq('status', 'available').order('accession_id');
    if (!data?.length) { showToast('No available copies.', 'warning'); return; }
    barcodePDF(data, `ShelfMaster-AvailableBarcodes-${today()}.pdf`);
    showToast(`Exported ${data.length} barcodes.`);
  };
  const exportBook = async (book) => {
    const copies = copiesMap[book.id] || [];
    if (!copies.length) { showToast('No copies for this book.', 'warning'); return; }
    barcodePDF(copies.map(c => ({ ...c, books: { title: book.title } })), `${book.title.slice(0, 30)}-Copies.pdf`);
  };
  const exportReport = async () => {
    try {
      const { data, error } = await localDbAdmin.from('books').select('*').neq('status', 'archived').order('title');
      if (error || !data?.length) { showToast('No books found.', 'warning'); return; }
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const header = (title) => {
        doc.setFillColor(123, 31, 31); doc.rect(0, 0, 297, 22, 'F');
        doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text(title, 14, 14);
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${new Date().toLocaleString()}`, 200, 14);
        doc.setFillColor(245, 250, 232); doc.rect(0, 22, 297, 12, 'F');
      };
      header('ShelfMaster — Inventory Report');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
      doc.text(`Physical: ${data.filter(b => b.book_type !== 'eBook').length}   eBooks: ${data.filter(b => b.book_type === 'eBook').length}`, 14, 30);
      const { default: auto } = await import('jspdf-autotable');
      auto(doc, {
        startY: 36,
        head: [['#', 'Barcode', 'Title', 'Author(s)', 'Subject', 'Type', 'Copyright', 'Copies']],
        body: data.map((b, i) => [i + 1, b.barcode || '—', b.title, b.authors || '—', b.subject_class || '—', b.book_type || 'Physical', b.copyright || '—', (copiesMap[b.id] || []).length]),
        theme: 'grid',
        headStyles: { fillColor: [123, 31, 31], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 8, right: 8 },
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 7: { cellWidth: 24, halign: 'center' } },
      });
      doc.save(`ShelfMaster-Inventory-${today()}.pdf`);
      showToast('Report exported.');
    } catch (err) { showToast('Export failed: ' + err.message, 'error'); }
  };
  const today = () => new Date().toISOString().split('T')[0];

  /* ── filter + paginate ── */
  const filter = (list, q) => !q.trim() ? list : list.filter(b =>
    [b.title, b.authors, b.barcode, b.subject_class].some(f => (f || '').toLowerCase().includes(q.toLowerCase()))
  );
  const paginate = (list, p) => list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  const fBooks    = filter(books, search.books);
  const fEbooks   = filter(ebooks, search.ebooks);
  const fArchived = filter(archived, search.archived);

  const pBooks    = paginate(fBooks, pages.books);
  const pEbooks   = paginate(fEbooks, pages.ebooks);
  const pArchived = paginate(fArchived, pages.archived);

  const setSearch1 = (key, val) => { setSearch(s => ({ ...s, [key]: val })); setPages(p => ({ ...p, [key]: 1 })); };
  const setPage1   = (key, val) => setPages(p => ({ ...p, [key]: val }));

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <div className="inv-root" style={{ background: C.ivory, minHeight: '100vh', padding: '32px 28px 56px' }}>
      <style>{STYLES}</style>
      <Toast {...toast} onClose={() => setToast({ message: '' })} />
      <ConfirmModal
        isOpen={confirm.isOpen} title={confirm.title} message={confirm.message}
        confirmText={confirm.confirmText} danger={confirm.danger}
        onConfirm={confirm.onConfirm} onCancel={closeConfirm}
      />

      {/* ── Migration banner ── */}
      {migChecked && migNeeded && (
        <div style={{ background: '#FFFCF0', border: '1.5px solid #F5C340', borderRadius: 14, padding: '16px 22px', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706', flexShrink: 0 }}>
                <FaExclamationTriangle />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: '#92400E', fontSize: '.92rem' }}>One-time database setup required</p>
                <p style={{ margin: '3px 0 0', fontSize: '.82rem', color: '#78350F' }}>Run the SQL below in phpMyAdmin once to enable barcode tracking.</p>
              </div>
            </div>
            <button onClick={() => setShowMig(v => !v)} className="inv-btn btn-ghost" style={{ background: '#FDE68A', color: '#78350F', borderColor: '#F5C340' }}>
              {showMig ? 'Hide SQL' : 'Show Setup SQL'}
            </button>
          </div>
          {showMig && (
            <div style={{ marginTop: 16, position: 'relative' }}>
              <pre style={{ background: '#1A2332', color: '#86EFAC', padding: '14px 16px', borderRadius: 10, fontSize: '.76rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0 }}>
                {MIGRATION_SQL}
              </pre>
              <button onClick={() => { navigator.clipboard.writeText(MIGRATION_SQL); showToast('SQL copied!'); }}
                className="inv-btn btn-dark" style={{ position: 'absolute', top: 8, right: 8, fontSize: '.72rem', padding: '4px 12px' }}>Copy</button>
            </div>
          )}
        </div>
      )}

      {/* ── Page header ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--maroon)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 }}>
            <FaBook />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 'clamp(20px,3vw,24px)', fontWeight: 700, color: 'var(--maroon)', lineHeight: 1.1 }}>Inventory</h2>
            <p style={{ margin: '3px 0 0', fontSize: '.83rem', color: C.soft }}>Manage physical books, eBooks, and archived titles.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tab === 'ebooks' && <button onClick={() => openEbook()} className="inv-btn btn-indigo"><FaPlus style={{ fontSize: 11 }} /> Add eBook</button>}
          {tab === 'books' && <>
            <button onClick={() => openConfirm({ title: 'Export All Barcodes', message: 'Export all copy barcodes as PDF?', confirmText: 'Export', danger: false, onConfirm: () => { closeConfirm(); exportAll(); } })} className="inv-btn btn-dark"><FaDownload style={{ fontSize: 11 }} /> All Barcodes</button>
            <button onClick={() => openConfirm({ title: 'Export Available Barcodes', message: 'Export available copy barcodes as PDF?', confirmText: 'Export', danger: false, onConfirm: () => { closeConfirm(); exportAvail(); } })} className="inv-btn btn-green"><FaDownload style={{ fontSize: 11 }} /> Available</button>
            <button onClick={() => openConfirm({ title: 'Export Inventory Report', message: 'Generate a full inventory report as PDF?', confirmText: 'Export', danger: false, onConfirm: () => { closeConfirm(); exportReport(); } })} className="inv-btn btn-indigo"><FaFileAlt style={{ fontSize: 11 }} /> Report</button>
            <button onClick={openAdd} className="inv-btn btn-maroon"><FaPlus style={{ fontSize: 11 }} /> Add Book</button>
          </>}
        </div>
      </header>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { key: 'books',    label: 'Physical Books', icon: <FaBookOpen style={{ fontSize: 13 }} />, count: books.length,    color: 'var(--maroon)' },
          { key: 'ebooks',   label: 'eBooks',         icon: <MdTabletMac style={{ fontSize: 14 }} />, count: ebooks.length,  color: '#6366F1' },
          { key: 'archived', label: 'Archived',       icon: <FaArchive style={{ fontSize: 12 }} />,   count: archived.length, color: '#C0143A' },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); }} className="inv-tab"
            style={{ background: tab === t.key ? t.color : '#fff', color: tab === t.key ? '#fff' : C.muted, border: `1.5px solid ${tab === t.key ? t.color : C.border}`, boxShadow: tab === t.key ? `0 4px 16px ${t.color}44` : 'none' }}>
            {t.icon} {t.label}
            <span style={{ background: tab === t.key ? 'rgba(255,255,255,.22)' : C.ivoryDk, color: tab === t.key ? '#fff' : C.muted, borderRadius: 20, padding: '1px 8px', fontSize: '.74rem', fontWeight: 700 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ══════ PHYSICAL BOOKS ══════ */}
      {tab === 'books' && (
        <TableCard>
          <SearchBar value={search.books} onChange={v => setSearch1('books', v)} total={books.length} filtered={fBooks.length} placeholder="Search by title, author, accession #, or subject…" />
          <div className="inv-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 800 }}>
              <colgroup>
                <col style={{ width: '110px' }} /><col style={{ width: '22%' }} /><col style={{ width: '18%' }} />
                <col style={{ width: '15%' }} /><col style={{ width: '78px' }} /><col style={{ width: '70px' }} />
                <col style={{ width: '110px' }} /><col style={{ width: '170px' }} />
              </colgroup>
              <Thead cols={['Accession No.', 'Title', 'Author', 'Subject / Class', 'Year', 'Avail.', 'Copies', 'Actions']} />
              <tbody>
                {fBooks.length === 0
                  ? <EmptyRow cols={8} icon={<FaBook />} msg={books.length === 0 ? 'No physical books yet.' : `No books match "${search.books}".`} />
                  : pBooks.map((book, idx) => {
                    const avail = copyCounts[book.id] ?? book.quantity ?? 0;
                    const notBorrow = book.is_borrowable === false;
                    return (
                      <React.Fragment key={book.id}>
                        <tr className="inv-tr" style={{ borderBottom: expandedId === book.id ? `1px dashed ${C.border}` : `1px solid ${C.ivoryDk}`, background: idx % 2 === 0 ? '#fff' : '#FDFCF9' }}>
                          <td style={{ padding: '12px 14px' }}>
                            <code style={{ background: '#FFF0E8', color: 'var(--maroon)', padding: '3px 8px', borderRadius: 6, fontFamily: 'monospace', fontWeight: 700, fontSize: '.78rem' }}>
                              {book.barcode || '—'}
                            </code>
                          </td>
                          <td style={{ padding: '12px 14px' }} title={book.title}>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '.87rem', color: C.text }}>{book.title}</p>
                            {notBorrow && <span className="no-borrow-tag" style={{ marginTop: 4 }}><FaBan style={{ fontSize: 9 }} /> Reference Only</span>}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontSize: '.84rem', color: C.soft }}>{book.authors || '—'}</span>
                          </td>
                          <td style={{ padding: '12px 14px' }}><span style={{ fontSize: '.82rem', color: C.soft }}>{book.subject_class || '—'}</span></td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: '.82rem', color: C.muted }}>{book.copyright || '—'}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '1rem', color: avail > 0 ? '#137A4E' : '#B91C1C' }}>{avail}</span>
                            <span style={{ fontSize: '.68rem', color: C.muted, display: 'block', marginTop: 1 }}>copies</span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {migNeeded
                              ? <span style={{ fontSize: '.73rem', color: C.muted, fontStyle: 'italic' }}>Setup needed</span>
                              : <button onClick={() => toggleExpand(book.id)} className={`inv-btn btn-expand${expandedId === book.id ? ' open' : ''}`} style={{ padding: '5px 11px', fontSize: '.75rem', width: '100%', justifyContent: 'center' }}>
                                  {expandedId === book.id ? <FaChevronUp style={{ fontSize: 10 }} /> : <FaChevronDown style={{ fontSize: 10 }} />}
                                  {expandedId === book.id ? 'Hide' : 'View'}
                                </button>}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => openEdit(book)} className="inv-btn btn-ghost"><FaEdit style={{ fontSize: 11 }} /> Edit</button>
                              <button onClick={() => doBookAction(book, 'archive')} className="inv-btn btn-archive"><FaArchive style={{ fontSize: 10 }} /> Archive</button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === book.id && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, borderBottom: `1px solid ${C.ivoryDk}`, background: '#F9F7F2' }}>
                              <div className="inv-expand-panel" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                                  <div>
                                    <h4 style={{ margin: 0, fontSize: '.95rem', fontWeight: 600, color: C.text }}>Physical Copies</h4>
                                    <p style={{ margin: '2px 0 0', fontSize: '.78rem', color: C.muted }}>{book.title}</p>
                                  </div>
                                  <button onClick={() => openConfirm({ title: 'Export Copy Barcodes', message: `Export barcodes for "${book.title}"?`, confirmText: 'Export', danger: false, onConfirm: () => { closeConfirm(); exportBook(book); } })} className="inv-btn btn-dark" style={{ fontSize: '.78rem' }}>
                                    <FaDownload style={{ fontSize: 10 }} /> Export Barcodes
                                  </button>
                                </div>
                                {copiesLoading
                                  ? <p style={{ color: C.muted, fontSize: '.85rem', fontStyle: 'italic' }}>Loading…</p>
                                  : !(copiesMap[book.id] || []).length
                                    ? <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                                        <p style={{ color: C.muted, margin: 0, fontSize: '.83rem', fontStyle: 'italic' }}>No copies yet.</p>
                                        <button onClick={async () => { try { await generateCopies(book.id, 1, null); await fetchCopies(book.id); showToast('Copy generated.'); } catch (e) { showToast(e.message, 'error'); } }} className="inv-btn btn-green" style={{ fontSize: '.8rem' }}>Generate Copy</button>
                                      </div>
                                    : <div style={{ overflowX: 'auto', borderRadius: 10 }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem', minWidth: 560 }}>
                                          <Thead cols={['Copy #', 'Accession ID', 'Status', 'Date Acquired', 'Change Status']} light />
                                          <tbody>
                                            {(copiesMap[book.id] || []).map(copy => {
                                              const nb = book.is_borrowable === false;
                                              return (
                                                <tr key={copy.id} className="inv-tr" style={{ borderBottom: `1px solid ${C.ivoryDk}` }}>
                                                  <td style={{ padding: '10px 12px', fontWeight: 700, color: C.soft, whiteSpace: 'nowrap' }}>
                                                    Copy {copy.copy_number}
                                                    {nb && <span className="no-borrow-tag" style={{ marginLeft: 6 }}><FaBan style={{ fontSize: 8 }} /> Ref Only</span>}
                                                  </td>
                                                  <td style={{ padding: '10px 12px' }}>
                                                    <code style={{ background: '#EEF2FF', color: '#4338CA', padding: '3px 9px', borderRadius: 6, fontFamily: 'monospace', fontWeight: 700, fontSize: '.79rem' }}>
                                                      {copy.accession_id}
                                                    </code>
                                                  </td>
                                                  <td style={{ padding: '10px 12px' }}>
                                                    <span className={`inv-status s-${copy.status}`}>
                                                      {copy.status.charAt(0).toUpperCase() + copy.status.slice(1)}
                                                    </span>
                                                  </td>
                                                  <td style={{ padding: '10px 12px', color: C.muted, whiteSpace: 'nowrap' }}>{copy.date_acquired || '—'}</td>
                                                  <td style={{ padding: '10px 12px' }}>
                                                    <select value={copy.status} onChange={e => updateCopyStatus(copy.id, book.id, e.target.value)} className="inv-copy-select">
                                                      {['available', 'damaged', 'lost'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                                                    </select>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                }
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <Pagination list={fBooks} page={pages.books} onPage={v => setPage1('books', v)} />

          {/* Mobile cards */}
          <div className="inv-mobile-cards" style={{ padding: '12px 14px' }}>
            {pBooks.map(book => {
              const avail = copyCounts[book.id] ?? book.quantity ?? 0;
              const notBorrow = book.is_borrowable === false;
              return (
                <div key={book.id} className="inv-record-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: '.9rem', color: C.text, flex: 1 }}>
                      {book.title}
                      {notBorrow && <span className="no-borrow-tag" style={{ display: 'flex', marginTop: 4, width: 'fit-content' }}><FaBan style={{ fontSize: 9 }} /> Reference Only</span>}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '.95rem', color: avail > 0 ? '#137A4E' : '#B91C1C', flexShrink: 0 }}>
                      {avail} <span style={{ fontSize: '.68rem', color: C.muted, fontWeight: 400 }}>avail</span>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 0 }}>
                    {[['Accession No.', <code style={{ background: '#FFF0E8', color: 'var(--maroon)', padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', fontWeight: 700, fontSize: '.78rem' }}>{book.barcode || '—'}</code>],
                      ['Author', book.authors || '—'],
                      ['Subject', book.subject_class || '—'],
                      ['Year', book.copyright || '—']].map(([label, val]) => (
                        <div key={label}>
                          <div className="inv-card-label">{label}</div>
                          <div className="inv-card-val">{val}</div>
                        </div>
                    ))}
                  </div>
                  <div className="inv-card-footer">
                    <button onClick={() => openEdit(book)} className="inv-btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}><FaEdit style={{ fontSize: 11 }} /> Edit</button>
                    <button onClick={() => doBookAction(book, 'archive')} className="inv-btn btn-archive" style={{ flex: 1, justifyContent: 'center' }}><FaArchive style={{ fontSize: 10 }} /> Archive</button>
                  </div>
                </div>
              );
            })}
            <Pagination list={fBooks} page={pages.books} onPage={v => setPage1('books', v)} />
          </div>
        </TableCard>
      )}

      {/* ══════ EBOOKS ══════ */}
      {tab === 'ebooks' && (
        <div>
          <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 20px rgba(42,33,24,.05)', flexWrap: 'wrap' }}>
            <SearchBar value={search.ebooks} onChange={v => setSearch1('ebooks', v)} total={ebooks.length} filtered={fEbooks.length} placeholder="Search eBooks…" inline />
          </div>
          {ebooks.length === 0
            ? <EmptyState icon={<MdTabletMac />} msg='No eBooks yet. Click "Add eBook" above.' />
            : fEbooks.length === 0
              ? <EmptyState icon={<MdTabletMac />} msg={`No eBooks match "${search.ebooks}".`} />
              : <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 18 }}>
                    {pEbooks.map(eb => <EbookCard key={eb.id} ebook={eb} onEdit={() => openEbook(eb)} onArchive={() => doBookAction(eb, 'archive')} />)}
                  </div>
                  <Pagination list={fEbooks} page={pages.ebooks} onPage={v => setPage1('ebooks', v)} />
                </>
          }
        </div>
      )}

      {/* ══════ ARCHIVED ══════ */}
      {tab === 'archived' && (
        <TableCard>
          <SearchBar value={search.archived} onChange={v => setSearch1('archived', v)} total={archived.length} filtered={fArchived.length} placeholder="Search archived books…" />
          <div className="inv-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 480 }}>
              <colgroup><col style={{ width: '40%' }} /><col style={{ width: '25%' }} /><col style={{ width: '100px' }} /><col style={{ width: '170px' }} /></colgroup>
              <Thead cols={['Title', 'Author', 'Type', 'Actions']} archived />
              <tbody>
                {fArchived.length === 0
                  ? <EmptyRow cols={4} icon={<FaArchive />} msg={archived.length === 0 ? 'No archived books.' : `No matches for "${search.archived}".`} />
                  : pArchived.map((book, idx) => (
                      <tr key={book.id} className="inv-tr" style={{ borderBottom: `1px solid ${C.ivoryDk}`, background: idx % 2 === 0 ? '#fff' : '#FDFCF9' }}>
                        <td style={{ padding: '13px 16px' }}>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: '.88rem', color: C.text }}>{book.title}</p>
                          <code style={{ fontSize: '.72rem', color: C.muted, background: C.ivoryDk, padding: '1px 7px', borderRadius: 4, marginTop: 3, display: 'inline-block' }}>#{book.barcode}</code>
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: '.85rem', color: C.soft }}>{book.authors || '—'}</span>
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.8rem', color: C.soft }}>
                            {book.book_type === 'eBook' ? <><MdTabletMac /> eBook</> : <><FaBookOpen style={{ fontSize: 12 }} /> Physical</>}
                          </span>
                          {book.is_borrowable === false && <span className="no-borrow-tag" style={{ marginLeft: 6 }}><FaBan style={{ fontSize: 9 }} /> Ref Only</span>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => doBookAction(book, 'restore')} className="inv-btn btn-restore"><FaRedo style={{ fontSize: 10 }} /> Restore</button>
                            <button onClick={() => doBookAction(book, 'delete')} className="inv-btn btn-delete"><FaTrash style={{ fontSize: 10 }} /> Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
          <Pagination list={fArchived} page={pages.archived} onPage={v => setPage1('archived', v)} />

          <div className="inv-mobile-cards" style={{ padding: '12px 14px' }}>
            {pArchived.map(book => (
              <div key={book.id} className="inv-record-card" style={{ borderLeft: '3px solid #C0143A' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '.9rem', color: C.text, flex: 1 }}>{book.title}</span>
                  <span style={{ fontSize: '.72rem', background: '#FFF1F3', color: '#C0143A', padding: '2px 8px', borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>{book.book_type === 'eBook' ? 'eBook' : 'Physical'}</span>
                </div>
                {[['Accession', `#${book.barcode}`], ['Author', book.authors || '—']].map(([l, v]) => (
                  <div key={l} style={{ marginBottom: 6 }}>
                    <div className="inv-card-label">{l}</div>
                    <div className="inv-card-val" style={{ color: C.soft }}>{v}</div>
                  </div>
                ))}
                <div className="inv-card-footer">
                  <button onClick={() => doBookAction(book, 'restore')} className="inv-btn btn-restore" style={{ flex: 1, justifyContent: 'center' }}><FaRedo style={{ fontSize: 10 }} /> Restore</button>
                  <button onClick={() => doBookAction(book, 'delete')} className="inv-btn btn-delete" style={{ flex: 1, justifyContent: 'center' }}><FaTrash style={{ fontSize: 10 }} /> Delete</button>
                </div>
              </div>
            ))}
            <Pagination list={fArchived} page={pages.archived} onPage={v => setPage1('archived', v)} />
          </div>
        </TableCard>
      )}

      {/* ══════ EBOOK MODAL ══════ */}
      {showEbookModal && (
        <Modal onClose={() => setShowEbookModal(false)}>
          <ModalHead icon={<MdTabletMac />} iconBg="#EEF2FF" iconColor="#6366F1" title={editingEbook ? 'Edit eBook' : 'Add New eBook'} sub="Enter the eBook title and URL link." />
          <form onSubmit={saveEbook}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="eBook Title"><input type="text" required placeholder="e.g. Introduction to Python" className="inv-input" value={ebookForm.title} onChange={e => setEbookForm({ ...ebookForm, title: e.target.value })} /></Field>
              <Field label="URL / Link"><input type="url" required placeholder="https://example.com/book.pdf" className="inv-input" value={ebookForm.url} onChange={e => { setEbookForm({ ...ebookForm, url: e.target.value }); setEbookImgOk(false); }} /></Field>
              {ebookForm.url && (
                <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.ivory }}>
                  <img src={ebookForm.url} alt="preview" onLoad={() => setEbookImgOk(true)} onError={() => setEbookImgOk(false)} style={{ display: ebookImgOk ? 'block' : 'none', width: '100%', maxHeight: 200, objectFit: 'contain' }} />
                  {!ebookImgOk && <div style={{ padding: 22, textAlign: 'center', color: C.muted, fontSize: '.82rem' }}><MdTabletMac style={{ fontSize: '2rem', marginBottom: 6, color: '#C8BFAF' }} /><p style={{ margin: 0 }}>No image preview</p></div>}
                </div>
              )}
            </div>
            <ModalFoot>
              <button type="button" onClick={() => setShowEbookModal(false)} className="inv-btn btn-ghost">Cancel</button>
              <button type="submit" disabled={loading} className="inv-btn btn-indigo" style={{ padding: '9px 22px' }}>{loading ? 'Saving…' : editingEbook ? 'Update eBook' : 'Save eBook'}</button>
            </ModalFoot>
          </form>
        </Modal>
      )}

      {/* ══════ BOOK MODAL ══════ */}
      {showBookModal && (
        <Modal onClose={closeBookModal}>
          <ModalHead icon={<FaBook />} iconBg="#FFF0E8" iconColor="var(--maroon)" title={isEditing ? 'Update Book Details' : 'Register New Book'} sub={<>Fields marked <span style={{ color: 'var(--maroon)' }}>*</span> are required.</>} />
          <form onSubmit={handleSaveBook}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#FFF8F0', border: '1.5px solid #F5CEB0', borderRadius: 12, padding: '12px 14px' }}>
                <Field label={<Req>Accession / Code No.</Req>}>
                  <input
                    type="text"
                    required
                    className={`inv-input${barcodeError ? ' input-error' : ''}`}
                    style={{ background: '#fff' }}
                    value={form.barcode}
                    onChange={e => handleBarcodeChange(e.target.value)}
                  />
                  {barcodeChecking && (
                    <p style={{ margin: '4px 0 0', fontSize: '.74rem', color: C.muted }}>Checking availability…</p>
                  )}
                  {barcodeError && (
                    <p className="field-error-msg">
                      <FaExclamationTriangle style={{ fontSize: 11 }} /> {barcodeError}
                    </p>
                  )}
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
                <Field label={<Req>Title</Req>} style={{ gridColumn: '1/-1' }}>
                  <input type="text" required className="inv-input" placeholder="Enter Title" maxLength={100} value={form.title} onChange={e => setForm({ ...form, title: e.target.value.slice(0, 100) })} />
                </Field>
                <Field label={<Req>Author(s)</Req>}>
                  <input type="text" required className="inv-input" placeholder="Separate multiple with commas" value={form.authorsText} onChange={e => setForm({ ...form, authorsText: e.target.value })} />
                </Field>
                <Field label={<Req>Classification / Subject</Req>}>
                  <input type="text" required className="inv-input" placeholder="Enter Classification" value={form.subject_class || ''} onChange={e => setForm({ ...form, subject_class: e.target.value })} />
                </Field>
                <Field label={<Req>Copyright Year</Req>}>
                  <input type="text" required className="inv-input" placeholder="Enter Year" value={form.copyright || ''} onChange={e => setForm({ ...form, copyright: e.target.value })} />
                </Field>
                <Field label="Number of Copies">
                  <input type="number" min="1" className="inv-input"
                    value={form.quantity}
                    onChange={e => setForm({ ...form, quantity: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1) })}
                    onBlur={e => { const v = parseInt(e.target.value); setForm(f => ({ ...f, quantity: isNaN(v) || v < 1 ? 1 : v })); }} />
                </Field>
              </div>

              {!migNeeded && !isEditing && (
                <div style={{ background: '#F0FDF4', border: '1.5px solid #A8EDD1', borderRadius: 10, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FaCheckCircle style={{ color: 'var(--green,#7DB356)', fontSize: 18, flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: '.82rem', fontWeight: 700, color: '#137A4E' }}>
                    {form.quantity || 1} copy barcode{parseInt(form.quantity) !== 1 ? 's' : ''} will be auto-generated
                  </p>
                </div>
              )}

              {/* Cover upload */}
              <Field label="Book Cover (optional · max 5 MB)">
                {coverPreview
                  ? <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <img src={coverPreview} alt="Cover" style={{ width: 90, height: 122, objectFit: 'cover', borderRadius: 9, border: `2px solid ${C.border}` }} />
                        <button type="button" onClick={() => { setCoverFile(null); setCoverPreview(null); setForm(f => ({ ...f, cover_image: null })); }}
                          style={{ position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: '50%', background: '#EF4444', color: '#fff', border: 'none', fontSize: '.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
                      </div>
                      <p style={{ margin: 0, fontSize: '.75rem', color: C.muted, alignSelf: 'flex-end', wordBreak: 'break-all' }}>{coverFile ? coverFile.name : 'Existing cover'}</p>
                    </div>
                  : <div className={`inv-drop-zone${coverDrag ? ' drag-over' : ''}`}
                      onClick={() => coverRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setCoverDrag(true); }}
                      onDragLeave={() => setCoverDrag(false)}
                      onDrop={e => { e.preventDefault(); setCoverDrag(false); handleCoverFile(e.dataTransfer.files[0]); }}>
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🖼️</div>
                      <p style={{ margin: 0, fontWeight: 600, color: C.soft, fontSize: '.85rem' }}>Click or drag & drop a cover image</p>
                      <p style={{ margin: '4px 0 0', fontSize: '.73rem', color: C.muted }}>JPG, PNG, WEBP — 5 MB max</p>
                    </div>
                }
                <input ref={coverRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { handleCoverFile(e.target.files?.[0]); e.target.value = ''; }} />
              </Field>
            </div>

            {/* Borrowing settings */}
            <div style={{ borderTop: `1.5px solid ${C.ivoryDk}`, marginTop: 8, paddingTop: 20 }}>
              <p style={{ margin: '0 0 14px', fontSize: '.78rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.6px' }}>Borrowing Settings</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px' }}>
                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 12, background: form.is_borrowable !== false ? '#F0FDF4' : '#FFF1F1', border: `1.5px solid ${form.is_borrowable !== false ? '#A8EDD1' : '#FECACA'}`, borderRadius: 10, padding: '12px 16px' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, is_borrowable: f.is_borrowable === false ? true : false }))}
                    style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.is_borrowable !== false ? 'var(--green,#7DB356)' : '#D1D5DB', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, left: form.is_borrowable !== false ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }} />
                  </button>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '.88rem', color: form.is_borrowable !== false ? '#137A4E' : '#B91C1C' }}>
                      {form.is_borrowable !== false ? 'Borrowable' : 'Not Borrowable (Reference Only)'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '.74rem', color: C.muted }}>
                      {form.is_borrowable !== false ? 'Students can borrow this book' : 'In-library use only'}
                    </p>
                  </div>
                </div>
                {form.is_borrowable !== false && <>
                  <Field label="Max Copies to Lend (optional)">
                    <input type="number" min="1" className="inv-input" placeholder={`Max of ${form.quantity || '?'}`} value={form.max_borrowable_copies || ''} onChange={e => setForm({ ...form, max_borrowable_copies: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1) })} />
                  </Field>
                  <Field label="Borrow Duration (days, optional)">
                    <input type="number" min="1" className="inv-input" placeholder="Uses global setting" value={form.borrow_duration_days || ''} onChange={e => setForm({ ...form, borrow_duration_days: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1) })} />
                  </Field>
                </>}
              </div>
            </div>

            <ModalFoot>
              <button type="button" onClick={closeBookModal} className="inv-btn btn-ghost">Cancel</button>
              <button
                type="submit"
                disabled={loading || !!barcodeError || barcodeChecking}
                className="inv-btn btn-maroon"
                style={{ padding: '9px 22px' }}
              >
                {loading ? 'Saving…' : barcodeChecking ? 'Checking…' : isEditing ? 'Update Book' : `Add Book & Generate ${form.quantity || 1} ${parseInt(form.quantity) === 1 ? 'Copy' : 'Copies'}`}
              </button>
            </ModalFoot>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════ */
const Req = ({ children }) => <><span style={{ color: 'var(--maroon)' }}>*</span> {children}</>;

function TableCard({ children }) {
  return <div style={{ background: '#fff', borderRadius: 16, border: `1px solid #E8E2D7`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(42,33,24,.05)' }}>{children}</div>;
}

function SearchBar({ value, onChange, total, filtered, placeholder, inline }) {
  const C2 = { muted: '#8C8070', border: '#E8E2D7' };
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <FaSearch style={{ color: C2.muted, fontSize: 14, flexShrink: 0 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="inv-input"
          style={{ border: 'none', background: 'transparent', padding: '4px 0', fontSize: '.88rem', flex: 1, boxShadow: 'none', minWidth: 0 }} />
        {value && <button onClick={() => onChange('')} className="inv-btn btn-ghost" style={{ padding: '4px 11px', fontSize: '.75rem' }}>Clear</button>}
      </div>
      <span style={{ fontSize: '.75rem', color: C2.muted, whiteSpace: 'nowrap', borderLeft: `1px solid ${C2.border}`, paddingLeft: 12, flexShrink: 0 }}>
        {filtered} / {total}
      </span>
    </>
  );
  if (inline) return <>{inner}</>;
  return <div className="inv-search-bar">{inner}</div>;
}

function Thead({ cols, light, archived }) {
  const bg = archived ? '#FFF5F7' : light ? 'transparent' : '#F9F6EF';
  const color = archived ? '#C0143A' : '#8C8070';
  const bb = archived ? '1.5px solid #FCC9D3' : light ? '1.5px solid #E8E2D7' : '1.5px solid #E8E2D7';
  return (
    <thead>
      <tr style={{ background: bg, borderBottom: bb }}>
        {cols.map(h => (
          <th key={h} style={{ padding: light ? '8px 12px' : '13px 14px', textAlign: 'left', fontSize: '.7rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.6px', whiteSpace: 'nowrap' }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}

function EmptyRow({ cols, icon, msg }) {
  return (
    <tr><td colSpan={cols}>
      <div style={{ padding: '52px 20px', textAlign: 'center', color: '#B5A99A' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 10, opacity: .3 }}>{icon}</div>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '.9rem', color: '#8C8070' }}>{msg}</p>
      </div>
    </td></tr>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1.5px dashed #E0D9CE', padding: '52px 20px', textAlign: 'center', color: '#B5A99A' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 10, opacity: .3 }}>{icon}</div>
      <p style={{ margin: 0, fontWeight: 600, fontSize: '.9rem', color: '#8C8070' }}>{msg}</p>
    </div>
  );
}

function Pagination({ list, page, onPage }) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1, to = Math.min(page * PAGE_SIZE, total);
  const ps = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) ps.push(i);
    else if (ps[ps.length - 1] !== '…') ps.push('…');
  }
  const btnStyle = (active) => ({ padding: '5px 10px', borderRadius: 7, border: `1.5px solid ${active ? 'var(--maroon)' : '#E8E2D7'}`, background: active ? 'var(--maroon)' : '#fff', color: active ? '#fff' : '#2A2118', cursor: active ? 'default' : 'pointer', fontSize: '.8rem', fontWeight: active ? 700 : 500, fontFamily: "'DM Sans',sans-serif", minWidth: 34 });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid #F1EDE3', flexWrap: 'wrap', gap: 10 }}>
      <span style={{ fontSize: '.78rem', color: '#8C8070' }}>Showing <strong style={{ color: '#2A2118' }}>{from}–{to}</strong> of <strong style={{ color: '#2A2118' }}>{total}</strong></span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} style={{ ...btnStyle(false), color: page <= 1 ? '#C8BFAF' : '#2A2118', cursor: page <= 1 ? 'default' : 'pointer' }}>‹ Prev</button>
        {ps.map((p, i) => p === '…'
          ? <span key={`e${i}`} style={{ padding: '5px 6px', fontSize: '.8rem', color: '#8C8070' }}>…</span>
          : <button key={p} onClick={() => onPage(p)} style={btnStyle(p === page)}>{p}</button>
        )}
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} style={{ ...btnStyle(false), color: page >= totalPages ? '#C8BFAF' : '#2A2118', cursor: page >= totalPages ? 'default' : 'pointer' }}>Next ›</button>
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <label style={{ fontSize: '.7rem', fontWeight: 700, color: '#8C8070', textTransform: 'uppercase', letterSpacing: '.5px', userSelect: 'none' }}>{label}</label>
      {children}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: 16, backdropFilter: 'blur(2px)' }}>
      <div className="inv-modal" style={{ background: '#fff', padding: '26px 28px', borderRadius: 18, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(42,33,24,.2)', wordBreak: 'break-word' }}>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ icon, iconBg, iconColor, title, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, fontSize: 16, flexShrink: 0 }}>{icon}</div>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#2A2118' }}>{title}</h3>
      </div>
      <p style={{ margin: '0 0 0 46px', fontSize: '.82rem', color: '#8C8070' }}>{sub}</p>
    </div>
  );
}

function ModalFoot({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid #F1EDE3', flexWrap: 'wrap' }}>{children}</div>;
}

function EbookCard({ ebook, onEdit, onArchive }) {
  const [imgOk, setImgOk] = useState(false);
  return (
    <div className="inv-ebook-card" style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8E2D7', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 14px rgba(42,33,24,.06)' }}>
      <div style={{ height: 148, background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {ebook.source && <img src={ebook.source} alt={ebook.title} onLoad={() => setImgOk(true)} onError={() => setImgOk(false)} style={{ display: imgOk ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'cover' }} />}
        {!imgOk && <div style={{ textAlign: 'center', color: '#6366F1' }}><MdTabletMac style={{ fontSize: '2.8rem' }} /><div style={{ fontSize: '.62rem', fontWeight: 800, marginTop: 4, color: '#A5B4FC', letterSpacing: '1.5px' }}>eBOOK</div></div>}
        <div style={{ position: 'absolute', top: 8, right: 8, background: '#6366F1', color: '#fff', fontSize: '.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>DIGITAL</div>
      </div>
      <div style={{ padding: '14px 14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '.86rem', color: '#2A2118', lineHeight: 1.35 }} title={ebook.title}>{ebook.title}</p>
        {ebook.source && (
          <a href={ebook.source} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', background: '#EEF2FF', color: '#6366F1', textAlign: 'center', padding: 7, borderRadius: 8, fontSize: '.79rem', fontWeight: 700, textDecoration: 'none' }}>
            <FaLink style={{ verticalAlign: 'middle', marginRight: 5, fontSize: 11 }} /> Open eBook
          </a>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
          <button onClick={onEdit} className="inv-btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}><FaEdit style={{ fontSize: 11 }} /> Edit</button>
          <button onClick={onArchive} className="inv-btn btn-archive" style={{ flex: 1, justifyContent: 'center' }}><FaArchive style={{ fontSize: 10 }} /> Archive</button>
        </div>
      </div>
    </div>
  );
}