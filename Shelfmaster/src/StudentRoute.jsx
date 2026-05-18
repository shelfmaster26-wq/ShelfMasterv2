import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { localDb } from './localDbClient';

/**
 * Wraps all student-only routes.
 * - Redirects to /login if no session exists.
 * - Redirects to /login if the logged-in user is not a student.
 * - Polls every 30 s to detect archival while the user is active.
 */
export default function StudentRoute({ children }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking'); // 'checking' | 'allowed'

  useEffect(() => {
    async function checkRole(userId, archivedError) {
      if (!userId) {
        await localDb.auth.signOut();
        if (archivedError) {
          navigate('/login?reason=archived', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
        return;
      }
      const { data } = await localDb
        .from('users')
        .select('role')
        .eq('auth_id', userId)
        .single();

      if (!data || (data.role !== 'student' && data.role !== 'teacher')) {
        navigate('/login', { replace: true });
      } else {
        setStatus('allowed');
      }
    }

    // Initial check on mount
    localDb.auth.getUser().then(({ data: { user }, error }) => {
      checkRole(user?.id ?? null, error === 'account_archived');
    });

    // Periodic session validity check — catches archival while the user is active
    const sessionPoll = setInterval(async () => {
      const { data: { user }, error } = await localDb.auth.getUser();
      if (!user) {
        clearInterval(sessionPoll);
        await localDb.auth.signOut();
        if (error === 'account_archived') {
          navigate('/login?reason=archived', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      }
    }, 30000);

    return () => clearInterval(sessionPoll);
  }, [navigate]);

  if (status === 'checking') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Verifying session...</p>
      </div>
    );
  }

  return children;
}
