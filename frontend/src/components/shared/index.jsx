import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../store/auth'

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
  bookOpen:     <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
  helpCircle:   <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
  history:      <><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></>,
  plusCircle:   <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
  users:        <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  check:        <polyline points="20,6 9,17 4,12"/>,
  x:            <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  eye:          <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
  edit:         <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  trash:        <><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  download:     <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  upload:       <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
  filter:       <><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3"/></>,
  send:         <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9 22,2"/></>,
  messageSquare:<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
  trendingUp:   <><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></>,
  trendingDown: <><polyline points="23,18 13.5,8.5 8.5,13.5 1,6"/><polyline points="17,18 23,18 23,12"/></>,
  minus:        <line x1="5" y1="12" x2="19" y2="12"/>,
  plus:         <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
  maximize:     <><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>,
  minimize:     <><polyline points="4,14 10,14 10,20"/><polyline points="20,10 14,10 14,4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></>,
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
  mail:         <><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
  briefcase:    <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
  lock:         <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  checkCircle:  <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></>,
  xCircle:      <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
  list:         <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
  trash2:       <><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  ship:         <><path d="M2 20a2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1"/><path d="M4 18 3 12h18l-1 6"/><path d="M6 12V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><line x1="12" y1="2" x2="12" y2="6"/></>,
  plane:        <><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></>,
  container:    <><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/><path d="M7 4v16"/><path d="M17 4v16"/></>,
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
export const KpiCard = ({ label, value, sublabel, icon, tone = 'neutral', onClick, trend, trendTone, active }) => {
  const tones = {
    neutral: { accent: 'var(--green-600)', badge: 'var(--green-50)', bg: '#f8fafc', activeBg: '#e2e8f0' },
    amber:   { accent: '#d97706',           badge: '#fef3c7',           bg: '#fffdf5', activeBg: '#fef3c7' },
    red:     { accent: '#dc2626',           badge: '#fee2e2',           bg: '#fff5f5', activeBg: '#fee2e2' },
    blue:    { accent: '#0284c7',           badge: '#e0f2fe',           bg: '#f0f9ff', activeBg: '#e0f2fe' },
    green:   { accent: '#16a34a',           badge: '#dcfce7',           bg: '#f0fdf4', activeBg: '#dcfce7' },
    purple:  { accent: '#7c3aed',           badge: '#ede9fe',           bg: '#faf5ff', activeBg: '#ede9fe' },
  }
  const t = tones[tone] || tones.neutral
  const [hov, setHov] = useState(false)
  const isPositiveGood = trendTone !== 'red-good'
  const trendColor = (trend >= 0)
    ? (isPositiveGood ? 'var(--green-600)' : 'var(--red)')
    : (isPositiveGood ? 'var(--red)' : 'var(--green-600)')
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      background: active ? t.activeBg : (hov ? '#fff' : t.bg),
      borderRadius: 10,
      padding: '12px 34px 12px 14px',
      boxShadow: active ? `0 0 0 2px ${t.accent}, var(--shadow-md)` : (hov ? '0 6px 18px oklch(0 0 0 / 0.10)' : 'var(--shadow-sm)'),
      border: `1px solid ${active || hov ? t.accent : 'var(--border)'}`,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.18s', position: 'relative', overflow: 'hidden',
      flex: '1 1 0', minWidth: 0,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: t.accent, borderRadius: '10px 0 0 10px' }} />

      {trend !== undefined && (
        <div style={{ position: 'absolute', top: 8, right: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: trendColor, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Icon name={trend >= 0 ? 'trendingUp' : 'trendingDown'} size={12} color={trendColor} />
            {Math.abs(trend)}%
          </span>
        </div>
      )}

      {/* Number Value (+15% = 22px) */}
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: -0.5, lineHeight: 1.1 }}>
        {typeof value === 'number' ? value.toLocaleString('es-CL') : value}
      </div>

      {/* Title (+30% = 14px) */}
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>

      {/* Sublabel */}
      {sublabel && (
        <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sublabel}
        </div>
      )}

      {/* Icon in Bottom-Right Corner */}
      <div style={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        width: 26,
        height: 26,
        borderRadius: 7,
        background: t.badge,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}>
        <Icon name={icon} size={14} color={t.accent} />
      </div>
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
// `action` (singular) se acepta ademas de `actions`: algunas paginas lo pasan
// asi por error y silenciosamente se perdia sin dar ninguna señal.
export const PageHeader = ({ title, subtitle, breadcrumb, actions, action }) => (
  <div style={{ marginBottom: 16 }}>
    {breadcrumb?.length > 0 && (
      <nav aria-label="Miga de pan" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
        {breadcrumb.map((crumb, index) => (
          <span key={crumb + index} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {index > 0 && <Icon name="chevronRight" size={11} />}
            {crumb}
          </span>
        ))}
      </nav>
    )}
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: -0.5 }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>{subtitle}</p>}
      </div>
      {(actions || action) && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions || action}</div>}
    </div>
  </div>
)

// ── Btn ───────────────────────────────────────────────────────────────────────
export const Btn = ({ children, variant = 'primary', size = 'md', icon, onClick, disabled, type = 'button', style }) => {
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
    <button type={type} disabled={disabled} onClick={disabled ? undefined : onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ ...base, ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={14} />}{children}
    </button>
  )
}

// ── SearchBar ─────────────────────────────────────────────────────────────────
export const SearchBar = ({ placeholder, value, onChange, style }) => (
  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box', ...style }}>
    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
      <Icon name="search" size={14} />
    </span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || 'Buscar…'} style={{
      width: '100%', height: '100%', padding: '0 12px 0 30px', borderRadius: 6,
      border: '1px solid var(--border)', background: '#fff', fontFamily: 'inherit',
      fontSize: 12, color: 'var(--text-1)', outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box',
    }}
      onFocus={e => e.target.style.borderColor = 'var(--green-600)'}
      onBlur={e => e.target.style.borderColor = 'var(--border)'}
    />
  </div>
)

// ── FilterSelect ──────────────────────────────────────────────────────────────
export const FilterSelect = ({ value, onChange, options, placeholder, active, minMenuWidth = 260, maxWidth, style }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const isDefault = value === '' || value === 'all'
  const selectedOption = !isDefault ? options.find(o => String(typeof o === 'string' ? o : o.value) === String(value)) : null
  const displayLabel = selectedOption
    ? (typeof selectedOption === 'string' ? selectedOption : selectedOption.label)
    : (placeholder || (typeof options[0] === 'string' ? options[0] : options[0]?.label) || 'Seleccionar')

  const isFilterActive = active != null ? active : !isDefault

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', ...style }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          height: 28,
          padding: '0 8px 0 10px',
          borderRadius: 6,
          border: isFilterActive ? '1px solid var(--green-600, #16a34a)' : '1px solid var(--border)',
          background: isFilterActive ? 'var(--green-50, #f0fdf4)' : '#fff',
          color: isFilterActive ? 'var(--green-800, #166534)' : 'var(--text-2)',
          fontWeight: isFilterActive ? 700 : 500,
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          maxWidth: maxWidth || 'none',
          boxSizing: 'border-box',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s ease',
        }}
        title={displayLabel}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: maxWidth ? 'hidden' : 'visible', textOverflow: maxWidth ? 'ellipsis' : 'clip' }}>
          {displayLabel}
        </span>
        <Icon name="chevronDown" size={12} style={{ flexShrink: 0, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: minMenuWidth,
            maxWidth: 380,
            maxHeight: 320,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 12px 30px oklch(0 0 0 / 0.16)',
            zIndex: 999,
            padding: 4,
          }}
        >
          {options.map((opt) => {
            const val = typeof opt === 'string' ? opt : opt.value
            const lbl = typeof opt === 'string' ? opt : opt.label
            const isSelected = String(value) === String(val)
            return (
              <div
                key={String(val)}
                onClick={() => {
                  onChange(val)
                  setOpen(false)
                }}
                style={{
                  padding: '7px 10px',
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? 'var(--green-800, #166534)' : 'var(--text-1)',
                  background: isSelected ? 'var(--green-50, #f0fdf4)' : 'transparent',
                  borderRadius: 5,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--bg, #f8fafc)'
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span>{lbl}</span>
                {isSelected && <Icon name="check" size={13} style={{ color: 'var(--green-600)' }} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────
const TABLE_ZOOM_KEY = 'plastimar.tableZoom'
const TABLE_ZOOM_MIN = 0.8
const TABLE_ZOOM_MAX = 1.25
const TABLE_ZOOM_STEP = 0.05

const clampTableZoom = value => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(TABLE_ZOOM_MAX, Math.max(TABLE_ZOOM_MIN, Math.round(parsed / TABLE_ZOOM_STEP) * TABLE_ZOOM_STEP))
}

const readTableZoom = () => {
  if (typeof window === 'undefined') return 1
  try {
    return clampTableZoom(window.localStorage?.getItem(TABLE_ZOOM_KEY) ?? 1)
  } catch {
    return 1
  }
}

const saveTableZoom = value => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.setItem(TABLE_ZOOM_KEY, String(value))
  } catch {
    // Non-critical preference; keep the table usable if storage is blocked.
  }
}

const getColumnBaseWidth = col => {
  const explicit = col.width ?? col.maxWidth ?? col.minWidth
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return Math.max(56, explicit)
  if (typeof explicit === 'string') {
    const trimmed = explicit.trim()
    const px = Number.parseFloat(trimmed)
    if (trimmed.endsWith('px') && Number.isFinite(px)) return Math.max(56, px)
  }

  const signature = `${col.key || ''} ${col.label || ''}`.toLowerCase()
  if (!col.label || /_acc|_edit|accion|acciones/.test(signature)) return 118
  if (/foto|imagen|image|img/.test(signature)) return 68
  if (/web|id|cod|codigo|rut|doc|fecha|estado|stock|desc|precio|costo|valor|monto|total|folio|nro|numero|unidad|unid/.test(signature)) return 124
  if (/email|correo|direccion|referencia|descripcion|observacion|detalle|producto|nombre|cliente|proveedor|organismo|material|trabajador|contacto|razon|sucursal/.test(signature)) return 220
  return 150
}

const getCellTitle = (col, value, row, rendered) => {
  if (typeof col.title === 'function') return col.title(value, row) || undefined
  if (col.title) return String(col.title)
  if (value != null && typeof value !== 'object') return String(value)
  if (value?.nombre) return String(value.nombre)
  if (value?.razonSocial) return String(value.razonSocial)
  if (typeof rendered === 'string' || typeof rendered === 'number' || typeof rendered === 'boolean') return String(rendered)
  return undefined
}

const getColumnPrefsKey = (key, user) => {
  const userKey = user?.id || user?.email || user?.nombre || user?.role || 'anon'
  return `plastimar.table.columns.${userKey}.${key}`
}

const readColumnPrefs = (key, user, columns) => {
  if (!key || typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(getColumnPrefsKey(key, user)) || 'null')
    if (!Array.isArray(parsed)) return null
    const allowed = new Set(columns.map(col => col.key))
    return parsed.filter(colKey => allowed.has(colKey))
  } catch {
    return null
  }
}

const saveColumnPrefs = (key, user, selected) => {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getColumnPrefsKey(key, user), JSON.stringify(selected))
  } catch {
    // User preference only. If local storage is blocked, keep the table usable.
  }
}

function TableColumnSelector({ columns, selected, onChange, onReset, required }) {
  const [open, setOpen] = useState(false)
  const selectedSet = new Set(selected)
  const configurable = columns.filter(col => col.label)

  const toggle = key => {
    if (required.has(key)) return
    const next = selectedSet.has(key)
      ? selected.filter(colKey => colKey !== key)
      : [...selected, key]
    onChange(next)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="table-tool-btn table-column-btn" onClick={() => setOpen(value => !value)} title="Columnas visibles">
        <Icon name="list" size={13} />
        <span>Columnas</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: 320,
          maxWidth: '88vw',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 14px 36px oklch(0 0 0 / 0.16)',
          zIndex: 60,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Columnas visibles</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>La vista queda guardada para este usuario.</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ color: 'var(--text-3)', padding: 4 }}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
            {configurable.map(col => {
              const locked = required.has(col.key)
              return (
                <label key={col.key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 9px',
                  borderRadius: 7,
                  cursor: locked ? 'default' : 'pointer',
                  color: locked ? 'var(--text-3)' : 'var(--text-1)',
                  fontSize: 13,
                }}>
                  <input type="checkbox" checked={selectedSet.has(col.key)} disabled={locked} onChange={() => toggle(col.key)} />
                  <span style={{ flex: 1 }}>{col.label}</span>
                  {locked && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>fija</span>}
                </label>
              )
            })}
          </div>
          <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button type="button" className="table-tool-btn" onClick={onReset}>Restaurar base</button>
            <button type="button" className="table-tool-btn table-column-save" onClick={() => setOpen(false)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export const Table = ({
  columns,
  rows,
  onRowClick,
  onRowDoubleClick,
  emptyMessage = 'Sin resultados',
  keyboard,
  autoFocus,
  stickyHeader,
  ariaLabel = 'Tabla de datos',
  getRowKey,
  columnPrefsKey,
  columnPrefs = true,
  toolbarExtra,
  pager,
  getRowStyle,
}) => {
  const user = useAuthStore(s => s.user)
  const [hovRow, setHovRow] = useState(null)
  const [activeRow, setActiveRow] = useState(0)
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false)
  const [tableZoom, setTableZoomState] = useState(readTableZoom)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const autoColumnPrefs = columnPrefs && columns.length >= 6
  const prefsKey = autoColumnPrefs ? (columnPrefsKey || ariaLabel) : null
  const defaultColumnKeys = columns.filter(col => !col.defaultHidden).map(col => col.key)
  const requiredColumns = new Set(columns.filter(col => col.required || col.key === '_actions' || col.key === '_acc').map(col => col.key))
  const [selectedColumns, setSelectedColumns] = useState(() => readColumnPrefs(prefsKey, user, columns) || defaultColumnKeys)
  const wrapRef = useRef(null)
  const keyboardEnabled = keyboard ?? Boolean(onRowClick || onRowDoubleClick)
  const autoFocusEnabled = autoFocus ?? keyboardEnabled
  const stickyHeaderEnabled = stickyHeader ?? keyboardEnabled
  const clampedActiveRow = Math.min(Math.max(activeRow, 0), Math.max(rows.length - 1, 0))
  const allowedColumnKeys = new Set(columns.map(col => col.key))
  const selectedColumnSet = new Set([...selectedColumns.filter(colKey => allowedColumnKeys.has(colKey)), ...requiredColumns])
  const effectiveColumns = prefsKey ? columns.filter(col => selectedColumnSet.has(col.key)) : columns
  const columnWidths = effectiveColumns.map(col => Math.round(getColumnBaseWidth(col) * tableZoom))
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0)
  const zoomPercent = Math.round(tableZoom * 100)
  const cellPadding = `${Math.max(6, Math.round(9 * tableZoom))}px ${Math.max(8, Math.round(14 * tableZoom))}px`

  const setTableZoom = value => {
    const next = clampTableZoom(value)
    setTableZoomState(next)
    saveTableZoom(next)
  }

  const updateSelectedColumns = next => {
    const clean = columns
      .map(col => col.key)
      .filter(colKey => next.includes(colKey) || requiredColumns.has(colKey))
    setSelectedColumns(clean)
    saveColumnPrefs(prefsKey, user, clean)
  }

  const resetSelectedColumns = () => updateSelectedColumns(defaultColumnKeys)

  useEffect(() => {
    if (!keyboardEnabled || !autoFocusEnabled || !rows.length || !wrapRef.current) return
    const activeElement = document.activeElement
    const canFocusTable = !activeElement || activeElement === document.body || wrapRef.current.contains(activeElement)
    if (canFocusTable) wrapRef.current.focus({ preventScroll: true })
  }, [autoFocusEnabled, keyboardEnabled, rows.length])

  useEffect(() => {
    if (!keyboardEnabled || !wrapRef.current) return
    const row = wrapRef.current.querySelector(`[data-table-row="${clampedActiveRow}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [clampedActiveRow, keyboardEnabled])

  useEffect(() => {
    if (!isFullscreen || typeof document === 'undefined') return undefined
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = event => {
      if (event.key === 'Escape') setIsFullscreen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  const isInteractiveTarget = target => target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="button"]')
  const runRowAction = event => {
    const row = rows[clampedActiveRow]
    if (!row) return
    const action = (event.ctrlKey || event.metaKey) ? (onRowDoubleClick || onRowClick) : (onRowClick || onRowDoubleClick)
    if (action) action(row)
  }
  const handleKeyDown = event => {
    if (!keyboardEnabled || isInteractiveTarget(event.target)) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveRow(Math.min(clampedActiveRow + 1, rows.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveRow(Math.max(clampedActiveRow - 1, 0))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      wrapRef.current?.scrollBy({ left: 90, behavior: 'smooth' })
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      wrapRef.current?.scrollBy({ left: -90, behavior: 'smooth' })
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveRow(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveRow(rows.length - 1)
    } else if (event.key === 'PageDown') {
      event.preventDefault()
      setActiveRow(Math.min(clampedActiveRow + 10, rows.length - 1))
    } else if (event.key === 'PageUp') {
      event.preventDefault()
      setActiveRow(Math.max(clampedActiveRow - 10, 0))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      runRowAction(event)
    } else if (event.key === 'Escape') {
      wrapRef.current?.blur()
    }
  }

  return (
    <div className={`table-shell${isFullscreen ? ' table-shell-fullscreen' : ''}`}>
      <div className="table-tools" aria-label="Controles de tabla">
        {toolbarExtra && <div className="table-tools-extra">{toolbarExtra}</div>}
        {pager && pager.pages > 1 && (
          <div className="table-tools-pager" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
            <button
              type="button"
              className="table-tool-btn"
              title="Página anterior"
              aria-label="Página anterior"
              disabled={pager.disabled || pager.page <= 1}
              onClick={() => pager.onChange(Math.max(1, pager.page - 1))}
            >
              <Icon name="chevronLeft" size={13} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>{pager.page} / {pager.pages}</span>
            <button
              type="button"
              className="table-tool-btn"
              title="Página siguiente"
              aria-label="Página siguiente"
              disabled={pager.disabled || pager.page >= pager.pages}
              onClick={() => pager.onChange(Math.min(pager.pages, pager.page + 1))}
            >
              <Icon name="chevronRight" size={13} />
            </button>
          </div>
        )}
        {prefsKey && (
          <TableColumnSelector
            columns={columns}
            selected={[...selectedColumnSet]}
            onChange={updateSelectedColumns}
            onReset={resetSelectedColumns}
            required={requiredColumns}
          />
        )}
        <span className="table-tools-label">Zoom</span>
        <button
          type="button"
          className="table-zoom-btn"
          title="Reducir zoom"
          aria-label="Reducir zoom de tabla"
          disabled={tableZoom <= TABLE_ZOOM_MIN}
          onClick={() => setTableZoom(tableZoom - TABLE_ZOOM_STEP)}
        >
          <Icon name="minus" size={13} />
        </button>
        <button
          type="button"
          className="table-zoom-btn"
          title="Aumentar zoom"
          aria-label="Aumentar zoom de tabla"
          disabled={tableZoom >= TABLE_ZOOM_MAX}
          onClick={() => setTableZoom(tableZoom + TABLE_ZOOM_STEP)}
        >
          <Icon name="plus" size={13} />
        </button>
        <span className="table-zoom-value">{zoomPercent}%</span>
        <button
          type="button"
          className="table-zoom-btn"
          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Ver tabla en pantalla completa'}
          onClick={() => setIsFullscreen(value => !value)}
        >
          <Icon name={isFullscreen ? 'minimize' : 'maximize'} size={13} />
        </button>
      </div>
      {!rows.length ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <Icon name="info" size={24} color="var(--border)" />
          <p style={{ marginTop: 12 }}>{emptyMessage}</p>
        </div>
      ) : (
        <div
        ref={wrapRef}
        className={`table-wrap${stickyHeaderEnabled ? ' table-wrap-sticky' : ''}${keyboardEnabled ? ' table-wrap-keyboard' : ''}`}
        tabIndex={keyboardEnabled ? 0 : undefined}
        role={keyboardEnabled ? 'region' : undefined}
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        onFocus={() => setHasKeyboardFocus(true)}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHasKeyboardFocus(false)
        }}
        onMouseDown={event => {
          if (keyboardEnabled && !isInteractiveTarget(event.target)) {
            wrapRef.current?.focus({ preventScroll: true })
          }
        }}
      >
      <table className="data-table" style={{ width: tableWidth, minWidth: '100%', borderCollapse: 'collapse', fontSize: 12.5 * tableZoom }}>
        <colgroup>
          {columnWidths.map((width, i) => <col key={i} style={{ width }} />)}
        </colgroup>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            {effectiveColumns.map((col, i) => (
              <th key={i} title={col.label} style={{
                padding: cellPadding, textAlign: col.align || 'left',
                fontWeight: 600, fontSize: Math.max(10, 11 * tableZoom), textTransform: 'uppercase',
                letterSpacing: 0, color: 'var(--text-3)', whiteSpace: 'nowrap',
                background: 'oklch(0.985 0.004 155)', position: stickyHeaderEnabled ? 'sticky' : undefined,
                top: stickyHeaderEnabled ? 0 : undefined, zIndex: stickyHeaderEnabled ? 2 : undefined,
              }}><span className="table-cell-clip">{col.label}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={getRowKey ? getRowKey(row, ri) : ri} data-table-row={ri} onMouseEnter={() => setHovRow(ri)} onMouseLeave={() => setHovRow(null)}
              onClick={event => {
                setActiveRow(ri)
                if (!isInteractiveTarget(event.target)) onRowClick?.(row)
              }}
              onDoubleClick={event => {
                if (!isInteractiveTarget(event.target)) onRowDoubleClick?.(row)
              }}
              style={{
                borderBottom: '1px solid var(--border)',
                background: clampedActiveRow === ri && keyboardEnabled && hasKeyboardFocus ? 'oklch(0.94 0.04 150)' : hovRow === ri ? 'var(--green-50)' : (ri % 2 === 0 ? '#fff' : 'oklch(0.99 0.002 220)'),
                cursor: (onRowClick || onRowDoubleClick) ? 'pointer' : 'default', transition: 'background 0.1s',
                outline: clampedActiveRow === ri && keyboardEnabled && hasKeyboardFocus ? '1px solid var(--green-600)' : 'none',
                outlineOffset: -1,
                ...getRowStyle?.(row, ri),
              }}>
              {effectiveColumns.map((col, ci) => {
                const rawValue = row[col.key]
                const title = getCellTitle(col, rawValue, row)
                return (
                  <td key={ci} title={title} style={{
                    padding: cellPadding,
                    verticalAlign: 'middle',
                    textAlign: col.align || 'left',
                    whiteSpace: col.wrap ? 'normal' : 'nowrap',
                    overflow: 'hidden',
                    textOverflow: col.wrap ? undefined : 'ellipsis',
                    overflowWrap: col.wrap ? 'anywhere' : undefined,
                  }}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      )}
    </div>
  )
}

// Pager
export const Pager = ({ page = 1, pages = 1, total = 0, limit = 0, shown = 0, onChange, disabled = false }) => {
  const safePage = Math.max(1, Number(page) || 1)
  const safePages = Math.max(1, Number(pages) || 1)
  const from = total > 0 && shown > 0 ? ((safePage - 1) * limit) + 1 : 0
  const to = total > 0 && shown > 0 ? Math.min(total, ((safePage - 1) * limit) + shown) : 0
  const prevDisabled = disabled || safePage <= 1
  const nextDisabled = disabled || safePage >= safePages
  const btn = isDisabled => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 10px',
    borderRadius: 7,
    border: '1px solid var(--border)',
    background: isDisabled ? 'oklch(0.97 0.002 220)' : '#fff',
    color: isDisabled ? 'var(--text-3)' : 'var(--text-2)',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    fontWeight: 500,
  })

  if (safePages <= 1 && total <= limit) return null

  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#fff' }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {total > 0 ? (
          <>Mostrando {from.toLocaleString('es-CL')}-{to.toLocaleString('es-CL')} de {total.toLocaleString('es-CL')}</>
        ) : (
          <>Sin registros</>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button disabled={prevDisabled} onClick={() => onChange?.(safePage - 1)} style={btn(prevDisabled)}>
          <Icon name="chevronLeft" size={13} /> Anterior
        </button>
        <span style={{ minWidth: 74, textAlign: 'center', fontSize: 12, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>
          {safePage} / {safePages}
        </span>
        <button disabled={nextDisabled} onClick={() => onChange?.(safePage + 1)} style={btn(nextDisabled)}>
          Siguiente <Icon name="chevronRight" size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
export const Tabs = ({ tabs, active, onChange, style }) => (
  <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid var(--border)', marginBottom: 20, ...style }}>
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
