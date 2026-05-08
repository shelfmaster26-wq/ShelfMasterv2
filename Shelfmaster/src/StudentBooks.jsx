import React, { useState, useEffect } from 'react';
import { localDb } from './localDbClient';
import StudentNavbar from './StudentNavbar';
import { FaBookOpen, FaClock, FaCalendarAlt, FaBarcode } from 'react-icons/fa';
import ConfirmModal from './ConfirmModal';

function isMigrationError(error) {
  if (!error) return false;
  const msg = error.message || '';
  return msg.includes('book_copies') || msg.includes('copy_id') || msg.includes('schema cache') || error.code === '42P01' || error.code === 'PGRST200';
}

export default function StudentBooks() {
  const [activeTab, setActiveTab] = useState('loans');
  const [loans, setLoans] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);

  useEffect(() => {
    fetchData();
    const onVisible = () => { if (!document.hidden) fetchData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await localDb.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: userData } = await localDb.from('users').select('id').eq('auth_id', user.id).maybeSingle();
    const userId = userData?.id;
    if (!userId) { setLoading(false); return; }

    let [loansRes, requestsRes] = await Promise.all([
      localDb.from('transactions')
        .select('id, borrow_date, due_date, status, books(title, authors, accession_num), book_copies(accession_id, copy_number)')
        .eq('user_id', userId).in('status', ['borrowed', 'approved', 'issued', 'active', 'loaned', 'checked_out']),
      localDb.from('transactions')
        .select('id, created_at, status, books(title, authors)')
        .eq('user_id', userId).eq('status', 'pending'),
    ]);

    if (loansRes.error && isMigrationError(loansRes.error)) {
      loansRes = await localDb.from('transactions')
        .select('id, borrow_date, due_date, status, books(title, authors, accession_num)')
        .eq('user_id', userId).in('status', ['borrowed', 'approved', 'issued', 'active', 'loaned', 'checked_out']);
    }

    if (!loansRes.error) setLoans(loansRes.data || []);
    if (!requestsRes.error) setRequests(requestsRes.data || []);
    setLoading(false);
  }

  async function cancelRequest(requestId) {
    setCancellingId(requestId);
    const { error } = await localDb.from('transactions').delete().eq('id', requestId);
    if (!error) setRequests(prev => prev.filter(r => r.id !== requestId));
    setCancellingId(null);
    setConfirmCancelId(null);
  }

  const calculateDaysLeft = (dueDate) => {
    const diffDays = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d Overdue`, color: '#e11d48', bg: '#fee2e2', weight: 'bold' };
    if (diffDays === 0) return { text: 'Due Today', color: '#d97706', bg: '#fef3c7', weight: 'bold' };
    if (diffDays <= 2) return { text: `${diffDays}d Left`, color: '#d97706', bg: '#fef3c7', weight: 'bold' };
    return { text: `${diffDays}d Left`, color: '#16a34a', bg: '#dcfce7', weight: '600' };
  };

  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <style>{`
        .books-wrap { max-width:1100px; margin:0 auto; padding:40px 20px; }
        .books-panel { background:white; border-radius:0 0 14px 14px; box-shadow:0 4px 15px rgba(0,0,0,0.05); overflow:hidden; }

        /* Desktop table */
        .loans-table { width:100%; border-collapse:collapse; }
        .loans-table th { padding:14px 16px; text-align:left; font-weight:600; font-size:0.83rem; white-space:nowrap; color:#475569; }
        .loans-table td { padding:13px 16px; vertical-align:middle; border-bottom:1px solid #f1f5f9; }
        .loans-cards { display:none; }

        /* Request rows */
        .req-row { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #f1f5f9; gap:12px; }
        .req-actions { display:flex; align-items:center; gap:10px; flex-shrink:0; }

        @media(max-width:640px){
          .books-wrap { padding:20px 14px; }
          .books-wrap h2 { font-size:1.3rem !important; }

          /* Hide table, show cards */
          .loans-table-wrap { display:none !important; }
          .loans-cards { display:flex; flex-direction:column; gap:0; }

          .loan-card { padding:14px 16px; border-bottom:1px solid #f1f5f9; }
          .loan-card-header { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px; }
          .loan-card-title { font-size:0.95rem; font-weight:700; color:#1e293b; }
          .loan-card-author { font-size:0.78rem; color:#94a3b8; margin-top:2px; }
          .loan-card-meta { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
          .loan-meta-item { background:#f8fafc; border-radius:8px; padding:8px 10px; }
          .loan-meta-label { font-size:0.65rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px; }
          .loan-meta-val { font-size:0.82rem; font-weight:600; color:#1e293b; }

          /* Request rows mobile */
          .req-row { flex-direction:column; align-items:flex-start; padding:14px 16px; }
          .req-actions { width:100%; justify-content:space-between; }
          .pending-badge { font-size:0.68rem !important; }
          .cancel-btn { font-size:0.78rem !important; padding:6px 12px !important; }

          /* Tab labels shorter on mobile */
          .tab-label-full { display:none; }
          .tab-label-short { display:inline; }
        }
        @media(min-width:641px){
          .tab-label-full { display:inline; }
          .tab-label-short { display:none; }
        }
      `}</style>

      <StudentNavbar />

      <div className="books-wrap">
        <h2 style={{ color: 'var(--maroon)', margin: '0 0 4px 0' }}>My Books</h2>
        <p style={{ color: '#64748b', margin: '0 0 24px 0', fontSize: '0.88rem' }}>Track your active loans and borrowing requests</p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: 0, borderBottom: '2px solid #e2e8f0' }}>
          {[
            { key: 'loans', full: 'Active Loans', short: 'Loans', badge: loans.length, badgeBg: 'var(--green)', badgeColor: 'white' },
            { key: 'requests', full: 'Pending Requests', short: 'Pending', badge: requests.length, badgeBg: 'var(--yellow)', badgeColor: 'var(--maroon)' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ padding: '10px 18px', border: 'none', background: 'transparent', fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer', color: activeTab === tab.key ? 'var(--maroon)' : '#94a3b8', borderBottom: `3px solid ${activeTab === tab.key ? 'var(--maroon)' : 'transparent'}`, marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: 7, transition: 'color 0.2s' }}>
              <span className="tab-label-full">{tab.full}</span>
              <span className="tab-label-short">{tab.short}</span>
              {tab.badge > 0 && (
                <span style={{ background: tab.badgeBg, color: tab.badgeColor, fontSize: '0.68rem', fontWeight: 'bold', borderRadius: 20, padding: '2px 7px' }}>{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ background: 'white', borderRadius: '0 0 14px 14px', padding: '50px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : (
          <div className="books-panel">
            {/* ── LOANS TAB ── */}
            {activeTab === 'loans' && (
              loans.length === 0 ? (
                <EmptyState icon={<FaBookOpen />} message="You have no active loans." />
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="loans-table-wrap" style={{ overflowX: 'auto' }}>
                    <table className="loans-table">
                      <thead>
                        <tr style={{ background: '#F5FAE8' }}>
                          <th>Book Title</th>
                          <th>Copy / Barcode</th>
                          <th>Borrow Date</th>
                          <th>Due Date</th>
                          <th>Time Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loans.map(loan => {
                          const cd = loan.due_date ? calculateDaysLeft(loan.due_date) : null;
                          return (
                            <tr key={loan.id}>
                              <td>
                                <strong>{loan.books?.title}</strong>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>by {loan.books?.authors}</div>
                              </td>
                              <td>
                                {loan.book_copies?.accession_id ? (
                                  <div>
                                    <code style={{ background: '#eef2ff', color: '#6366f1', padding: '3px 8px', borderRadius: 4, fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 'bold' }}>{loan.book_copies.accession_id}</code>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>Copy #{loan.book_copies.copy_number}</div>
                                  </div>
                                ) : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{loan.books?.accession_num || '—'}</span>}
                              </td>
                              <td style={{ fontSize: '0.88rem' }}>{loan.borrow_date ? new Date(loan.borrow_date).toLocaleDateString() : '—'}</td>
                              <td style={{ fontSize: '0.88rem' }}>{loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</td>
                              <td>
                                {cd ? <span style={{ background: cd.bg, color: cd.color, fontWeight: cd.weight, padding: '4px 10px', borderRadius: 20, fontSize: '0.78rem' }}>{cd.text}</span> : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="loans-cards">
                    {loans.map(loan => {
                      const cd = loan.due_date ? calculateDaysLeft(loan.due_date) : null;
                      return (
                        <div key={loan.id} className="loan-card">
                          <div className="loan-card-header">
                            <div>
                              <div className="loan-card-title">{loan.books?.title}</div>
                              <div className="loan-card-author">by {loan.books?.authors}</div>
                            </div>
                            {cd && <span style={{ background: cd.bg, color: cd.color, fontWeight: cd.weight, padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', whiteSpace: 'nowrap', flexShrink: 0 }}>{cd.text}</span>}
                          </div>
                          <div className="loan-card-meta">
                            <div className="loan-meta-item">
                              <div className="loan-meta-label">📅 Borrow Date</div>
                              <div className="loan-meta-val">{loan.borrow_date ? new Date(loan.borrow_date).toLocaleDateString() : '—'}</div>
                            </div>
                            <div className="loan-meta-item">
                              <div className="loan-meta-label">⏰ Due Date</div>
                              <div className="loan-meta-val" style={{ color: cd?.color }}>{loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</div>
                            </div>
                            {loan.book_copies?.accession_id && (
                              <div className="loan-meta-item" style={{ gridColumn: '1/-1' }}>
                                <div className="loan-meta-label">🏷 Copy / Barcode</div>
                                <div className="loan-meta-val">
                                  <code style={{ background: '#eef2ff', color: '#6366f1', padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 'bold' }}>{loan.book_copies.accession_id}</code>
                                  <span style={{ color: '#94a3b8', fontSize: '0.72rem', marginLeft: 6 }}>Copy #{loan.book_copies.copy_number}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )
            )}

            {/* ── REQUESTS TAB ── */}
            {activeTab === 'requests' && (
              requests.length === 0 ? (
                <EmptyState icon={<FaClock />} message="No pending requests at the moment." />
              ) : (
                <div>
                  {requests.map(req => (
                    <div key={req.id} className="req-row">
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: '#1e293b', fontSize: '0.95rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.books?.title}</strong>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 3 }}>
                          by {req.books?.authors} · {new Date(req.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="req-actions">
                        <span className="pending-badge" style={{ background: 'var(--yellow)', color: 'var(--maroon)', padding: '5px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                          PENDING
                        </span>
                        <button className="cancel-btn" onClick={() => setConfirmCancelId(req.id)}
                          style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid #e11d48', background: 'white', color: '#e11d48', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmCancelId}
        onCancel={() => setConfirmCancelId(null)}     // ← matches ConfirmModal's prop
        onConfirm={() => cancelRequest(confirmCancelId)}
        title="Cancel Request?"
        message="Are you sure you want to cancel this borrowing request? This action cannot be undone."
        confirmText="Yes, Cancel"
        cancelText="Keep"
      />
    </div>
  );
}

function EmptyState({ icon, message }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: '0.95rem', margin: 0 }}>{message}</p>
    </div>
  );
}
