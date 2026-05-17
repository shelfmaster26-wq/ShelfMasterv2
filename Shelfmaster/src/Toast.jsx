import React, { useEffect } from 'react';
import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimesCircle } from 'react-icons/fa';
import { MdClose } from 'react-icons/md';

const CONFIG = {
  success: { border: '#16a34a', iconBg: '#dcfce7', iconColor: '#16a34a', duration: 4000 },
  error:   { border: '#dc2626', iconBg: '#fee2e2', iconColor: '#dc2626', duration: 6000 },
  warning: { border: '#d97706', iconBg: '#fef3c7', iconColor: '#d97706', duration: 5000 },
  info:    { border: '#2563eb', iconBg: '#dbeafe', iconColor: '#2563eb', duration: 5000 },
};

const ICONS = {
  success: <FaCheckCircle size={15} />,
  error:   <FaTimesCircle size={15} />,
  warning: <FaExclamationTriangle size={15} />,
  info:    <FaInfoCircle size={15} />,
};

export default function Toast({ message, title, type = 'error', onClose }) {
  const c = CONFIG[type] || CONFIG.error;

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, c.duration);
    return () => clearTimeout(t);
  }, [message, type]);

  if (!message) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      zIndex: 99999,
      maxWidth: 400,
      width: 'calc(100vw - 40px)',
      background: 'white',
      borderRadius: 14,
      borderLeft: `4px solid ${c.border}`,
      padding: '14px 14px 20px 14px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.13), 0 2px 10px rgba(0,0,0,0.07)',
      animation: 'toastIn 0.32s cubic-bezier(0.34, 1.4, 0.64, 1)',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(64px) scale(0.96); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toastProgress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: c.iconBg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: c.iconColor, marginTop: 1,
        }}>
          {ICONS[type]}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {title
            ? <>
                <div style={{ fontWeight: 700, fontSize: '.875rem', color: '#0f172a', lineHeight: 1.35, marginBottom: 3 }}>
                  {title}
                </div>
                <div style={{ fontSize: '.8rem', color: '#64748b', lineHeight: 1.55 }}>
                  {message}
                </div>
              </>
            : <div style={{ fontWeight: 600, fontSize: '.875rem', color: '#1e293b', lineHeight: 1.45 }}>
                {message}
              </div>
          }
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#cbd5e1', padding: '3px', flexShrink: 0,
            display: 'flex', alignItems: 'center', borderRadius: 6,
            marginTop: -1, transition: 'color .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#64748b'}
          onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
          aria-label="Dismiss"
        >
          <MdClose size={15} />
        </button>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 3, background: '#f1f5f9', borderRadius: '0 0 14px 0',
      }}>
        <div style={{
          height: '100%',
          background: c.border,
          transformOrigin: 'left',
          animation: `toastProgress ${c.duration}ms linear forwards`,
          opacity: 0.5,
        }} />
      </div>
    </div>
  );
}
