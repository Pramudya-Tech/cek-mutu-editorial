const P = {
  plus: 'M10 4v12M4 10h12',
  history: 'M3.5 10a6.5 6.5 0 1 0 2-4.7M3.5 3.5v3h3M10 6.5V10l2.5 1.5',
  book: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5zM4 16.5A1.5 1.5 0 0 0 5.5 18H16v-3',
  pen: 'M3 17h4l9-9-4-4-9 9zM11 5l4 4',
  info: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 9v5M10 6.2v.1',
  download: 'M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12',
  upload: 'M10 13V3M5.5 7.5 10 3l4.5 4.5M4 16.5h12',
  link: 'M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1',
  search: 'M9 15.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM14 14l3.5 3.5',
  chevron: 'M6 8l4 4 4-4',
  updown: 'M7 7.5 10 4.5l3 3M7 12.5l3 3 3-3',
  arrowR: 'M4 10h12M11 5l5 5-5 5',
  arrowL: 'M16 10H4M9 5l-5 5 5 5',
  file: 'M5 2.5h6.5L15 6v11.5H5zM11.5 2.5V6H15',
  check: 'M4.5 10.5 8 14l7.5-8',
  x: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  copy: 'M7 7h9v9H7zM4 13V4h9',
  trash: 'M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11',
  refresh: 'M15.5 7A6 6 0 0 0 4.5 8M4.5 4v4h4M4.5 13a6 6 0 0 0 11-1M15.5 16v-4h-4',
  list: 'M7 5.5h9M7 10h9M7 14.5h9M3.5 5.5h.1M3.5 10h.1M3.5 14.5h.1',
  shield: 'M10 2.5 16 5v5c0 3.6-2.6 6.3-6 7.5-3.4-1.2-6-3.9-6-7.5V5z',
  lock: 'M5.5 9h9v8h-9zM7.5 9V6.5a2.5 2.5 0 0 1 5 0V9',
};

export function Icon({ name, size = 18, stroke = 1.6, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

export function Mark({ size = 34 }) {
  // Brand mark: a manuscript page with a gold check, in royal blue.
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="10" fill="#2846C8" />
      <path d="M10 8h10l4.5 4.5V26H10z" fill="#fff" />
      <path d="M20 8v4.5h4.5" fill="#D8E0FA" />
      <path d="M13.2 18.6l2.8 2.8 5.4-6" fill="none" stroke="#D9B25F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Person icons for each role: the editor holds a pen, the reviewer a
// magnifier, the author a manuscript page.
export function RoleIcon({ role, size = 36 }) {
  const accent = '#D9B25F';
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" role="img" aria-label={`Ikon ${role}`}>
      <rect width="36" height="36" rx="11" fill="#2846C8" />
      <circle cx="15" cy="13" r="5.2" fill="#FFFFFF" />
      <path d="M5.5 29.5c0-5.6 4.3-9.4 9.5-9.4s9.5 3.8 9.5 9.4z" fill="#FFFFFF" />
      {role === 'Editor' && (
        <g>
          <path d="M23.2 27.2l1-4.2 7.4-7.4 3.2 3.2-7.4 7.4z" fill={accent} />
          <path d="M23.2 27.2l1-4.2 3.2 3.2z" fill="#1B2142" />
          <path d="M30.1 17.1l3.2 3.2" stroke="#1B2142" strokeWidth="1.2" />
        </g>
      )}
      {role === 'Reviewer' && (
        <g fill="none" stroke={accent} strokeLinecap="round">
          <circle cx="26.5" cy="20.5" r="4.6" strokeWidth="2.4" fill="#2846C8" />
          <path d="M29.8 23.8l3.6 3.6" strokeWidth="2.8" />
        </g>
      )}
      {role === 'Penulis' && (
        <g>
          <path d="M22 15.5h7.2l3 3v11H22z" fill={accent} />
          <path d="M24.2 21h5.6M24.2 24h5.6M24.2 27h3.6" stroke="#1B2142" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
