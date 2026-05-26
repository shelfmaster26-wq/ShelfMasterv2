import React, { useState, useEffect, useCallback } from 'react';
import { localDb } from './localDbClient';
import StudentNavbar from './StudentNavbar';
import {
  FaBell, FaCheckCircle, FaExclamationTriangle, FaClock,
  FaBookOpen, FaUndo, FaInbox, FaCheck, FaTrash, FaBookmark,
} from 'react-icons/fa';

const NOTIF_ICONS = {
  borrow_request:    { icon: <FaBookOpen />,            color: '#2563eb', bg: '#dbeafe' },
  borrow_approved:   { icon: <FaCheckCircle />,         color: '#16a34a', bg: '#dcfce7' },
  borrow_declined:   { icon: <FaExclamationTriangle />, color: '#dc2626', bg: '#fee2e2' },
  released:          { icon: <FaBookOpen />,            color: '#2563eb', bg: '#dbeafe' },
  ready_for_claim:   { icon: <FaBookOpen />,            color: '#7c3aed', bg: '#ede9fe' },
  return_with_fine:  { icon: <FaExclamationTriangle />, color: '#d97706', bg: '#fef3c7' },
  returned:          { icon: <FaUndo />,                color: '#16a34a', bg: '#dcfce7' },
  overdue:           { icon: <FaClock />,               color: '#dc2626', bg: '#fee2e2' },
  due_soon:          { icon: <FaClock />,               color: '#d97706', bg: '#fef3c7' },
  reserved:          { icon: <FaBookmark />,            color: '#7c3aed', bg: '#ede9fe' },
  reservation_ready: { icon: <FaBookOpen />,            color: '#16a34a', bg: '#dcfce7' },
  default:           { icon: <FaBell />,                color: '#94a3b8', bg: '#f1f5f9' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function StudentNotifications() {
  const [notifications,    setNotifications]    = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [markingAll,       setMarkingAll]        = useState(false);
  const [deletingAll,      setDeletingAll]       = useState(false);
  const [deletingId,       setDeletingId]        = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll]  = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await localDb.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: userData } = await localDb.from('users').select('id').eq('auth_id', user.id).maybeSingle();
    if (!userData?.id) { setLoading(false); return; }
    const { data, error } = await localDb
      .from('notifications')
      .select('*')
      .eq('user_id', userData.id)
      .order('created_at', { ascending: false });
    if (!error) setNotifications(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
    const onVisible = () => { if (!document.hidden) fetchNotifications(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchNotifications]);

  async function markAsRead(notifId) {
    await localDb.from('notifications').update({ read: true }).eq('id', notifId);
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    const unread = notifications.filter(n => !n.read);
    if (!unread.length) return;
    setMarkingAll(true);
    await Promise.all(unread.map(n => localDb.from('notifications').update({ read: true }).eq('id', n.id)));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setMarkingAll(false);
  }

  async function deleteOne(e, notifId) {
    e.stopPropagation();
    setDeletingId(notifId);
    await localDb.from('notifications').delete().eq('id', notifId);
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    setDeletingId(null);
  }

  async function deleteAll() {
    setDeletingAll(true);
    await Promise.all(notifications.map(n => localDb.from('notifications').delete().eq('id', n.id)));
    setNotifications([]);
    setDeletingAll(false);
    setConfirmDeleteAll(false);
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');

        .sn-wrap { max-width: 1100px; margin: 0 auto; padding: 40px 24px; }

        .sn-page-header { margin-bottom: 28px; }
        .sn-page-header h2 { font-family:'DM Serif Display',serif; font-size:2rem; color:var(--maroon); margin:0 0 4px; line-height:1.2; }
        .sn-page-header p { color:#94a3b8; margin:0; font-size:0.88rem; }

        .sn-toolbar { display:flex; align-items:center; gap:8px; padding:12px 20px; background:#fafbfc; border-bottom:1px solid #f1f5f9; justify-content:flex-end; }

        .sn-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:8px; font-family:'DM Sans',sans-serif; font-weight:600; font-size:0.78rem; cursor:pointer; transition:background .15s,border-color .15s; white-space:nowrap; }
        .sn-btn-mark { border:1.5px solid var(--maroon); background:transparent; color:var(--maroon); }
        .sn-btn-mark:hover:not(:disabled) { background:var(--maroon); color:white; }
        .sn-btn-delete { border:1.5px solid #fca5a5; background:#fff1f2; color:#dc2626; }
        .sn-btn-delete:hover:not(:disabled) { background:#fee2e2; border-color:#f87171; }
        .sn-btn:disabled { opacity:.5; cursor:not-allowed; }

        .sn-panel { background:white; border-radius:18px; box-shadow:0 4px 24px rgba(0,0,0,0.06),0 1px 4px rgba(0,0,0,0.04); overflow:hidden; }

        .sn-row { display:flex; align-items:flex-start; gap:14px; padding:16px 20px; border-bottom:1px solid #f1f5f9; cursor:default; transition:background .15s; }
        .sn-row:last-child { border-bottom:none; }
        .sn-row:hover { background:#fafbfc; }
        .sn-row.unread { background:#fffbeb; cursor:pointer; }
        .sn-row.unread:hover { background:#fef9ec; }

        .sn-icon { width:38px; height:38px; border-radius:10px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:14px; }

        .sn-body { flex:1; min-width:0; }
        .sn-title { font-size:0.88rem; color:#0f172a; line-height:1.4; margin:0 0 3px; }
        .sn-title.unread { font-weight:700; }
        .sn-title.read   { font-weight:500; color:#475569; }
        .sn-body-text { font-size:0.81rem; color:#64748b; line-height:1.55; margin:0; }
        .sn-time { font-size:0.71rem; color:#94a3b8; margin-top:5px; }

        .sn-right { display:flex; flex-direction:column; align-items:center; gap:6px; flex-shrink:0; }
        .sn-unread-dot { width:8px; height:8px; border-radius:50%; background:var(--maroon); }
        .sn-del-btn { width:28px; height:28px; border-radius:7px; border:1px solid transparent; background:transparent; color:#cbd5e1; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:11px; transition:all .15s; }
        .sn-del-btn:hover { background:#fee2e2; color:#dc2626; border-color:#fecdd3; }
        .sn-del-btn:disabled { opacity:.4; cursor:not-allowed; }

        .sn-empty { display:flex; flex-direction:column; align-items:center; padding:72px 24px; text-align:center; }
        .sn-empty-icon { width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,#f8fafc,#f1f5f9); border:2px dashed #e2e8f0; display:flex; align-items:center; justify-content:center; font-size:1.6rem; color:#cbd5e1; margin-bottom:14px; }
        .sn-empty p { margin:0; font-size:0.9rem; color:#94a3b8; font-weight:500; }

        .sn-overlay { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; padding:20px; }
        .sn-modal { background:white; border-radius:16px; padding:26px; max-width:360px; width:100%; box-shadow:0 16px 48px rgba(0,0,0,0.15); }
        .sn-modal h3 { font-family:'DM Serif Display',serif; font-size:1.15rem; color:#1e293b; margin:0 0 8px; }
        .sn-modal p { margin:0 0 20px; font-size:0.86rem; color:#64748b; line-height:1.5; }
        .sn-modal-actions { display:flex; gap:8px; justify-content:flex-end; }

        @media(max-width:640px){
          .sn-wrap { padding:20px 14px; }
          .sn-page-header h2 { font-size:1.5rem; }
          .sn-row { padding:14px 14px; }
        }
      `}</style>

      <StudentNavbar />

      <div className="sn-wrap">
        <div className="sn-page-header">
          <h2>Notifications</h2>
          <p>{unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}</p>
        </div>

        <div className="sn-panel">
          {!loading && notifications.length > 0 && (
            <div className="sn-toolbar">
              {unreadCount > 0 && (
                <button className="sn-btn sn-btn-mark" onClick={markAllRead} disabled={markingAll}>
                  <FaCheck style={{ fontSize: 10 }} />
                  {markingAll ? 'Marking…' : 'Mark all read'}
                </button>
              )}
              <button className="sn-btn sn-btn-delete" onClick={() => setConfirmDeleteAll(true)} disabled={deletingAll}>
                <FaTrash style={{ fontSize: 10 }} />
                Delete all
              </button>
            </div>
          )}

          {loading ? (
            <div className="sn-empty"><p style={{ color:'#94a3b8' }}>Loading…</p></div>
          ) : notifications.length === 0 ? (
            <div className="sn-empty">
              <div className="sn-empty-icon"><FaInbox /></div>
              <p>No notifications yet. Updates about your borrow requests and returns will appear here.</p>
            </div>
          ) : (
            notifications.map(notif => {
              const { icon, color, bg } = NOTIF_ICONS[notif.type] || NOTIF_ICONS.default;
              return (
                <div key={notif.id} className={`sn-row${notif.read ? '' : ' unread'}`}
                  onClick={() => !notif.read && markAsRead(notif.id)}>
                  <div className="sn-icon" style={{ background: bg, color }}>{icon}</div>
                  <div className="sn-body">
                    <p className={`sn-title ${notif.read ? 'read' : 'unread'}`}>{notif.title}</p>
                    {notif.body && <p className="sn-body-text">{notif.body}</p>}
                    <div className="sn-time">{timeAgo(notif.created_at)}</div>
                  </div>
                  <div className="sn-right">
                    {!notif.read && <span className="sn-unread-dot" />}
                    <button className="sn-del-btn" onClick={e => deleteOne(e, notif.id)}
                      disabled={deletingId === notif.id} title="Delete">
                      <FaTrash />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {confirmDeleteAll && (
        <div className="sn-overlay" onClick={() => setConfirmDeleteAll(false)}>
          <div className="sn-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete all notifications?</h3>
            <p>This will permanently remove all {notifications.length} notification{notifications.length > 1 ? 's' : ''}. This cannot be undone.</p>
            <div className="sn-modal-actions">
              <button className="sn-btn" style={{ border:'1.5px solid #e2e8f0', background:'white', color:'#64748b' }}
                onClick={() => setConfirmDeleteAll(false)}>Cancel</button>
              <button className="sn-btn" style={{ border:'1.5px solid #fca5a5', background:'#dc2626', color:'white' }}
                onClick={deleteAll} disabled={deletingAll}>
                <FaTrash style={{ fontSize: 10 }} />
                {deletingAll ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}