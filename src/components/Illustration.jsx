// Empty-state illustration in the reference's line-and-flat style:
// a reviewer's desk with a manuscript, a checklist and a gold seal.
export function DeskIllustration({ width = 300 }) {
  return (
    <svg width={width} viewBox="0 0 300 200" role="img" aria-label="Meja pemeriksa dengan naskah dan checklist">
      <rect x="18" y="14" width="264" height="150" rx="6" fill="#F4F6FB" />
      <g fill="none" stroke="#C3C9DA" strokeWidth="1.2">
        <path d="M40 40c6-6 12-6 18 0s12 6 18 0 12-6 18 0" />
        <path d="M200 36c6-6 12-6 18 0s12 6 18 0" />
      </g>
      <rect x="40" y="60" width="26" height="86" rx="3" fill="#FFFFFF" stroke="#C3C9DA" />
      <g stroke="#C3C9DA" strokeWidth="1.2">
        <path d="M47 72v10M53 72v10M59 72v10M47 92v10M53 92v10M59 92v10" />
      </g>
      <circle cx="252" cy="116" r="16" fill="#E6C77F" />
      <path d="M244 116l5 5 10-11" fill="none" stroke="#1B2142" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="40" y="146" width="220" height="6" rx="2" fill="#2846C8" />
      <path d="M60 152l-10 40M240 152l10 40" stroke="#141B34" strokeWidth="1.4" />
      <g transform="translate(96 66) rotate(-6)">
        <rect width="78" height="96" rx="4" fill="#FFFFFF" stroke="#141B34" strokeWidth="1.4" />
        <path d="M12 18h40M12 28h54M12 38h48M12 48h54M12 58h30" stroke="#B4B9C9" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g transform="translate(158 74) rotate(5)">
        <rect width="70" height="80" rx="4" fill="#FFFFFF" stroke="#141B34" strokeWidth="1.4" />
        <circle cx="14" cy="18" r="5" fill="#1D8656" />
        <circle cx="14" cy="36" r="5" fill="#1D8656" />
        <circle cx="14" cy="54" r="5" fill="none" stroke="#B4B9C9" strokeWidth="1.6" />
        <path d="M26 18h32M26 36h28M26 54h32" stroke="#B4B9C9" strokeWidth="2" strokeLinecap="round" />
      </g>
      <path d="M150 140l26-30" stroke="#E6C77F" strokeWidth="5" strokeLinecap="round" />
      <path d="M150 140l3-6" stroke="#141B34" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
