import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { localDb } from './localDbClient';
import { localDbAdmin } from './localDbAdmin';
import { useResponsive } from './useResponsive';
import { MdClose } from 'react-icons/md';

// ── SVG Icon Library ──────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, color = 'currentColor', style = {} }) => {
  const icons = {
    books: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
    graduationCap: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
      </svg>
    ),
    scroll: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    bookOpen: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
    landmark: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>
      </svg>
    ),
    archive: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
      </svg>
    ),
    zap: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    barChart: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
    ),
    shield: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    mail: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
      </svg>
    ),
    phone: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    ),
    mapPin: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
      </svg>
    ),
    search: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
    bookshelf: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="4" height="18" rx="1"/><rect x="8" y="6" width="4" height="15" rx="1"/><rect x="14" y="2" width="4" height="19" rx="1"/><rect x="20" y="8" width="2" height="13" rx="1"/><line x1="2" y1="21" x2="22" y2="21"/>
      </svg>
    ),
    inbox: (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
      </svg>
    ),
  };
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0, ...style }}
      viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {icons[name]?.props?.children}
    </svg>
  );
};

// Wrapper that renders the icon SVG directly
const Ico = ({ name, size = 20, color = 'currentColor', style = {} }) => {
  const paths = {
    books: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    graduationCap: <><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></>,
    scroll: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    bookOpen: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
    landmark: <><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    barChart: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>,
    mapPin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}>
      {paths[name]}
    </svg>
  );
};

const STYLES = `
  :root {
    --maroon:      #7B1F1F;
    --maroon-deep: #5A1515;
    --maroon-soft: #9B3A3A;
    --cream:       #FDF8F2;
    --cream-dark:  #F2EAE0;
    --yellow:      #D4A843;
    --yellow-soft: #FBF4E3;
    --green:       #3D7A48;
    --green-soft:  #EBF5ED;
    --slate:       #7A6A62;
    --ink:         #18120F;
    --text-muted:  #7A6A62;
    --text-faint:  #B8A89E;
    --border:      #E8DDD5;
    --shadow-sm:   0 2px 10px rgba(90,21,21,.09);
    --shadow-md:   0 6px 28px rgba(90,21,21,.11);
    --shadow-lg:   0 16px 52px rgba(90,21,21,.13);
    --ff-display:  'Cormorant Garamond', Georgia, serif;
    --ff-body:     'DM Sans', system-ui, sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: var(--ff-body); background: var(--cream); color: var(--ink); margin: 0; }
  .home-container { overflow-x: hidden; }

  .hero-pattern::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
  }
  .hero-wave::after {
    content: '';
    position: absolute;
    bottom: -1px; left: 0; right: 0;
    height: 56px;
    background: var(--cream);
    clip-path: ellipse(55% 100% at 50% 100%);
    z-index: 2;
  }

  .book-card { transition: transform .2s ease, box-shadow .2s ease; }
  .book-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-lg) !important; }

  .cat-card { transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
  .cat-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-md) !important; border-color: var(--maroon) !important; }

  .feat-card { transition: box-shadow .2s ease; }
  .feat-card:hover { box-shadow: var(--shadow-md) !important; }

  .chip { transition: background .2s, color .2s, border-color .2s; }
  .chip:hover { background: var(--maroon) !important; color: white !important; border-color: var(--maroon) !important; }

  .btn-outline:hover { border-color: white !important; background: rgba(255,255,255,.08) !important; }

  @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
  .skeleton { animation: pulse 1.4s ease-in-out infinite; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
  .fade-up   { animation: fadeUp .55s ease both; }
  .fade-up-1 { animation-delay: .08s; }
  .fade-up-2 { animation-delay: .18s; }
  .fade-up-3 { animation-delay: .28s; }
  .fade-up-4 { animation-delay: .40s; }

  @keyframes badgePulse { 0%,100%{box-shadow:0 0 0 0 rgba(58,125,68,.4)} 50%{box-shadow:0 0 0 6px rgba(58,125,68,0)} }
  .badge-avail { animation: badgePulse 2.2s ease infinite; }

  .stat-divider { width: 1px; background: rgba(255,255,255,.22); align-self: stretch; margin: 0 4px; }
`;

const FEATURED_CATEGORIES = [
  { label: 'General Reference',      icon: 'books',         bg: 'var(--cream-dark)', iconColor: '#7A6A62' },
  { label: 'Academic & Textbooks',   icon: 'graduationCap', bg: 'var(--green-soft)', iconColor: '#3D7A48' },
  { label: 'Thesis & Dissertations', icon: 'scroll',        bg: 'var(--yellow-soft)',iconColor: '#C49A2A' },
  { label: 'Fiction & Literature',   icon: 'bookOpen',      bg: '#FEF2F2',           iconColor: '#BE4B4B' },
  { label: 'Special Collections',    icon: 'landmark',      bg: '#EFF6FF',           iconColor: '#3B7DD8' },
];

const FEATURES = [
  { icon: 'archive', title: 'Centralized Records', desc: 'Every book, every detail — one unified system.' },
  { icon: 'zap',     title: 'Faster Transactions', desc: 'Borrow and return with near-instant processing.' },
  { icon: 'barChart',title: 'Reports & Analytics', desc: 'Generate detailed, exportable PDF reports.' },
  { icon: 'shield',  title: 'Secure Access',        desc: 'Role-based permissions protect your data.' },
];

export default function Home() {
  const navigate = useNavigate();
  const { isMobile, isTablet } = useResponsive();
  const [content, setContent]           = useState({});
  const [loading, setLoading]           = useState(true);
  const [books, setBooks]               = useState([]);
  const [searchTerm, setSearchTerm]     = useState('');
  const [booksLoading, setBooksLoading] = useState(true);
  const catalogRef = useRef(null);

  useEffect(() => {
    async function fetchSiteContent() {
      const { data, error } = await localDb.from('site_content').select('*').limit(1).single();
      if (!error && data) setContent(data);
      setLoading(false);
    }
    fetchSiteContent();
    fetchBooks();
  }, []);

  async function fetchBooks() {
    setBooksLoading(true);
    const { data } = await localDbAdmin
      .from('books')
      .select('id, title, authors, cover_image, quantity, category, subject_class')
      .neq('status', 'archived')
      .order('title', { ascending: true });
    setBooks(data || []);
    setBooksLoading(false);
  }

  const filteredBooks = books.filter(book => {
    if (!searchTerm.trim()) return true;
    const s = searchTerm.toLowerCase();
    return (
      book.title?.toLowerCase().includes(s) ||
      book.authors?.toLowerCase().includes(s) ||
      (book.category || book.subject_class || '').toLowerCase().includes(s)
    );
  });

  const scrollToCatalog = () => {
    setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleChipClick = (tag) => { setSearchTerm(tag); scrollToCatalog(); };
  const handleSearch    = (e)   => { e.preventDefault(); scrollToCatalog(); };

  const bookCols = isMobile
    ? 'repeat(2, 1fr)'
    : isTablet
    ? 'repeat(3, 1fr)'
    : 'repeat(auto-fill, minmax(210px, 1fr))';

  if (loading) {
    return (
      <React.Fragment>
        <style>{STYLES}</style>
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'var(--cream)',
          fontFamily: 'var(--ff-display)', fontSize: '1.4rem', color: 'var(--maroon)',
        }}>
          Opening the shelves…
        </div>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <style>{STYLES}</style>
      <div className="home-container">

        {/* ══ HERO ══ */}
        <section
          className="hero-pattern hero-wave"
          style={{ position: 'relative', background: 'var(--maroon-deep)', overflow: 'hidden' }}
        >
          {content.hero_banner_url && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 0,
              backgroundImage: 'url(' + content.hero_banner_url + ')',
              backgroundSize: 'cover', backgroundPosition: 'center',
            }} />
          )}
          {content.hero_banner_url && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(90,21,21,.82)', zIndex: 1 }} />
          )}

          <div style={{
            position: 'relative', zIndex: 3,
            maxWidth: 1200, margin: '0 auto',
            padding: isMobile ? '56px 20px 80px' : isTablet ? '72px 32px 100px' : '88px 48px 120px',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'center',
            gap: isMobile ? 36 : 56,
          }}>
            {/* Left copy */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fade-up" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'transparent', border: '1.5px solid rgba(255,255,255,.4)',
                color: 'white', borderRadius: 100,
                padding: '5px 14px', marginBottom: 20,
                fontSize: isMobile ? '.75rem' : '.8rem',
                fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff0000', display: 'inline-block' }} />
                Library Management System
              </div>

              <h1 className="fade-up fade-up-1" style={{
                fontFamily: 'var(--ff-display)',
                fontSize: isMobile ? '2.5rem' : isTablet ? '3.2rem' : '4rem',
                fontWeight: 900, lineHeight: 1.1,
                margin: '0 0 20px', color: 'white', letterSpacing: '-.01em',
              }}>
                {content.tagline || 'Master Every Shelf'}
              </h1>

              <p className="fade-up fade-up-2" style={{
                fontSize: isMobile ? '.95rem' : '1.05rem',
                color: 'rgba(255,255,255,.75)',
                lineHeight: 1.7, margin: '0 0 32px', maxWidth: 440,
              }}>
                A smart, centralized library system built for faster borrowing, real-time availability, and effortless management.
              </p>

              <div className="fade-up fade-up-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to="/login" style={{
                  display: 'inline-block',
                  padding: isMobile ? '13px 26px' : '15px 34px',
                  fontSize: isMobile ? '.9rem' : '.95rem',
                  background: 'var(--yellow)', color: 'var(--maroon-deep)',
                  textDecoration: 'none', borderRadius: 10,
                  fontWeight: 700, letterSpacing: '.01em',
                }}>
                  Get Started →
                </Link>
                <button
                  className="btn-outline"
                  onClick={scrollToCatalog}
                  style={{
                    display: 'inline-block',
                    padding: isMobile ? '13px 26px' : '15px 34px',
                    fontSize: isMobile ? '.9rem' : '.95rem',
                    background: 'transparent', color: 'white',
                    border: '1.5px solid rgba(255,255,255,.4)',
                    borderRadius: 10, fontWeight: 600,
                    cursor: 'pointer', letterSpacing: '.01em',
                    fontFamily: 'var(--ff-body)',
                  }}
                >
                  Browse Collection
                </button>
              </div>

              {!booksLoading && (
                <div className="fade-up fade-up-4" style={{
                  display: 'flex', gap: 24, marginTop: 44, alignItems: 'center',
                }}>
                  {[
                    { value: books.length, label: 'Total Books' },
                    { value: books.filter(b => (b.quantity ?? 0) > 0).length, label: 'Available' },
                    { value: [...new Set(books.map(b => b.category || b.subject_class).filter(Boolean))].length, label: 'Categories' },
                  ].map((s, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <div className="stat-divider" />}
                      <div>
                        <div style={{
                          fontSize: isMobile ? '1.5rem' : '1.9rem',
                          fontWeight: 800,
                          fontFamily: 'var(--ff-display)',
                          color: 'white', lineHeight: 1,
                        }}>
                          {s.value.toLocaleString()}
                        </div>
                        <div style={{
                          fontSize: '.72rem', color: 'rgba(255,255,255,.5)',
                          marginTop: 4, fontWeight: 500,
                          letterSpacing: '.04em', textTransform: 'uppercase',
                        }}>
                          {s.label}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* Right illustration — SVG bookshelf art */}
            {!isMobile && (
              <div style={{
                flexShrink: 0, width: isTablet ? 240 : 320,
                height: isTablet ? 280 : 340,
                background: 'rgba(255,255,255,.07)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 12,
              }}>
                <Ico name="books" size={64} color="rgba(255,255,255,.35)" />
                <div style={{ color: 'rgba(255,255,255,.35)', fontSize: '.78rem', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  Your Library Awaits
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ══ SEARCH ══ */}
        <section style={{
          background: 'var(--cream)',
          padding: isMobile ? '32px 16px 24px' : isTablet ? '40px 28px 28px' : '48px 48px 32px',
        }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <p style={{
              textAlign: 'center',
              fontFamily: 'var(--ff-display)',
              fontSize: isMobile ? '.8rem' : '.85rem',
              color: 'var(--maroon)', fontWeight: 600,
              letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            }}>
              Search the Collection
            </p>

            <form onSubmit={handleSearch} style={{
              display: 'flex', gap: isMobile ? 8 : 12,
              background: 'white',
              padding: isMobile ? '10px 14px' : '12px 18px',
              borderRadius: 14,
              boxShadow: '0 4px 24px rgba(123,31,31,.08)',
              border: '1.5px solid #F0E9DF',
              marginBottom: 18,
            }}>
              <Ico name="search" size={isMobile ? 18 : 20} color="#94a3b8"
                style={{ alignSelf: 'center' }} />

              <input
                type="text"
                placeholder={isMobile ? 'Search books…' : 'Search by title, author, or subject…'}
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); scrollToCatalog(); }}
                autoComplete="off"
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  fontSize: isMobile ? '.9rem' : '1rem',
                  color: 'var(--ink)', background: 'transparent',
                  fontFamily: 'var(--ff-body)',
                }}
              />

              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#94a3b8', fontSize: '1rem', padding: '0 4px',
                    flexShrink: 0, alignSelf: 'center',
                  }}
                >
                  {<MdClose style={{verticalAlign:"middle"}} />}
                </button>
              )}

              <button type="submit" style={{
                background: 'var(--maroon)', color: 'white', border: 'none',
                padding: isMobile ? '8px 14px' : '10px 20px', borderRadius: 8,
                cursor: 'pointer', fontWeight: 700,
                fontSize: isMobile ? '.82rem' : '.88rem',
                flexShrink: 0,
                fontFamily: 'var(--ff-body)',
                letterSpacing: '.02em',
              }}>
                Search
              </button>
            </form>
          </div>
        </section>

        {/* ══ CATALOG ══ */}
        <section ref={catalogRef} style={{
          padding: isMobile ? '28px 16px 40px' : isTablet ? '36px 28px 48px' : '44px 48px 56px',
          maxWidth: 1300, margin: '0 auto', width: '100%',
        }}>
          <div style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'flex-end',
            justifyContent: 'space-between',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 14 : 20, marginBottom: isMobile ? 20 : 28,
          }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--ff-display)',
                margin: 0,
                fontSize: isMobile ? '1.5rem' : isTablet ? '1.9rem' : '2.3rem',
                color: 'var(--maroon)', fontWeight: 700, lineHeight: 1.15,
              }}>
                {searchTerm ? ('Results for "' + searchTerm + '"') : 'Browse Our Collection'}
              </h2>
              {!booksLoading && (
                <p style={{ color: 'var(--text-muted)', margin: '5px 0 0', fontSize: isMobile ? '.8rem' : '.88rem' }}>
                  {filteredBooks.length} {filteredBooks.length === 1 ? 'book' : 'books'} found
                  {searchTerm && (
                    <React.Fragment>
                      {' — '}
                      <button
                        onClick={() => setSearchTerm('')}
                        style={{
                          background: 'none', border: 'none', color: 'var(--maroon)',
                          cursor: 'pointer', fontWeight: 700, padding: 0,
                          fontFamily: 'var(--ff-body)', fontSize: 'inherit',
                        }}
                      >
                        Clear
                      </button>
                    </React.Fragment>
                  )}
                </p>
              )}
            </div>
            <Link to="/login" style={{
              background: 'var(--maroon)', color: 'white',
              padding: isMobile ? '10px 18px' : '12px 22px',
              borderRadius: 10, textDecoration: 'none', fontWeight: 700,
              fontSize: isMobile ? '.82rem' : '.88rem', whiteSpace: 'nowrap',
            }}>
              Sign in to Borrow →
            </Link>
          </div>

          {booksLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: bookCols, gap: isMobile ? 12 : 20 }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton" style={{
                  height: isMobile ? 230 : 310,
                  background: '#E2E8F0', borderRadius: 14,
                }} />
              ))}
            </div>
          ) : filteredBooks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: isMobile ? '50px 20px' : '80px 20px' }}>
              {/* Empty state icon */}
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--cream-dark)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 18px',
              }}>
                <Ico name="inbox" size={34} color="var(--text-faint)" />
              </div>
              <p style={{
                fontFamily: 'var(--ff-display)',
                fontSize: isMobile ? '1.2rem' : '1.4rem',
                fontWeight: 700, color: 'var(--maroon)', margin: '0 0 8px',
              }}>
                No books matched &quot;{searchTerm}&quot;
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: isMobile ? '.85rem' : '.9rem', margin: '0 0 20px' }}>
                Try a different title, author name, or category.
              </p>
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  background: 'var(--maroon)', color: 'white', border: 'none',
                  padding: '12px 24px', borderRadius: 10, cursor: 'pointer',
                  fontWeight: 700, fontSize: '.9rem', fontFamily: 'var(--ff-body)',
                }}
              >
                Show All Books
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: bookCols, gap: isMobile ? 12 : 20 }}>
              {filteredBooks.map(book => {
                const isAvailable = (book.quantity ?? 0) > 0;
                const category = book.category || book.subject_class || 'General';
                return (
                  <div
                    key={book.id}
                    className="book-card"
                    onClick={() => navigate('/login')}
                    style={{
                      background: 'white', borderRadius: 14,
                      boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                      overflow: 'hidden',
                      display: 'flex', flexDirection: 'column',
                      cursor: 'pointer', border: '1px solid rgba(0,0,0,.05)',
                    }}
                  >
                    <div style={{ position: 'relative', height: isMobile ? 148 : 196, flexShrink: 0, overflow: 'hidden' }}>
                      {book.cover_image ? (
                        <img
                          src={book.cover_image}
                          alt={book.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{
                          width: '100%', height: '100%',
                          background: 'linear-gradient(145deg, #7B1F1F 0%, #5A1515 45%, #1C3A6E 100%)',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', padding: 14, gap: 10,
                        }}>
                          <Ico name="bookOpen" size={isMobile ? 32 : 40} color="rgba(255,255,255,0.5)" />
                          <span style={{
                            fontSize: isMobile ? '.6rem' : '.65rem',
                            color: 'rgba(255,255,255,.8)',
                            textAlign: 'center', fontWeight: 600, lineHeight: 1.35,
                          }}>
                            {book.title}
                          </span>
                        </div>
                      )}
                      <div
                        className={isAvailable ? 'badge-avail' : ''}
                        style={{
                          position: 'absolute', top: 8, right: 8,
                          background: isAvailable ? 'var(--green)' : '#EF4444',
                          color: 'white',
                          fontSize: isMobile ? '.58rem' : '.62rem',
                          fontWeight: 700, padding: '3px 9px', borderRadius: 100,
                        }}
                      >
                        {isAvailable ? (book.quantity + ' left') : 'Out of stock'}
                      </div>
                    </div>

                    <div style={{ padding: isMobile ? '11px 13px' : '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <span style={{
                        fontSize: isMobile ? '.58rem' : '.62rem',
                        background: 'var(--green-soft)', color: 'var(--green)',
                        padding: '2px 9px', borderRadius: 100, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '.05em',
                        alignSelf: 'flex-start', marginBottom: 9,
                      }}>
                        {category}
                      </span>
                      <p style={{
                        margin: '0 0 4px', fontWeight: 700,
                        fontSize: isMobile ? '.8rem' : '.9rem',
                        color: 'var(--ink)', lineHeight: 1.35,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {book.title}
                      </p>
                      <p style={{
                        margin: '0 0 13px',
                        fontSize: isMobile ? '.7rem' : '.76rem',
                        color: 'var(--text-muted)',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}>
                        {book.authors || 'Unknown Author'}
                      </p>
                      <Link
                        to="/login"
                        onClick={e => e.stopPropagation()}
                        style={{
                          marginTop: 'auto', textAlign: 'center', display: 'block',
                          padding: isMobile ? '7px 0' : '8px 0',
                          background: isAvailable ? 'var(--green)' : '#E2E8F0',
                          color: isAvailable ? 'white' : '#94a3b8',
                          borderRadius: 8, textDecoration: 'none', fontWeight: 700,
                          fontSize: isMobile ? '.74rem' : '.8rem',
                          pointerEvents: isAvailable ? 'auto' : 'none',
                        }}
                      >
                        {isAvailable ? 'Sign in to Borrow' : 'Unavailable'}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ══ FEATURED CATEGORIES ══ */}
        <section style={{
          background: 'var(--cream-dark)',
          padding: isMobile ? '36px 16px' : isTablet ? '44px 28px' : '56px 48px',
        }}>
          <div style={{ maxWidth: 1300, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: isMobile ? 20 : 32 }}>
              <p style={{
                fontFamily: 'var(--ff-display)',
                color: 'var(--maroon)',
                fontSize: isMobile ? '.8rem' : '.85rem', fontWeight: 600,
                letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 8px',
              }}>
                Explore by
              </p>
              <h2 style={{
                fontFamily: 'var(--ff-display)',
                margin: 0,
                fontSize: isMobile ? '1.5rem' : isTablet ? '1.9rem' : '2.2rem',
                color: 'var(--maroon)', fontWeight: 700,
              }}>
                Featured Categories
              </h2>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)',
              gap: isMobile ? 12 : 16,
            }}>
              {FEATURED_CATEGORIES.map((cat, i) => (
                <div
                  key={i}
                  className="cat-card"
                  onClick={() => handleChipClick(cat.label)}
                  style={{
                    cursor: 'pointer',
                    padding: isMobile ? '20px 14px' : '26px 20px',
                    background: 'white', borderRadius: 14,
                    boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                    textAlign: 'center',
                    border: '1.5px solid transparent',
                  }}
                >
                  <div style={{
                    width: isMobile ? 48 : 56, height: isMobile ? 48 : 56,
                    borderRadius: '50%', background: cat.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <Ico name={cat.icon} size={isMobile ? 22 : 26} color={cat.iconColor} />
                  </div>
                  <h3 style={{
                    margin: 0,
                    fontFamily: 'var(--ff-display)',
                    fontSize: isMobile ? '.88rem' : '.96rem',
                    color: 'var(--ink)', fontWeight: 700, lineHeight: 1.3,
                  }}>
                    {cat.label}
                  </h3>
                  <div style={{
                    fontSize: isMobile ? '.72rem' : '.78rem', marginTop: 8,
                    color: 'var(--maroon)', fontWeight: 600,
                    letterSpacing: '.06em', textTransform: 'uppercase',
                  }}>
                    Explore →
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ FEATURES ══ */}
        <section style={{
          background: 'var(--cream)',
          padding: isMobile ? '36px 16px' : isTablet ? '44px 28px' : '56px 48px',
        }}>
          <div style={{ maxWidth: 1300, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: isMobile ? 20 : 36 }}>
              <p style={{
                fontFamily: 'var(--ff-display)',
                color: 'var(--maroon)',
                fontSize: isMobile ? '.8rem' : '.85rem', fontWeight: 600,
                letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 8px',
              }}>
                Why ShelfMaster
              </p>
              <h2 style={{
                fontFamily: 'var(--ff-display)',
                margin: 0,
                fontSize: isMobile ? '1.5rem' : isTablet ? '1.9rem' : '2.2rem',
                color: 'var(--maroon)', fontWeight: 700,
              }}>
                System Features
              </h2>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
              gap: isMobile ? 12 : 16,
              marginBottom: isMobile ? 28 : 44,
            }}>
              {FEATURES.map((f, i) => (
                <div
                  key={i}
                  className="feat-card"
                  style={{
                    background: 'white',
                    padding: isMobile ? '20px 16px' : '26px 22px',
                    borderRadius: 14,
                    boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                    border: '1px solid rgba(0,0,0,.05)',
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'column',
                    alignItems: 'flex-start',
                    gap: isMobile ? 14 : 0,
                  }}
                >
                  <div style={{
                    width: isMobile ? 40 : 48, height: isMobile ? 40 : 48,
                    borderRadius: 12,
                    background: 'var(--yellow-soft)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: isMobile ? 0 : 16, flexShrink: 0,
                  }}>
                    <Ico name={f.icon} size={isMobile ? 20 : 24} color="var(--maroon)" />
                  </div>
                  <div>
                    <h3 style={{
                      margin: isMobile ? '0 0 5px' : '0 0 8px',
                      fontFamily: 'var(--ff-display)',
                      fontSize: isMobile ? '.95rem' : '1.05rem',
                      color: 'var(--maroon)', fontWeight: 700,
                    }}>
                      {f.title}
                    </h3>
                    <p style={{
                      margin: 0,
                      fontSize: isMobile ? '.8rem' : '.88rem',
                      color: 'var(--text-muted)', lineHeight: 1.6,
                    }}>
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Contact bar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
              gap: isMobile ? 12 : 16,
              background: 'var(--maroon-deep)',
              borderRadius: 16,
              padding: isMobile ? 20 : 28,
            }}>
              {[
                { iconName: 'mail',   label: 'Email',    value: content.contact_email    || 'ShelfMaster@wmsu.edu.ph' },
                { iconName: 'phone',  label: 'Phone',    value: content.contact_phone    || '0912-345-6789' },
                { iconName: 'mapPin', label: 'Location', value: content.contact_location || 'Normal Road, Zamboanga City' },
              ].map((c, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start',
                  gap: 12,
                  justifyContent: isMobile ? 'flex-start' : 'center',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(255,255,255,.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 2,
                  }}>
                    <Ico name={c.iconName} size={16} color="var(--yellow)" />
                  </div>
                  <div>
                    <div style={{
                      fontSize: '.72rem', color: 'var(--yellow)',
                      fontWeight: 700, letterSpacing: '.1em',
                      textTransform: 'uppercase', marginBottom: 4,
                    }}>
                      {c.label}
                    </div>
                    <div style={{
                      fontSize: isMobile ? '.85rem' : '.92rem',
                      color: 'rgba(255,255,255,.82)', lineHeight: 1.5,
                    }}>
                      {c.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ ABOUT ══ */}
        <section style={{
          background: 'var(--cream-dark)',
          padding: isMobile ? '36px 16px' : isTablet ? '52px 28px' : '72px 48px',
        }}>
          <div style={{
            maxWidth: 1300, margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : '1fr 1fr',
            gap: isMobile ? 32 : 60, alignItems: 'center',
          }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--ff-display)',
                margin: '0 0 20px',
                fontSize: isMobile ? '2rem' : isTablet ? '2.6rem' : '3.2rem',
                color: 'var(--maroon)', fontWeight: 900, lineHeight: 1.1,
              }}>
                About Us
              </h2>
              <p style={{
                lineHeight: 1.8, color: '#555', marginBottom: 24,
                fontSize: isMobile ? '.9rem' : '.98rem',
              }}>
                {content.about_text || 'ShelfMaster provides smart and reliable library management solutions designed to help schools and institutions organize their collections, maximize efficiency, and serve their patrons better.'}
              </p>

              {(content.mission || content.vision) && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                  gap: 14, marginBottom: 28,
                }}>
                  {content.mission && (
                    <div style={{
                      background: 'white', padding: '16px 18px', borderRadius: 12,
                      borderLeft: '4px solid #3A7D44',
                      boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                    }}>
                      <strong style={{ color: 'var(--maroon)', fontSize: '.85rem', fontFamily: 'var(--ff-display)' }}>
                        Mission
                      </strong>
                      <p style={{ fontSize: '.83rem', margin: '6px 0 0', color: '#555', lineHeight: 1.6 }}>
                        {content.mission}
                      </p>
                    </div>
                  )}
                  {content.vision && (
                    <div style={{
                      background: 'var(--yellow-soft)', padding: '16px 18px', borderRadius: 12,
                      borderLeft: '4px solid #E8B84B',
                      boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                    }}>
                      <strong style={{ color: 'var(--maroon)', fontSize: '.85rem', fontFamily: 'var(--ff-display)' }}>
                        Vision
                      </strong>
                      <p style={{ fontSize: '.83rem', margin: '6px 0 0', color: '#555', lineHeight: 1.6 }}>
                        {content.vision}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <Link to="/login" style={{
                display: 'inline-block',
                padding: isMobile ? '12px 26px' : '14px 32px',
                background: 'var(--maroon)', color: 'white',
                textDecoration: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: isMobile ? '.88rem' : '.93rem',
                letterSpacing: '.02em',
              }}>
                Explore More →
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 12 : 16 }}>
              <div style={{ height: isMobile ? 130 : 180, background: '#CFCFCF', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }} />
              <div style={{ height: isMobile ? 130 : 180, background: '#BFBFBF', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }} />
              <div style={{ height: isMobile ? 90 : 130, background: '#D8D8D8', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)', gridColumn: 'span 2' }} />
            </div>
          </div>
        </section>

        {/* ══ FOOTER ══ */}
        <footer style={{
          background: 'var(--maroon-deep)', color: 'white',
          padding: isMobile ? '32px 16px 24px' : isTablet ? '40px 28px 28px' : '52px 48px 36px',
        }}>
          <div style={{
            maxWidth: 1300, margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: isMobile ? 24 : 32,
            marginBottom: isMobile ? 24 : 36,
          }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--ff-display)',
                margin: '0 0 10px',
                fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: 700,
              }}>
                ShelfMaster
              </h2>
              <p style={{ fontSize: isMobile ? '.8rem' : '.85rem', color: 'rgba(255,255,255,.5)', lineHeight: 1.7, margin: 0 }}>
                {content.footer_text || 'A smart library management system for modern institutions.'}
              </p>
            </div>
            <div>
              <h4 style={{ color: 'white', fontSize: isMobile ? '.82rem' : '.88rem', margin: '0 0 12px', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Contact
              </h4>
              {[
                { icon: 'mail',   text: content.contact_email || 'ShelfMaster@wmsu.edu.ph' },
                { icon: 'phone',  text: content.contact_phone || '0912-345-6789' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ico name={item.icon} size={13} color="rgba(255,255,255,.4)" />
                  <span style={{ fontSize: isMobile ? '.8rem' : '.85rem', color: 'rgba(255,255,255,.7)' }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ color: 'white', fontSize: isMobile ? '.82rem' : '.88rem', margin: '0 0 12px', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Quick Links
              </h4>
              <Link to="/Signup" style={{ fontSize: isMobile ? '.8rem' : '.85rem', textDecoration: 'none', color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <Ico name="users" size={13} color="rgba(255,255,255,.4)" /> Create Account
              </Link>
              <Link to="/login" style={{ fontSize: isMobile ? '.8rem' : '.85rem', textDecoration: 'none', color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Ico name="link" size={13} color="rgba(255,255,255,.4)" /> Sign In
              </Link>
            </div>
            <div>
              <h4 style={{ color: 'white', fontSize: isMobile ? '.82rem' : '.88rem', margin: '0 0 12px', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Connect
              </h4>
              <p style={{ fontSize: isMobile ? '.8rem' : '.85rem', color: 'rgba(255,255,255,.4)', margin: 0 }}>
                Stay connected through our official channels.
              </p>
            </div>
          </div>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,.1)',
            paddingTop: isMobile ? 16 : 20,
            textAlign: 'center',
            fontSize: isMobile ? '.75rem' : '.8rem',
            color: 'rgba(255,255,255,.3)',
          }}>
            © 2026 ShelfMaster Library · All rights reserved
          </div>
        </footer>

      </div>
    </React.Fragment>
  );
}