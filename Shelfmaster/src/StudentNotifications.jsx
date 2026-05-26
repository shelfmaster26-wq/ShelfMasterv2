// src/StudentNotifications.jsx
import React, { useState, useEffect } from 'react';
import { localDb } from './localDbClient'; 
import StudentNavbar, { NAV_HEIGHT, NAV_HEIGHT_MB } from './StudentNavbar'; 
import { useResponsive } from './useResponsive';
import { 
  FaBell, FaExclamationTriangle, 
  FaInfoCircle, FaBook, FaMoneyBillWave, FaTrash 
} from 'react-icons/fa';

export default function StudentNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isMobile } = useResponsive();

  // Fetch notifications that belong exclusively to the logged-in student
  async function fetchNotifications() {
    setLoading(true);
    setError(null);
    try {
      // 1. Retrieve the active authenticated session user
      const { data: authData, error: authError } = await localDb.auth.getUser();
      
      if (authError || !authData?.user) {
        setError("Please log in to view your notification alerts.");
        setLoading(false);
        return;
      }

      const currentAuthId = authData.user.id;

      // 2. Query using native chain syntax .select().eq() just like StudentHome.jsx
      const profileResult = await localDb
        .from('users')
        .select('*')
        .eq('auth_id', currentAuthId);

      if (profileResult.error) {
        throw new Error(profileResult.error.message || "Could not load user profile credentials.");
      }

      const profiles = profileResult.data || [];
      if (profiles.length === 0) {
        throw new Error("Could not find your profile record in the system.");
      }

      // Isolate this student's unique database primary key
      const currentStudentId = profiles[0].id;

      // 3. Query only notifications matching this user's ID and order them by newest first
      const notificationsResult = await localDb
        .from('notifications')
        .select('*')
        .eq('user_id', currentStudentId)
        .order('created_at', { ascending: false });

      if (notificationsResult.error) {
        throw new Error(notificationsResult.error.message || "Failed to query personal alert feed.");
      }

      setNotifications(notificationsResult.data || []);
    } catch (err) {
      console.error("Notification load exception:", err);
      setError(err.message || "Failed to load your personal notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Mark an alert row as Read
  async function handleMarkAsRead(id) {
    try {
      const patchResult = await localDb
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (patchResult.error) throw new Error(patchResult.error.message);

      // Optimistically update view state locally
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark notice row as read:", err);
    }
  }

  // Delete notification row completely from storage
  async function handleDeleteNotification(id, e) {
    e.stopPropagation(); // Stop parent click handlers from triggering read flags
    if (!window.confirm("Are you sure you want to dismiss this notice permanently?")) return;

    try {
      const deleteResult = await localDb
        .from('notifications')
        .delete()
        .eq('id', id);

      if (deleteResult.error) throw new Error(deleteResult.error.message);

      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error("Failed to remove notification row:", err);
    }
  }

  // Visual treatments matching layout categories
  function getNotificationStyles(notifType, isRead) {
    const base = {
      background: isRead ? '#FDFDFD' : '#FFFFFF',
      borderLeft: '5px solid #94a3b8',
      icon: <FaInfoCircle style={{ color: '#64748b' }} />,
      badgeColor: '#64748b'
    };

    if (notifType === 'overdue') {
      base.borderLeft = '5px solid #7B1F1F'; // Maroon Main Theme
      base.background = isRead ? '#FCF7F7' : '#FFF5F5';
      base.icon = <FaExclamationTriangle style={{ color: '#7B1F1F' }} />;
      base.badgeColor = '#7B1F1F';
    } else if (notifType === 'fine' || notifType === 'billing') {
      base.borderLeft = '5px solid #D4A843'; // Gold theme
      base.background = isRead ? '#FAF8F2' : '#FDFBF0';
      base.icon = <FaMoneyBillWave style={{ color: '#D4A843' }} />;
      base.badgeColor = '#D4A843';
    } else if (notifType === 'pending' || notifType === 'general') {
      base.borderLeft = '5px solid #0284c7';
      base.background = isRead ? '#F8FAFC' : '#F0F9FF';
      base.icon = <FaBook style={{ color: '#0284c7' }} />;
      base.badgeColor = '#0284c7';
    }
    
    if (isRead) base.opacity = '0.7';

    return base;
  }

  const topPadding = isMobile ? NAV_HEIGHT_MB + 24 : NAV_HEIGHT + 32;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--cream, #FDF8F2)' }}>
      <StudentNavbar />

      <div style={{
        padding: isMobile ? '16px' : '32px',
        paddingTop: `${topPadding}px`,
        maxWidth: '850px',
        margin: '0 auto',
        fontFamily: "'DM Sans', sans-serif"
      }}>
        
        {/* Banner Section Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid var(--maroon, #7B1F1F)',
          paddingBottom: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FaBell style={{ color: 'var(--maroon, #7B1F1F)', fontSize: '24px' }} />
            <h1 style={{
              fontSize: isMobile ? '22px' : '28px',
              fontWeight: 700,
              color: 'var(--maroon-deep, #4a0000)',
              margin: 0
            }}>Notifications</h1>
          </div>
          <span style={{
            backgroundColor: 'var(--maroon, #7B1F1F)',
            color: '#FFFFFF',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: 'bold'
          }}>
            {notifications.filter(n => !n.read).length} New
          </span>
        </div>

        {/* Status States */}
        {loading && (
          <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
            Loading your personal alert logs...
          </p>
        )}

        {error && (
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {/* Notifications Feed */}
        {!loading && notifications.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid var(--cream-dark, #F2EAE0)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
          }}>
            <FaBell style={{ fontSize: '48px', color: '#CBD5E1', marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px', color: '#1E293B' }}>Inbox Empty</h3>
            <p style={{ margin: 0, color: '#64748b' }}>You have no outstanding messages or library alerts.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {notifications.map(notif => {
              const layout = getNotificationStyles(notif.type, notif.read);
              return (
                <div 
                  key={notif.id}
                  onClick={() => !notif.read && handleMarkAsRead(notif.id)}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '18px',
                    borderRadius: '8px',
                    background: layout.background,
                    borderLeft: layout.borderLeft,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.04)',
                    cursor: !notif.read ? 'pointer' : 'default',
                    opacity: layout.opacity || '1',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  <div style={{ fontSize: '20px', marginTop: '2px' }}>
                    {layout.icon}
                  </div>

                  <div style={{ flex: 1, paddingRight: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <h3 style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: notif.read ? 600 : 700,
                        color: '#1E293B'
                      }}>
                        {notif.title}
                      </h3>
                      <span style={{
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        color: '#FFFFFF',
                        backgroundColor: layout.badgeColor
                      }}>
                        {notif.type}
                      </span>
                    </div>
                    <p style={{
                      margin: '0 0 8px',
                      fontSize: '14px',
                      color: '#475569',
                      lineHeight: '1.5'
                    }}>
                      {notif.body}
                    </p>
                    <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                      {new Date(notif.created_at).toLocaleString('en-PH', {
                        dateStyle: 'long',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>

                  {/* Actions Button */}
                  <div style={{
                    position: 'absolute',
                    right: '12px',
                    top: '16px',
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <button 
                      onClick={(e) => handleDeleteNotification(notif.id, e)}
                      title="Clear notice row"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#94A3B8',
                        padding: '6px',
                        transition: 'color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--maroon, #7B1F1F)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
                    >
                      <FaTrash style={{ fontSize: '13px' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}