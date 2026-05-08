import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { localDb } from './localDbClient';
import StudentNavbar from './StudentNavbar';
import Toast from './Toast';
import { FaBookOpen, FaCalendarAlt, FaExclamationTriangle, FaSearch } from 'react-icons/fa';
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
  const MAX_LOANS = 3;
  const [showConfirm, setShowConfirm] = useState(false);

  const [borrowPolicy, setBorrowPolicy] = useState({
    borrow_duration_value: 7,
    borrow_duration_unit: 'days',
    fine_amount: 5,
    fine_increment_value: 1,
    fine_increment_type: 'per_day',
  });

  useEffect(() => {
    localDb.from('site_content')
      .select('borrow_duration_value, borrow_duration_unit, fine_amount, fine_per_day, fine_increment_value, fine_increment_type')
      .limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) setBorrowPolicy({
          borrow_duration_value: data.borrow_duration_value ?? 7,
          borrow_duration_unit: data.borrow_duration_unit || 'days',
          fine_amount: data.fine_amount ?? data.fine_per_day ?? 5,
          fine_increment_value: Math.max(1, Number(data.fine_increment_value ?? 1)),
          fine_increment_type: data.fine_increment_type || 'per_day',
        });
      });
  }, []);

  function computeDueDate(policy) {
    const ms = policy.borrow_duration_unit === 'hours'
      ? policy.borrow_duration_value * 60 * 60 * 1000
      : policy.borrow_duration_value * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + ms).toISOString().slice(0, 10);
  }

  const openBorrowModal = async (book) => {
    setBorrowBook(book);
    setBorrowDueDate(computeDueDate(borrowPolicy));
    try {
      const { data: { user } } = await localDb.auth.getUser();
      if (user) {
        const { data: userData } = await localDb.from('users').select('id').eq('auth_id', user.id).single();
        if (userData) {
          const { count } = await localDb.from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userData.id)
            .in('status', ['borrowed', 'pending', 'approved', 'issued', 'active', 'loaned', 'checked_out']);
          setActiveLoansCount(count || 0);
        }
      }
    } catch {}
  };

  const closeBorrowModal = () => { setBorrowBook(null); setShowConfirm(false); };

  useEffect(() => { fetchBooks(); }, []);

  async function fetchBooks() {
    setLoading(true);
    const { data, error } = await localDb.from('books').select('*').neq('status', 'archived');
    if (!error) setBooks((data || []).filter(b => b.book_type !== 'eBook'));
    setLoading(false);
  }

  const submitBorrow = async (e) => {
    e?.preventDefault?.();
    if (!borrowBook) return;
    const book = borrowBook;
    if (activeLoansCount >= MAX_LOANS) {
      showToast(`You already have ${activeLoansCount} book(s) borrowed or pending. Maximum is ${MAX_LOANS}.`, 'warning');
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
        .in('status', ['borrowed', 'pending', 'approved', 'issued', 'active', 'loaned', 'checked_out']);
      if ((latestCount || 0) >= MAX_LOANS) { showToast(`You already have ${latestCount} book(s) borrowed or pending. Maximum is ${MAX_LOANS}.`, 'warning'); return; }
      const { data: existing } = await localDb.from('transactions').select('id, status')
        .eq('user_id', userData.id).eq('book_id', book.id).in('status', ['pending']).maybeSingle();
      if (existing) { showToast('You already have a pending request for this book.', 'warning'); return; }
      const { error } = await localDb.from('transactions').insert([{ user_id: userData.id, book_id: book.id, status: 'pending', due_date: borrowDueDate }]);
      if (error) throw error;
      (() => {
        const session = JSON.parse(window.sessionStorage.getItem('shelfmaster-session') || 'null');
        fetch('/api/notify/librarians', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ book_title: book.title, student_name: userData.name || '' }) }).catch(() => {});
      })();
      showToast(`"${book.title}" requested! Wait for librarian approval.`, 'success');
      closeBorrowModal();
    } catch (err) {
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      setAddingId(null);
    }
  };

  const getCategory = (book) => book.category || book.subject_class || 'General';
  const categories = ['All', ...new Set(books.map(getCategory))].sort();
  const filteredBooks = books
    .filter(book => {
      const s = searchTerm.toLowerCase();
      const cat = getCategory(book);
      return (book.title?.toLowerCase().includes(s) || book.authors?.toLowerCase().includes(s) || cat.toLowerCase().includes(s)) && (categoryFilter === 'All' || cat === categoryFilter);
    })
    .sort((a, b) => {
      if (sortBy === 'title-asc') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'title-desc') return (b.title || '').localeCompare(a.title || '');
      if (sortBy === 'available') return (b.quantity ?? 0) - (a.quantity ?? 0);
      return 0;
    });

  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <style>{`
        .cat-wrap { max-width:1200px; margin:0 auto; padding:40px 20px; }
        .cat-filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
        .cat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:18px; }
        .book-card { background:white; border-radius:14px; box-shadow:0 4px 15px rgba(0,0,0,0.06); display:flex; flex-direction:column; overflow:hidden; }
        .book-cover { position:relative; width:100%; height:170px; overflow:hidden; flex-shrink:0; }
        .book-body { padding:12px 14px 14px; display:flex; flex-direction:column; flex:1; }
        .book-footer { display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; padding-top:12px; flex-wrap:wrap; gap:6px; }
        .borrow-btn { background:linear-gradient(135deg,#7f1d1d,#dc2626); color:white; border:none; padding:7px 16px; border-radius:8px; font-weight:bold; font-size:0.82rem; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.25); }
        @media(max-width:600px){
          .cat-wrap { padding:24px 14px; }
          .cat-filters { flex-direction:column; gap:8px; }
          .cat-filters > * { width:100%; box-sizing:border-box; }
          .cat-grid { grid-template-columns:repeat(2,1fr); gap:10px; }
          .book-cover { height:130px; }
          .book-body { padding:9px 10px 11px; }
          .book-title { font-size:0.83rem !important; }
          .book-author { font-size:0.75rem !important; margin-bottom:8px !important; }
          .book-footer { flex-direction:column; align-items:stretch; }
          .book-footer .avail-txt { font-size:0.74rem !important; }
          .borrow-btn { width:100%; padding:8px; font-size:0.82rem; }
          .borrow-modal { padding:20px 14px !important; }
        }
        @media(min-width:601px) and (max-width:900px){
          .cat-grid { grid-template-columns:repeat(3,1fr); }
        }
      `}</style>
      <Toast {...toast} onClose={() => setToast({ message: '' })} />
      <StudentNavbar />

      <div className="cat-wrap">
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ color: 'var(--maroon)', margin: '0 0 6px 0' }}>Library Catalog</h2>
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
                      {book.cover_image ? (
                        <img src={book.cover_image} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                      ) : null}
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
                      <p className="book-author" style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 12, flexGrow: 1 }}>by {book.authors}</p>
                      <div className="book-footer">
                        <span className="avail-txt" style={{ fontSize: '0.78rem', fontWeight: 600, color: isAvailable ? '#16a34a' : '#dc2626' }}>
                          {isAvailable ? `✓ ${qty} Available` : '✗ Out of Stock'}
                        </span>
                        <button className="borrow-btn" disabled={!isAvailable || addingId === book.id}
                          onClick={() => openBorrowModal(book)}
                          style={{ opacity: !isAvailable ? 0.4 : 1, cursor: !isAvailable ? 'not-allowed' : 'pointer' }}>
                          {addingId === book.id ? '...' : 'Borrow'}
                        </button>
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

      {/* ── Borrow Modal — RED palette ── */}
      {borrowBook && (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, backdropFilter: 'blur(2px)' }} onClick={closeBorrowModal}>
          <div className="borrow-modal" style={{ background: 'white', borderRadius: 18, padding: '24px 22px', width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(127,29,29,0.25)', border: '2px solid #fecdd3', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FaBookOpen style={{ color: 'white', fontSize: '1rem' }} />
                </div>
                <h3 style={{ margin: 0, color: '#7f1d1d', fontSize: '1.08rem', fontWeight: 800 }}>Borrow Book</h3>
              </div>
              <button onClick={closeBorrowModal} style={{ background: '#fff1f2', border: '1px solid #fecdd3', width: 32, height: 32, borderRadius: 9, fontSize: '1rem', cursor: 'pointer', color: '#9f1239', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MdClose />
              </button>
            </div>

            <div style={{ background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', border: '1.5px solid #fecdd3', padding: '14px 16px', borderRadius: 12, marginBottom: 14 }}>
              <p style={{ margin: '0 0 3px', fontWeight: 800, color: '#7f1d1d', fontSize: '1rem' }}>{borrowBook.title}</p>
              <p style={{ margin: '0 0 8px', color: '#9f1239', fontSize: '0.84rem' }}>by {borrowBook.authors}</p>
              <span style={{ background: borrowBook.quantity > 0 ? '#dcfce7' : '#fee2e2', color: borrowBook.quantity > 0 ? '#166534' : '#991b1b', fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                {borrowBook.quantity ?? 0} {borrowBook.quantity === 1 ? 'copy' : 'copies'} available
              </span>
              {borrowBook.description && (
                <p style={{ margin: '10px 0 0', color: '#9f1239', fontSize: '0.81rem', lineHeight: 1.55, borderTop: '1px solid #fecdd3', paddingTop: 10 }}>{borrowBook.description}</p>
              )}
            </div>

            <div style={{ background: activeLoansCount >= MAX_LOANS ? '#fee2e2' : '#fff1f2', border: `1.5px solid ${activeLoansCount >= MAX_LOANS ? '#fca5a5' : '#fecdd3'}`, borderRadius: 10, padding: '9px 13px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.82rem', color: activeLoansCount >= MAX_LOANS ? '#991b1b' : '#9f1239', fontWeight: 600 }}>
                {activeLoansCount >= MAX_LOANS ? `🚫 You've reached the ${MAX_LOANS}-book limit. Return a book first.` : `📋 ${activeLoansCount} of ${MAX_LOANS} books currently borrowed/pending`}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#fff1f2', border: '1.5px solid #fecdd3', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9f1239', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FaCalendarAlt /> Return By (Set by Librarian)
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#7f1d1d' }}>
                  {borrowDueDate ? new Date(borrowDueDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#be123c', marginTop: 3 }}>
                  {borrowPolicy.borrow_duration_value} {borrowPolicy.borrow_duration_unit} loan period
                </div>
              </div>

              <div style={{ background: '#fff1f2', border: '1.5px solid #fecdd3', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fecdd3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FaExclamationTriangle style={{ color: '#be123c', fontSize: '0.9rem' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9f1239', marginBottom: 2 }}>Overdue Fine</div>
                  <div style={{ fontSize: '0.84rem', color: '#7f1d1d', fontWeight: 600 }}>
                    ₱{borrowPolicy.fine_amount} per {borrowPolicy.fine_increment_value > 1 ? `${borrowPolicy.fine_increment_value} ` : ''}
                    {borrowPolicy.fine_increment_type === 'per_hour' ? (borrowPolicy.fine_increment_value > 1 ? 'hours' : 'hour') : (borrowPolicy.fine_increment_value > 1 ? 'days' : 'day')} overdue
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={closeBorrowModal} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1.5px solid #fecdd3', background: '#fff1f2', fontWeight: 700, cursor: 'pointer', color: '#9f1239' }}>Cancel</button>
                <button disabled={addingId === borrowBook.id || activeLoansCount >= MAX_LOANS}
                  onClick={() => setShowConfirm(true)}
                  style={{ flex: 2, padding: 11, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', color: 'white', fontWeight: 800, cursor: activeLoansCount >= MAX_LOANS ? 'not-allowed' : 'pointer', opacity: activeLoansCount >= MAX_LOANS ? 0.5 : 1, boxShadow: '0 4px 12px rgba(220,38,38,0.25)' }}>
                  {addingId === borrowBook.id ? 'Submitting…' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal — RED palette ── */}
      {showConfirm && borrowBook && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16, backdropFilter: 'blur(2px)' }} onClick={() => setShowConfirm(false)}>
          <div style={{ background: 'white', borderRadius: 18, padding: '28px 22px', width: '100%', maxWidth: 360, textAlign: 'center', boxShadow: '0 24px 64px rgba(127,29,29,0.28)', border: '2px solid #fecdd3' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(220,38,38,0.3)' }}>
              <FaBookOpen style={{ color: 'white', fontSize: '1.4rem' }} />
            </div>
            <h3 style={{ margin: '0 0 6px', color: '#7f1d1d', fontSize: '1.1rem', fontWeight: 800 }}>Confirm Borrow Request</h3>
            <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{borrowBook.title}</p>
            <p style={{ margin: '0 0 14px', color: '#9f1239', fontSize: '0.84rem' }}>by {borrowBook.authors}</p>
            {borrowDueDate && (
              <div style={{ margin: '0 0 16px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: '0.7rem', color: '#9f1239', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Return by</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#7f1d1d' }}>
                  {new Date(borrowDueDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
            )}
            <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.85rem' }}>Are you sure you want to send this borrow request?</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1.5px solid #fecdd3', background: '#fff1f2', fontWeight: 700, cursor: 'pointer', color: '#9f1239' }}>Go Back</button>
              <button onClick={async () => { setShowConfirm(false); await submitBorrow({ preventDefault: () => {} }); }}
                disabled={addingId === borrowBook.id}
                style={{ flex: 1, padding: 11, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(220,38,38,0.3)' }}>
                {addingId === borrowBook.id ? 'Submitting…' : '✓ Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
