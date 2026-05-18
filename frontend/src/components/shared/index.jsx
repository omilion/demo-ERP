import { useState, useRef } from 'react'

const ICONS = {
  warehouse:    <><rect x="2" y="7" width="20" height="14" rx="1.5"/><polyline points="16,7 12,3 8,7"/><line x1="12" y1="3" x2="12" y2="21"/></>,
  alertTriangle:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  shoppingCart: <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
  clock:        <><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></>,
  search:       <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  wrench:       <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>,
  package:      <><path d="M16.5 9.4l-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
  dollarSign:   <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  truck:        <><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  chevronDown:  <polyline points="6,9 12,15 18,9"/>,
  chevronRight: <polyline points="9,18 15,12 9,6"/>,
  chevronLeft:  <polyline points="15,18 9,12 15,6"/>,
  bell:         <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
  user:         <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  settings:     <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  logOut:       <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  grid:         <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
  creditCard:   <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
  fileText:     <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></>,
  tag:          <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
  layers:       <><polygon points="12,2 2,7 12,12 22,7 12,2"/><polyline points="2,17 12,22 22,17"/><polyline points="2,12 12,17 22,12"/></>,
  mapPin:       <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
  arrowRight:   <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></>,
  zap:          <polyline points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>,
  scissors:     <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></>,
  box:          <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></>,
  tool:         <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>,
  book:         <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
  history:      <><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></>,
  plusCircle:   <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
  users:        <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  check:        <polyline points="20,6 9,17 4,12"/>,
  x:            <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  eye:          <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  edit:         <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  trash:        <><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  download:     <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  filter:       <><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3"/></>,
  send:         <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9 22,2"/></>,
  messageSquare:<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  trendingUp:   <><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></>,
  trendingDown: <><polyline points="23,18 13.5,8.5 8.5,13.5 1,6"/><polyline points="17,18 23,18 23,12"/></>,
  minus:        <line x1="5" y1="12" x2="19" y2="12"/>,
  plus:         <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  refreshCw:    <><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
  info:         <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
  printer:      <><polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>,
  barChart2:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  calendar:     <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  clipboard:    <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></>,
  home:         <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></>,
  dashboard:    <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></>,
  cloud:        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>,
  phone:        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>,
  briefcase:    <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
  lock:         <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
}

export const Icon = ({ name, size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name] || null}
  </svg>
)

// ── Badge ─────────────────────────────────────────────────────────────────────
export const Badge = ({ children, tone = 'neutral', size = 'sm' }) => {
  const tones = {
    neutral: { bg: 'var(--green-100)', text: 'var(--green-700)' },
    amber:   { bg: 'var(--amber-bg)', text: 'oklch(0.48 0.14 68)' },
    red:     { bg: 'var(--red-bg)',   text: 'var(--red)' },
    blue:    { bg: 'var(--blue-bg)',  text: 'var(--blue)' },
    gray:    { bg: 'oklch(0.93 0.003 220)', text: 'var(--text-2)' },
    green:   { bg: 'var(--green-50)', text: 'var(--green-600)' },
  }
  const t = tones[tone] || tones.neutral
  return (
    <span style={{
      background: t.bg, color: t.text,
      borderRadius: 20, padding: size === 'sm' ? '2px 8px' : '4px 11px',
      fontSize: size === 'sm' ? 11 : 12, fontWeight: 600,
      fontFamily: "'DM Mono', monospace",
      whiteSpace: 'nowrap', display: 'inline-block',
    }}>{children}</span>
  )
}

// ── KpiCard ───────────────────────────────────────────────────────────────────
export const KpiCard = ({ label, value, sublabel, icon, tone = 'neutral', onClick, trend }) => {
  const tones = {
    neutral: { accent: 'var(--green-600)', badge: 'var(--green-50)' },
    amber:   { accent: 'var(--amber)',     badge: 'var(--amber-bg)' },
    red:     { accent: 'var(--red)',       badge: 'var(--red-bg)' },
    blue:    { accent: 'var(--blue)',      badge: 'var(--blue-bg)' },
  }
  const t = tones[tone] || tones.neutral
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      background: '#fff', borderRadius: 10, padding: '16px 20px',
      boxShadow: hov ? '0 6px 18px oklch(0 0 0 / 0.10)' : 'var(--shadow-sm)',
      border: `1px solid ${hov ? t.accent : 'var(--border)'}`,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.18s', position: 'relative', overflow: 'hidden',
      flex: '1 1 0', minWidth: 160,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: t.accent, borderRadius: '10px 0 0 10px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: t.badge, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={16} color={t.accent} />
        </div>
        {trend !== undefined && (
          <span style={{ fontSize: 11, color: trend >= 0 ? 'var(--red)' : 'var(--green-600)', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Icon name={trend >= 0 ? 'trendingUp' : 'trendingDown'} size={12} color={trend >= 0 ? 'var(--red)' : 'var(--green-600)'} />
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 24, fontWeight: 500, color: 'var(--text-1)', letterSpacing: -1, lineHeight: 1 }}>
        {typeof value === 'number' ? value.toLocaleString('es-CL') : value}
      </div>
      <div style={{ marginTop: 5, fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>{label}</div>
      {sublabel && <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-3)' }}>{sublabel}</div>}
    </div>
  )
}

// ── SectionCard ───────────────────────────────────────────────────────────────
export const SectionCard = ({ title, icon, children, accent = 'var(--green-600)', action }) => (
  <div style={{ background: '#fff', borderRadius: 12, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'oklch(0.985 0.004 155)' }}>
      <span style={{ color: accent }}><Icon name={icon} size={14} /></span>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-2)', flex: 1 }}>{title}</span>
      {action}
    </div>
    <div style={{ padding: '6px 4px' }}>{children}</div>
  </div>
)

// ── ActionRow ─────────────────────────────────────────────────────────────────
export const ActionRow = ({ icon, label, badge, badgeTone = 'neutral', onClick }) => {
  const [hov, setHov] = useState(false)
  return (
    <button onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 11, width: '100%',
      padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
      background: hov ? 'var(--green-50)' : 'transparent',
      border: `1px solid ${hov ? 'var(--green-100)' : 'transparent'}`,
      transition: 'all 0.14s', textAlign: 'left',
    }}>
      <span style={{ color: 'var(--green-600)', flexShrink: 0 }}><Icon name={icon} size={15} /></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{label}</span>
      {badge !== undefined && <Badge tone={badgeTone}>{typeof badge === 'number' ? badge.toLocaleString('es-CL') : badge}</Badge>}
      <span style={{ color: 'var(--text-3)', opacity: hov ? 1 : 0, transition: 'opacity 0.14s' }}><Icon name="arrowRight" size={14} /></span>
    </button>
  )
}

// ── PageHeader ────────────────────────────────────────────────────────────────
export const PageHeader = ({ title, subtitle, breadcrumb, actions }) => (
  <div style={{ marginBottom: 24 }}>
    {breadcrumb && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
        {breadcrumb.map((b, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {i > 0 && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>/</span>}
            <span style={{ fontSize: 12, color: i === breadcrumb.length - 1 ? 'var(--text-2)' : 'var(--text-3)', fontWeight: i === breadcrumb.length - 1 ? 600 : 400 }}>{b}</span>
          </span>
        ))}
      </div>
    )}
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: -0.5 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  </div>
)

// ── Btn ───────────────────────────────────────────────────────────────────────
export const Btn = ({ children, variant = 'primary', size = 'md', icon, onClick, disabled }) => {
  const [hov, setHov] = useState(false)
  const isXs = size === 'xs'
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 7, fontFamily: 'inherit', fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s', border: 'none',
    fontSize: isXs ? 11 : size === 'sm' ? 12 : 13,
    padding: isXs ? '4px 9px' : size === 'sm' ? '8px 13px' : '10px 18px',
    minHeight: isXs ? 28 : size === 'sm' ? 36 : 44,
    opacity: disabled ? 0.5 : 1,
  }
  const variants = {
    primary: { background: hov ? 'var(--green-800)' : 'var(--green-900)', color: '#fff' },
    secondary: { background: hov ? 'var(--green-50)' : '#fff', color: 'var(--green-700)', border: '1px solid var(--green-100)' },
    ghost: { background: hov ? 'var(--bg)' : 'transparent', color: 'var(--text-2)' },
    danger: { background: hov ? 'oklch(0.48 0.20 25)' : 'var(--red)', color: '#fff' },
  }
  return (
    <button onClick={disabled ? undefined : onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ ...base, ...variants[variant] }}>
      {icon && <Icon name={icon} size={14} />}{children}
    </button>
  )
}

// ── SearchBar ─────────────────────────────────────────────────────────────────
export const SearchBar = ({ placeholder, value, onChange, style }) => (
  <div style={{ position: 'relative', ...style }}>
    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}>
      <Icon name="search" size={14} />
    </span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || 'Buscar…'} style={{
      width: '100%', padding: '8px 12px 8px 34px', borderRadius: 8,
      border: '1px solid var(--border)', background: '#fff', fontFamily: 'inherit',
      fontSize: 13, color: 'var(--text-1)', outline: 'none', transition: 'border-color 0.15s',
    }}
      onFocus={e => e.target.style.borderColor = 'var(--green-600)'}
      onBlur={e => e.target.style.borderColor = 'var(--border)'}
    />
  </div>
)

// ── Table ─────────────────────────────────────────────────────────────────────
export const Table = ({ columns, rows, onRowClick, emptyMessage = 'Sin resultados' }) => {
  const [hovRow, setHovRow] = useState(null)
  if (!rows.length) return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      <Icon name="info" size={24} color="var(--border)" />
      <p style={{ marginTop: 12 }}>{emptyMessage}</p>
    </div>
  )
  return (
    <div className="table-wrap">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {columns.map((col, i) => (
              <th key={i} style={{
                padding: '9px 14px', textAlign: col.align || 'left',
                fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                letterSpacing: 0.4, color: 'var(--text-3)', whiteSpace: 'nowrap',
                background: 'oklch(0.985 0.004 155)',
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} onMouseEnter={() => setHovRow(ri)} onMouseLeave={() => setHovRow(null)}
              onClick={() => onRowClick && onRowClick(row)}
              style={{
                borderBottom: '1px solid var(--border)',
                background: hovRow === ri ? 'var(--green-50)' : (ri % 2 === 0 ? '#fff' : 'oklch(0.99 0.002 220)'),
                cursor: onRowClick ? 'pointer' : 'default', transition: 'background 0.1s',
              }}>
              {columns.map((col, ci) => (
                <td key={ci} style={{ padding: '9px 14px', verticalAlign: 'middle', textAlign: col.align || 'left', whiteSpace: col.wrap ? 'normal' : 'nowrap' }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
export const Tabs = ({ tabs, active, onChange }) => (
  <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{
        padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
        background: 'none', border: 'none', borderBottom: `2px solid ${active === t.id ? 'var(--green-600)' : 'transparent'}`,
        color: active === t.id ? 'var(--green-700)' : 'var(--text-3)',
        marginBottom: -2, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {t.label}
        {t.count !== undefined && <Badge tone={active === t.id ? 'neutral' : 'gray'}>{t.count}</Badge>}
      </button>
    ))}
  </div>
)

// ── StatusDot ─────────────────────────────────────────────────────────────────
export const StatusDot = ({ status }) => {
  const map = {
    'Activa': { color: 'var(--green-600)', label: 'Activa' },
    'Cerrada': { color: 'var(--text-3)', label: 'Cerrada' },
    'No pagada': { color: 'var(--red)', label: 'No pagada' },
    'Pagada': { color: 'var(--green-600)', label: 'Pagada' },
    'Pendiente entrega': { color: 'var(--amber)', label: 'Pend. entrega' },
    'Entregada': { color: 'var(--green-600)', label: 'Entregada' },
    'Vencida': { color: 'var(--red)', label: 'Vencida' },
    'Al día': { color: 'var(--green-600)', label: 'Al día' },
  }
  const s = map[status] || { color: 'var(--text-3)', label: status }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0, display: 'inline-block' }} />
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{s.label}</span>
    </span>
  )
}
