import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { localDb } from './localDbClient';
import StudentNavbar from './StudentNavbar';
import Toast from './Toast';
import { FaBookOpen, FaCalendarAlt, FaExclamationTriangle, FaSearch, FaShieldAlt } from 'react-icons/fa';
import { MdClose } from 'react-icons/md';

export default function StudentCatalog() {
  const [searchParams] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('title-asc');
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const showToast = (message, type = 'success') => setToast({ message, type });

  const [borrowBook, setBorrowBook] = useState(null);
  const [borrowDueDate, setBorrowDueDate] = useState('');
  const [activeLoansCount, setActiveLoansCount] = useState(0);
  const [maxLoans, setMaxLoans] = useState(3);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fullscreenCover, setFullscreenCover] = useState(null);

  const [borrowPolicy, setBorrowPolicy] = useState({
    fine_amount: 5,
    fine_increment_value: 1,
    fine_increment_type: 'per_day',
  });

  const ACTIVE_STATUSES = ['pending', 'approved', 'released', 'claimed', 'borrowed', 'issued', 'active', 'loaned', 'checked_out', 'overdue'];

  useEffect(() => {
    async function init() {
      const { data } = await localDb.from('fine_policy')
        .select('fine_per_day, fine_increment_value, fine_increment_type, max_borrow_count')
        .eq('id', 1).maybeSingle();
      if (data) {
        setBorrowPolicy({
          fine_amount: data.fine_per_day ?? 5,
          fine_increment_value: Math.max(1, Number(data.fine_increment_value ?? 1)),
          fine_increment_type: data.fine_increment_type || 'per_day',
        });
        if (data.max_borrow_count) setMaxLoans(Math.max(1, data.max_borrow_count));
      }
      await refreshLoanCount();
    }
    init();
  }, []);

  async function refreshLoanCount() {
    try {
      const { data: { user } } = await localDb.auth.getUser();
      if (!user) return 0;
      const { data: userData } = await localDb.from('users').select('id').eq('auth_id', user.id).maybeSingle();
      if (!userData) return 0;
      const { count } = await localDb.from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userData.id)
        .in('status', ACTIVE_STATUSES);
      const n = count || 0;
      setActiveLoansCount(n);
      return n;
    } catch { return 0; }
  }

  function computeDueDate(book) {
    const days = book?.borrow_duration_days ?? 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  const openBorrowModal = async (book) => {
    setBorrowBook(book);
    setBorrowDueDate(computeDueDate(book));
    await refreshLoanCount();
  };

  const closeBorrowModal = () => { setBorrowBook(null); setShowConfirm(false); };

  useEffect(() => { fetchBooks(); }, []);

  async function fetchBooks() {
    setLoading(true);
    const [{ data, error }, { data: copies }, { data: activeTxns }] = await Promise.all([
      localDb.from('books').select('*').neq('status', 'archived'),
      localDb.from('book_copies').select('book_id, status'),
      localDb.from('transactions').select('book_id').in('status', ACTIVE_STATUSES),
    ]);
    if (!error) {
      const physicalAvailMap = {};
      (copies || []).forEach(c => {
        if (c.status === 'available')
          physicalAvailMap[c.book_id] = (physicalAvailMap[c.book_id] || 0) + 1;
      });
      const activeLentMap = {};
      (activeTxns || []).forEach(t => {
        activeLentMap[t.book_id] = (activeLentMap[t.book_id] || 0) + 1;
      });
      setBooks(
        (data || [])
          .filter(b => b.book_type !== 'eBook')
          .map(b => {
            const physicalAvail = physicalAvailMap[b.id] ?? 0;
            const lentOut = activeLentMap[b.id] ?? 0;
            const effectiveAvail = b.max_borrowable_copies != null
              ? Math.max(0, Math.min(physicalAvail, b.max_borrowable_copies - lentOut))
              : physicalAvail;
            return { ...b, quantity: effectiveAvail };
          })
      );
    }
    setLoading(false);
  }

  // ── helper: insert a notification row for the student ──
  async function insertNotification(userId, type, title, body) {
    try {
      await localDb.from('notifications').insert([{
        user_id: userId,
        type,
        title,
        body,
        read: false,
      }]);
    } catch (e) {
      console.warn('Notification insert failed:', e.message);
    }
  }

  const submitBorrow = async (e) => {
    e?.preventDefault?.();
    if (!borrowBook) return;
    const book = borrowBook;
    const liveCount = await refreshLoanCount();
    if (liveCount >= maxLoans) {
      showToast(`You have ${liveCount} active/pending book(s). Maximum is ${maxLoans}.`, 'warning');
      return;
    }
    setAddingId(book.id);
    try {
      const { data: { user } } = await localDb.auth.getUser();
      if (!user) { showToast('Please log in first.', 'warning'); return; }
      const { data: userData, error: userErr } = await localDb.from('users').select('id, name').eq('auth_id', user.id).single();
      if (userErr || !userData) { showToast('Could not identify your account.', 'error'); return; }
      const { count: latestCount } = await localDb.from('transactions')
        .select('id', { count: 'exact', head: true }).eq('user_id', userData.id)
        .in('status', ACTIVE_STATUSES);
      if ((latestCount || 0) >= maxLoans) {
        setActiveLoansCount(latestCount || 0);
        showToast(`You have ${latestCount} active/pending book(s). Maximum is ${maxLoans}.`, 'warning');
        return;
      }
      const { data: existing } = await localDb.from('transactions').select('id, status')
        .eq('user_id', userData.id).eq('book_id', book.id)
        .in('status', ACTIVE_STATUSES)
        .maybeSingle();
      if (existing) { showToast('You already have a copy of this book. Return it before borrowing again.', 'warning'); return; }
      const { error } = await localDb.from('transactions').insert([{
        user_id: userData.id, book_id: book.id, status: 'pending', due_date: borrowDueDate,
      }]);
      if (error) throw error;
      // Notify student that their request was received
      await insertNotification(
        userData.id,
        'borrow_request',
        'Borrow request sent',
        `Your request for "${book.title}" has been sent to the librarian and is pending approval.`
      );
      await refreshLoanCount();
      await fetchBooks();
      (() => {
        const session = JSON.parse(window.sessionStorage.getItem('shelfmaster-session') || 'null');
        fetch('/api/notify/librarians', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ book_title: book.title, student_name: userData.name || '' }),
        }).catch(() => {});
      })();
      showToast(`"${book.title}" requested! Wait for librarian approval.`, 'success');
      closeBorrowModal();
    } catch (err) {
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      setAddingId(null);
    }
  };

  // ── UPDATED: if book is available → pending borrow + notification
  //            if book is truly out  → reservation queue
  const submitReservation = async (book) => {
    try {
      const { data: { user } } = await localDb.auth.getUser();
      if (!user) { showToast('Please log in first.', 'warning'); return; }
      const { data: userData } = await localDb.from('users').select('id, name').eq('auth_id', user.id).single();
      if (!userData) { showToast('Could not identify your account.', 'error'); return; }

      // Block duplicate active requests
      const { data: existingTx } = await localDb.from('transactions').select('id')
        .eq('user_id', userData.id).eq('book_id', book.id)
        .in('status', [...ACTIVE_STATUSES, 'reserved'])
        .maybeSingle();
      if (existingTx) {
        showToast('You already have an active request or reservation for this book.', 'warning');
        return;
      }

      // Re-check live availability right before acting
      const [{ data: liveCopies }, { data: liveTxns }] = await Promise.all([
        localDb.from('book_copies').select('status').eq('book_id', book.id),
        localDb.from('transactions').select('id').eq('book_id', book.id).in('status', ACTIVE_STATUSES),
      ]);
      const physAvail = (liveCopies || []).filter(c => c.status === 'available').length;
      const lentOut   = (liveTxns || []).length;
      const liveAvail = book.max_borrowable_copies != null
        ? Math.max(0, Math.min(physAvail, book.max_borrowable_copies - lentOut))
        : physAvail;

      if (liveAvail > 0) {
        // Book is actually available → convert to a pending borrow request
        const liveCount = await refreshLoanCount();
        if (liveCount >= maxLoans) {
          showToast(`You've reached the ${maxLoans}-book limit. Return a book first.`, 'warning');
          return;
        }
        const dueDate = computeDueDate(book);
        const { error } = await localDb.from('transactions').insert([{
          user_id: userData.id, book_id: book.id, status: 'pending', due_date: dueDate,
        }]);
        if (error) throw error;
        // Notify the student immediately
        await insertNotification(
          userData.id,
          'reservation_ready',
          'A copy is available!',
          `"${book.title}" has an available copy. Your borrow request has been sent — wait for librarian approval.`
        );
        await refreshLoanCount();
        await fetchBooks();
        showToast(`A copy is available! Borrow request for "${book.title}" submitted.`, 'success');
      } else {
        // Truly out of stock → add to reservation queue
        const { error: resErr } = await localDb.from('reservations')
          .insert([{ user_id: userData.id, book_id: book.id, status: 'waiting' }]);
        if (resErr) {
          const { error: txErr } = await localDb.from('transactions')
            .insert([{ user_id: userData.id, book_id: book.id, status: 'reserved' }]);
          if (txErr) throw txErr;
        }
        // Notify student they're in the queue
        await insertNotification(
          userData.id,
          'reserved',
          'Reservation placed',
          `You've been added to the waiting list for "${book.title}". You'll be notified when a copy becomes available.`
        );
        showToast(`Reserved! You'll be notified when "${book.title}" becomes available.`, 'success');
      }
    } catch (err) {
      showToast(err.message || 'Reservation failed. Try again.', 'error');
    }
  };

  const getCategory = (book) => book.category || book.subject_class || 'General';
  const categories = ['All', ...new Set(books.map(getCategory))].sort();
  const filteredBooks = books
    .filter(book => {
      const s = searchTerm.toLowerCase();
      const cat = getCategory(book);
      return (book.title?.toLowerCase().includes(s) || cat.toLowerCase().includes(s)) &&
        (categoryFilter === 'All' || cat === categoryFilter);
    })
    .sort((a, b) => {
      if (sortBy === 'title-asc')  return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'title-desc') return (b.title || '').localeCompare(a.title || '');
      if (sortBy === 'available')  return (b.quantity ?? 0) - (a.quantity ?? 0);
      return 0;
    });

  const atLimit = activeLoansCount >= maxLoans;

  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');

        @keyframes modalIn  { from { opacity:0; transform:translateY(20px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes modalUp  { from { opacity:0; transform:translateY(100%); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
        @keyframes pulseDot { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(.6);opacity:.4;} }
        @keyframes fsIn     { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:scale(1); } }

        .cat-wrap { max-width:1200px; margin:0 auto; padding:40px 20px; }
        .cat-filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
        .cat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:18px; }
        .book-card { background:white; border-radius:14px; box-shadow:0 4px 15px rgba(0,0,0,0.06); display:flex; flex-direction:column; overflow:hidden; }
        .book-cover { position:relative; width:100%; height:170px; overflow:hidden; flex-shrink:0; }
        .book-body { padding:12px 14px 14px; display:flex; flex-direction:column; flex:1; }
        .book-footer { display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:12px; flex-wrap:wrap; gap:6px; }
        .borrow-btn { background:linear-gradient(135deg,#7f1d1d,#dc2626); color:white; border:none; padding:7px 16px; border-radius:8px; font-weight:bold; font-size:0.82rem; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.25); }

        .modal-overlay { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px; animation:fadeIn .2s ease forwards; }
        .modal-backdrop { position:absolute; inset:0; background:rgba(15,10,10,0.65); backdrop-filter:blur(6px); }

        .borrow-modal-card { position:relative; z-index:1; width:100%; max-width:440px; background:white; border-radius:24px; overflow:hidden; box-shadow:0 32px 80px rgba(0,0,0,0.35),0 0 0 1px rgba(255,255,255,0.08); max-height:90vh; overflow-y:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; animation:modalIn .28s cubic-bezier(.22,1,.36,1) forwards; }
        .borrow-modal-card::-webkit-scrollbar { display:none; }

        .bm-hero { position:relative; background:linear-gradient(150deg,#4a0000 0%,#7f1d1d 45%,#991b1b 100%); padding:22px 22px 24px; overflow:hidden; }
        .bm-hero::before { content:''; position:absolute; inset:0; background-image:linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px); background-size:28px 28px; pointer-events:none; }
        .bm-hero-orb { position:absolute; border-radius:50%; filter:blur(40px); pointer-events:none; }

        .bm-close { position:absolute; top:14px; right:14px; z-index:3; width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2); color:rgba(255,255,255,0.8); display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:1rem; transition:background .15s; }
        .bm-close:hover { background:rgba(255,255,255,0.22); }

        .bm-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2); color:rgba(255,255,255,0.85); font-size:0.65rem; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; padding:4px 10px; border-radius:20px; margin-bottom:10px; width:fit-content; }
        .bm-book-title { font-family:'DM Serif Display',serif; font-size:1.1rem; color:white; margin:0 0 3px; line-height:1.25; position:relative; z-index:2; }
        .bm-book-author { font-size:0.78rem; color:rgba(255,255,255,0.6); font-weight:500; margin:0 0 12px; position:relative; z-index:2; }
        .bm-avail-chip { display:inline-flex; align-items:center; gap:5px; font-size:0.7rem; font-weight:700; padding:4px 11px; border-radius:20px; position:relative; z-index:2; }
        .bm-avail-chip::before { content:''; width:5px; height:5px; border-radius:50%; background:currentColor; animation:pulseDot 1.6s ease infinite; }

        .bm-cover-thumb { flex-shrink:0; width:82px; height:112px; border-radius:10px; overflow:hidden; border:2px solid rgba(255,255,255,0.2); box-shadow:0 8px 24px rgba(0,0,0,0.5); position:relative; transition:transform .2s,box-shadow .2s; }
        .bm-cover-thumb:hover { transform:scale(1.04); box-shadow:0 12px 32px rgba(0,0,0,0.6); }
        .bm-cover-zoom-hint { position:absolute; inset:0; background:rgba(0,0,0,0); display:flex; align-items:center; justify-content:center; color:white; opacity:0; transition:opacity .2s,background .2s; border-radius:8px; }
        .bm-cover-thumb:hover .bm-cover-zoom-hint { opacity:1; background:rgba(0,0,0,0.38); }
        .bm-cover-no-image { width:100%; height:100%; background:linear-gradient(150deg,#7f1d1d,#450a0a); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; }

        .bm-body { padding:18px 20px 20px; display:flex; flex-direction:column; gap:11px; }
        .bm-limit-bar { border-radius:12px; padding:10px 13px; display:flex; align-items:center; gap:10px; font-size:0.81rem; font-weight:600; }
        .lbar-icon { width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:0.85rem; flex-shrink:0; }

        .bm-tiles { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .bm-tile { background:#f8fafc; border:1px solid #f1f5f9; border-radius:14px; padding:12px 13px; display:flex; flex-direction:column; gap:3px; }
        .bm-tile-icon { width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:0.8rem; margin-bottom:3px; }
        .bm-tile-label { font-size:0.6rem; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#94a3b8; }
        .bm-tile-value { font-size:0.88rem; font-weight:700; color:#0f172a; line-height:1.25; }
        .bm-tile-sub { font-size:0.68rem; color:#94a3b8; font-weight:500; }

        .bm-actions { display:flex; gap:10px; margin-top:2px; }
        .bm-btn-cancel { flex:1; padding:11px; border-radius:12px; border:1.5px solid #e2e8f0; background:white; font-family:'DM Sans',sans-serif; font-size:0.87rem; font-weight:700; color:#64748b; cursor:pointer; transition:border-color .15s,color .15s,background .15s; }
        .bm-btn-cancel:hover { border-color:#cbd5e1; color:#334155; background:#f8fafc; }
        .bm-btn-submit { flex:2; padding:11px; border-radius:12px; border:none; background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 100%); font-family:'DM Sans',sans-serif; font-size:0.9rem; font-weight:800; color:white; cursor:pointer; box-shadow:0 4px 16px rgba(127,29,29,0.35); transition:opacity .15s,transform .15s,box-shadow .15s; display:flex; align-items:center; justify-content:center; gap:6px; }
        .bm-btn-submit:hover:not(:disabled) { opacity:.92; transform:translateY(-1px); box-shadow:0 8px 24px rgba(127,29,29,0.4); }
        .bm-btn-submit:disabled { opacity:.45; cursor:not-allowed; transform:none; }

        .confirm-modal-card { position:relative; z-index:1; width:100%; max-width:380px; background:white; border-radius:24px; overflow:hidden; box-shadow:0 32px 80px rgba(0,0,0,0.35); animation:modalIn .28s cubic-bezier(.22,1,.36,1) forwards; text-align:center; max-height:90vh; overflow-y:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
        .confirm-modal-card::-webkit-scrollbar { display:none; }
        .cm-hero { background:linear-gradient(150deg,#4a0000,#7f1d1d 60%,#991b1b); padding:24px 20px 20px; position:relative; overflow:hidden; }
        .cm-hero::before { content:''; position:absolute; inset:0; background-image:linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px); background-size:28px 28px; }
        .cm-icon-ring { width:58px; height:58px; border-radius:50%; background:rgba(255,255,255,0.12); border:2px solid rgba(255,255,255,0.25); display:flex; align-items:center; justify-content:center; margin:0 auto 12px; font-size:1.4rem; color:white; position:relative; z-index:2; }
        .cm-title { font-family:'DM Serif Display',serif; font-size:1.15rem; color:white; margin:0; position:relative; z-index:2; }
        .cm-body { padding:18px 20px 20px; display:flex; flex-direction:column; gap:11px; }
        .cm-book-block { background:#f8fafc; border:1px solid #f1f5f9; border-radius:14px; padding:13px 15px; text-align:left; }
        .cm-book-name { font-weight:800; color:#0f172a; font-size:0.93rem; margin:0 0 2px; }
        .cm-book-author { font-size:0.76rem; color:#94a3b8; margin:0 0 10px; }
        .cm-due-row { display:flex; align-items:center; gap:8px; background:white; border:1px solid #e2e8f0; border-radius:9px; padding:8px 11px; margin-top:2px; }
        .cm-due-icon { width:26px; height:26px; border-radius:7px; background:linear-gradient(135deg,#7f1d1d,#b91c1c); display:flex; align-items:center; justify-content:center; color:white; font-size:0.7rem; flex-shrink:0; }
        .cm-due-label { font-size:0.63rem; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.7px; }
        .cm-due-date { font-size:0.82rem; font-weight:700; color:#0f172a; }
        .cm-note { font-size:0.8rem; color:#94a3b8; margin:0; line-height:1.5; }
        .cm-actions { display:flex; gap:10px; }
        .cm-btn-back { flex:1; padding:11px; border-radius:12px; border:1.5px solid #e2e8f0; background:white; font-family:'DM Sans',sans-serif; font-size:0.87rem; font-weight:700; color:#64748b; cursor:pointer; transition:background .15s; }
        .cm-btn-back:hover { background:#f8fafc; }
        .cm-btn-confirm { flex:1; padding:11px; border-radius:12px; border:none; background:linear-gradient(135deg,#7f1d1d,#b91c1c); font-family:'DM Sans',sans-serif; font-size:0.88rem; font-weight:800; color:white; cursor:pointer; box-shadow:0 4px 16px rgba(127,29,29,0.35); transition:opacity .15s,transform .15s; display:flex; align-items:center; justify-content:center; gap:6px; }
        .cm-btn-confirm:hover:not(:disabled) { opacity:.92; transform:translateY(-1px); }
        .cm-btn-confirm:disabled { opacity:.5; cursor:not-allowed; }

        .fs-overlay { position:fixed; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:1200; padding:20px; animation:fadeIn .2s ease forwards; }
        .fs-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.88); backdrop-filter:blur(12px); }
        .fs-content { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; gap:16px; animation:fsIn .3s cubic-bezier(.22,1,.36,1) forwards; }
        .fs-close-btn { align-self:flex-end; width:38px; height:38px; border-radius:50%; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.25); color:white; font-size:1.1rem; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s,transform .15s; }
        .fs-close-btn:hover { background:rgba(255,255,255,0.22); transform:scale(1.08); }
        .fs-image { max-width:min(340px,88vw); max-height:72vh; border-radius:16px; box-shadow:0 32px 80px rgba(0,0,0,0.7); border:2px solid rgba(255,255,255,0.12); object-fit:contain; display:block; }
        .fs-hint { color:rgba(255,255,255,0.45); font-size:0.76rem; margin:0; font-weight:500; letter-spacing:0.3px; }

        @media(min-width:601px) and (max-width:900px){ .cat-grid { grid-template-columns:repeat(3,1fr); } }

        @media(max-width:600px){
          .cat-wrap { padding:20px 12px; }
          .cat-filters { flex-direction:column; gap:8px; }
          .cat-filters > * { width:100%; box-sizing:border-box; }
          .cat-grid { grid-template-columns:repeat(2,1fr); gap:10px; }
          .book-cover { height:130px; }
          .book-body { padding:9px 10px 11px; }
          .book-title { font-size:0.82rem !important; }
          .book-author { font-size:0.74rem !important; margin-bottom:8px !important; }
          .book-footer { flex-direction:column; align-items:stretch; }
          .book-footer .avail-txt { font-size:0.73rem !important; }
          .borrow-btn { width:100%; padding:8px; font-size:0.81rem; }
          .modal-overlay { align-items:flex-end; padding:0; }
          .borrow-modal-card { max-width:100%; width:100%; border-radius:20px 20px 0 0; max-height:85vh; animation:modalUp .32s cubic-bezier(.22,1,.36,1) forwards; }
          .confirm-modal-card { max-width:100%; width:100%; border-radius:20px 20px 0 0; max-height:85vh; animation:modalUp .32s cubic-bezier(.22,1,.36,1) forwards; }
          .bm-hero::after,.cm-hero::after { content:''; display:block; width:36px; height:4px; background:rgba(255,255,255,0.3); border-radius:2px; margin:0 auto 14px; position:relative; z-index:3; }
          .bm-hero { padding:6px 16px 18px; }
          .bm-cover-thumb { width:66px !important; height:90px !important; }
          .bm-badge { font-size:0.58rem; padding:3px 8px; margin-bottom:8px; }
          .bm-book-title { font-size:0.96rem; }
          .bm-book-author { font-size:0.73rem; margin-bottom:10px; }
          .bm-avail-chip { font-size:0.65rem; padding:3px 9px; }
          .bm-body { padding:13px 15px 16px; gap:9px; }
          .bm-limit-bar { padding:9px 11px; font-size:0.77rem; }
          .bm-tiles { grid-template-columns:1fr; }
          .bm-tile { padding:10px 11px; }
          .bm-tile-icon { width:24px; height:24px; font-size:0.75rem; margin-bottom:2px; }
          .bm-tile-label { font-size:0.58rem; }
          .bm-tile-value { font-size:0.82rem; }
          .bm-tile-sub { font-size:0.63rem; }
          .bm-btn-cancel,.bm-btn-submit { padding:12px; font-size:0.85rem; }
          .cm-hero { padding:6px 16px 16px; }
          .cm-icon-ring { width:48px; height:48px; font-size:1.15rem; margin-bottom:9px; }
          .cm-title { font-size:1.02rem; }
          .cm-body { padding:13px 15px 15px; gap:9px; }
          .cm-book-name { font-size:0.88rem; }
          .cm-book-author { font-size:0.72rem; }
          .cm-due-date { font-size:0.78rem; }
          .cm-note { font-size:0.75rem; }
          .cm-btn-back,.cm-btn-confirm { padding:12px; font-size:0.84rem; }
          .fs-image { max-width:92vw !important; max-height:62vh; }
          .fs-overlay { padding:14px; }
        }
        @media(max-width:360px){
          .bm-cover-thumb { width:56px !important; height:78px !important; }
          .bm-book-title { font-size:0.88rem; }
        }
      `}</style>

      <Toast {...toast} onClose={() => setToast({ message: '' })} />
      <StudentNavbar />

      <div className="cat-wrap">
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--maroon)', margin: '0 0 6px 0', fontFamily: "'DM Serif Display', serif" }}>Library Catalog</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem' }}>Browse and request books from the collection</p>
        </div>

        <div className="cat-filters">
          <div style={{ position: 'relative', flex: '2', minWidth: '200px' }}>
            <FaSearch style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem', pointerEvents: 'none' }} />
            <input type="text" placeholder="Search title, author, or category..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.93rem', background: 'white', boxSizing: 'border-box', outline: 'none' }} />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            style={{ padding: '11px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', cursor: 'pointer', outline: 'none', minWidth: '160px' }}>
            {categories.map(cat => <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: '11px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.9rem', background: 'white', cursor: 'pointer', outline: 'none', minWidth: '150px' }}>
            <option value="title-asc">Title A → Z</option>
            <option value="title-desc">Title Z → A</option>
            <option value="available">Available First</option>
          </select>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', marginTop: 50, color: '#64748b' }}>Loading books...</p>
        ) : (
          <>
            <p style={{ color: '#64748b', marginBottom: 16, fontSize: '0.88rem' }}>
              Showing <strong>{filteredBooks.length}</strong> {filteredBooks.length === 1 ? 'book' : 'books'}
            </p>
            <div className="cat-grid">
              {filteredBooks.length > 0 ? filteredBooks.map(book => {
                const qty = book.quantity ?? 0;
                const isAvailable = qty > 0;
                return (
                  <div key={book.id} className="book-card">
                    <div className="book-cover">
                      {book.cover_image
                        ? <img src={book.cover_image} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                        : null}
                      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#7f1d1d 0%,#991b1b 50%,#450a0a 100%)', display: book.cover_image ? 'none' : 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '2rem', marginBottom: 5 }}>📖</span>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.85)', textAlign: 'center', padding: '0 10px', fontWeight: 600, lineHeight: 1.3 }}>{book.title}</span>
                      </div>
                      <div style={{ position: 'absolute', top: 8, right: 8, background: isAvailable ? '#16a34a' : '#dc2626', color: 'white', fontSize: '0.62rem', fontWeight: 700, padding: '3px 7px', borderRadius: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
                        {isAvailable ? `${qty} left` : 'Out'}
                      </div>
                    </div>
                    <div className="book-body">
                      <div style={{ fontSize: '0.62rem', background: '#fff1f2', color: '#be123c', padding: '3px 8px', borderRadius: 20, fontWeight: 700, alignSelf: 'flex-start', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {getCategory(book)}
                      </div>
                      <h3 className="book-title" style={{ fontSize: '0.95rem', color: '#1e293b', margin: '0 0 3px', fontWeight: 700, lineHeight: 1.3 }}>{book.title}</h3>
                      <p className="book-author" style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 8, flexGrow: 1 }}>by {book.authors || '—'}</p>
                      {book.is_borrowable !== false && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.71rem', fontWeight: 600, color: '#4f46e5', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 20, padding: '2px 8px', marginBottom: 8, alignSelf: 'flex-start' }}>
                          <FaCalendarAlt style={{ fontSize: '0.6rem' }} />
                          {book.borrow_duration_days ?? 7}-day loan
                        </div>
                      )}
                      <div className="book-footer">
                        <span className="avail-txt" style={{ fontSize: '0.78rem', fontWeight: 600, color: book.is_borrowable === false ? '#B91C1C' : isAvailable ? '#16a34a' : '#dc2626' }}>
                          {book.is_borrowable === false ? '📖 In-Library Use' : isAvailable ? `✓ ${qty} Available` : '✗ Out of Stock'}
                        </span>
                        {book.is_borrowable === false ? (
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#B91C1C', background: '#FFF1F1', padding: '4px 10px', borderRadius: 8, border: '1px solid #FECACA' }}>
                            Reference Only
                          </span>
                        ) : isAvailable ? (
                          <button className="borrow-btn"
                            disabled={addingId === book.id || activeLoansCount >= maxLoans}
                            onClick={() => openBorrowModal(book)}
                            title={activeLoansCount >= maxLoans ? `Borrow limit reached (${maxLoans} max)` : ''}
                            style={{ cursor: activeLoansCount >= maxLoans ? 'not-allowed' : 'pointer', opacity: activeLoansCount >= maxLoans ? 0.5 : 1 }}>
                            {addingId === book.id ? '...' : activeLoansCount >= maxLoans ? `Limit (${maxLoans})` : 'Borrow'}
                          </button>
                        ) : (
                          <button className="borrow-btn"
                            disabled={addingId === book.id}
                            onClick={() => submitReservation(book)}
                            style={{ background: 'linear-gradient(135deg,#4c1d95,#7c3aed)', cursor: 'pointer' }}>
                            {addingId === book.id ? '...' : 'Reserve'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px' }}>
                  <p style={{ fontSize: '1.05rem', color: '#94a3b8' }}>No books found matching your filters.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* BORROW MODAL */}
      {borrowBook && (
        <div className="modal-overlay" onClick={closeBorrowModal}>
          <div className="modal-backdrop" />
          <div className="borrow-modal-card" onClick={e => e.stopPropagation()}>
            <div className="bm-hero">
              <div className="bm-hero-orb" style={{ width:180, height:180, background:'rgba(255,200,0,0.1)', top:-60, right:-40 }} />
              <div className="bm-hero-orb" style={{ width:120, height:120, background:'rgba(255,255,255,0.05)', bottom:-40, left:-20 }} />
              <button className="bm-close" onClick={closeBorrowModal}><MdClose /></button>
              <div style={{ position:'relative', zIndex:2, display:'flex', gap:14, alignItems:'flex-end' }}>
                <div className="bm-cover-thumb"
                  onClick={() => borrowBook.cover_image && setFullscreenCover(borrowBook.cover_image)}
                  style={{ cursor: borrowBook.cover_image ? 'zoom-in' : 'default' }}>
                  {borrowBook.cover_image
                    ? <><img src={borrowBook.cover_image} alt={borrowBook.title} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                          onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
                        <div className="bm-cover-zoom-hint"><FaSearch style={{ fontSize:'0.9rem' }} /></div></>
                    : null}
                  <div className="bm-cover-no-image" style={{ display: borrowBook.cover_image ? 'none' : 'flex' }}>
                    <span style={{ fontSize:'1.6rem' }}>📖</span>
                    <span style={{ fontSize:'0.55rem', color:'rgba(255,255,255,0.55)', fontWeight:600, textAlign:'center', padding:'0 5px', lineHeight:1.3 }}>{borrowBook.title}</span>
                  </div>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="bm-badge"><FaBookOpen style={{ fontSize:'0.58rem' }} /> Borrow Request</div>
                  <h2 className="bm-book-title">{borrowBook.title}</h2>
                  <p className="bm-book-author">by {borrowBook.authors || '—'}</p>
                  <span className="bm-avail-chip" style={{
                    background: borrowBook.quantity > 0 ? 'rgba(21,128,61,0.3)' : 'rgba(220,38,38,0.3)',
                    color: borrowBook.quantity > 0 ? '#86efac' : '#fca5a5',
                    border: `1px solid ${borrowBook.quantity > 0 ? 'rgba(134,239,172,0.4)' : 'rgba(252,165,165,0.4)'}`,
                  }}>
                    {borrowBook.quantity ?? 0} {borrowBook.quantity === 1 ? 'copy' : 'copies'} available
                  </span>
                </div>
              </div>
            </div>
            <div className="bm-body">
              <div className="bm-limit-bar" style={{
                background: atLimit ? '#fef2f2' : '#f0fdf4',
                border: `1.5px solid ${atLimit ? '#fecaca' : '#bbf7d0'}`,
                color: atLimit ? '#991b1b' : '#166534',
              }}>
                <div className="lbar-icon" style={{ background: atLimit ? '#fee2e2' : '#dcfce7' }}>{atLimit ? '🚫' : '📋'}</div>
                <span>{atLimit ? `You've reached the ${maxLoans}-book limit. Return a book first.` : `${activeLoansCount} of ${maxLoans} loan slots used`}</span>
              </div>
              <div className="bm-tiles">
                <div className="bm-tile" style={{ gridColumn:'1 / -1' }}>
                  <div className="bm-tile-icon" style={{ background:'linear-gradient(135deg,#7f1d1d,#b91c1c)', color:'white' }}><FaCalendarAlt /></div>
                  <div className="bm-tile-label">Return By</div>
                  <div className="bm-tile-value">{borrowDueDate ? new Date(borrowDueDate+'T00:00:00').toLocaleDateString(undefined,{ weekday:'long', year:'numeric', month:'long', day:'numeric' }) : '—'}</div>
                  <div className="bm-tile-sub">{borrowBook.borrow_duration_days ?? 7}-day loan period</div>
                </div>
                <div className="bm-tile" style={{ gridColumn:'1 / -1' }}>
                  <div className="bm-tile-icon" style={{ background:'#fef9c3', color:'#a16207' }}><FaExclamationTriangle /></div>
                  <div className="bm-tile-label">Overdue Fine</div>
                  <div className="bm-tile-value" style={{ color:'#92400e' }}>
                    ₱{borrowPolicy.fine_amount} per{' '}
                    {borrowPolicy.fine_increment_value > 1 ? `${borrowPolicy.fine_increment_value} ` : ''}
                    {borrowPolicy.fine_increment_type === 'per_hour'
                      ? (borrowPolicy.fine_increment_value > 1 ? 'hours' : 'hour')
                      : (borrowPolicy.fine_increment_value > 1 ? 'days' : 'day')} overdue
                  </div>
                  <div className="bm-tile-sub">Please return on time to avoid charges</div>
                </div>
              </div>
              <div className="bm-actions">
                <button className="bm-btn-cancel" onClick={closeBorrowModal}>Cancel</button>
                <button className="bm-btn-submit" disabled={addingId === borrowBook.id || atLimit} onClick={() => setShowConfirm(true)}>
                  {addingId === borrowBook.id ? 'Submitting…' : <><FaBookOpen style={{ fontSize:'0.8rem' }} /> Send Request</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {showConfirm && borrowBook && (
        <div className="modal-overlay" style={{ zIndex:1100 }} onClick={() => setShowConfirm(false)}>
          <div className="modal-backdrop" />
          <div className="confirm-modal-card" onClick={e => e.stopPropagation()}>
            <div className="cm-hero">
              <div className="bm-hero-orb" style={{ width:140, height:140, background:'rgba(255,200,0,0.1)', top:-50, right:-30 }} />
              <div className="cm-icon-ring"><FaBookOpen /></div>
              <h3 className="cm-title">Confirm Request</h3>
            </div>
            <div className="cm-body">
              <div className="cm-book-block">
                <p className="cm-book-name">{borrowBook.title}</p>
                <p className="cm-book-author">by {borrowBook.authors || '—'}</p>
                {borrowDueDate && (
                  <div className="cm-due-row">
                    <div className="cm-due-icon"><FaCalendarAlt /></div>
                    <div>
                      <div className="cm-due-label">Return by</div>
                      <div className="cm-due-date">{new Date(borrowDueDate+'T00:00:00').toLocaleDateString(undefined,{ weekday:'short', year:'numeric', month:'long', day:'numeric' })}</div>
                    </div>
                  </div>
                )}
              </div>
              <p className="cm-note">Your request will be sent to the librarian for approval. You'll be notified once it's confirmed.</p>
              <div className="cm-actions">
                <button className="cm-btn-back" onClick={() => setShowConfirm(false)}>Go Back</button>
                <button className="cm-btn-confirm" disabled={addingId === borrowBook.id}
                  onClick={async () => { setShowConfirm(false); await submitBorrow({ preventDefault: () => {} }); }}>
                  {addingId === borrowBook.id ? 'Submitting…' : <><FaShieldAlt style={{ fontSize:'0.8rem' }} /> Confirm</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX */}
      {fullscreenCover && (
        <div className="fs-overlay" onClick={() => setFullscreenCover(null)}>
          <div className="fs-backdrop" />
          <div className="fs-content" onClick={e => e.stopPropagation()}>
            <button className="fs-close-btn" onClick={() => setFullscreenCover(null)}><MdClose /></button>
            <img src={fullscreenCover} alt="Book cover full view" className="fs-image" />
            <p className="fs-hint">Tap anywhere outside to close</p>
          </div>
        </div>
      )}
    </div>
  );
}