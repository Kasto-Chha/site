const baseProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.6",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false"
};

export function IconQuestion({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function IconPen({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

export function IconBook({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 7H20" />
      <path d="M6.5 4.5H20v15H6.5" />
    </svg>
  );
}

export function IconHome({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

export function IconBriefcase({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function IconCheck({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconChat({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-4 3V7a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4z" />
      <path d="M9 10h6" />
      <path d="M9 13h4" />
    </svg>
  );
}

export function IconArrowUp({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M12 19V5" />
      <path d="M7 10l5-5 5 5" />
    </svg>
  );
}

export function IconArrowDown({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M12 5v14" />
      <path d="M7 14l5 5 5-5" />
    </svg>
  );
}
