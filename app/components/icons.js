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

export function IconTrash({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M3.5 6h17" />
      <path d="M8.5 6V4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V6" />
      <path d="M18.5 6v13a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V6" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

export function IconMail({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3.2 7.2 8.8 6 8.8-6" />
    </svg>
  );
}

export function IconPhone({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1z" />
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

export function IconReply({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M9 17H7a4 4 0 0 1-4-4 4 4 0 0 1 4-4h11" />
      <path d="m15 5 4 4-4 4" />
    </svg>
  );
}

export function IconThumb({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
      <path d="M7 11l4.2-7.3a1.5 1.5 0 0 1 2.8.7V8h4.6a2 2 0 0 1 2 2.3l-1.1 7A2 2 0 0 1 19.5 19H7" />
    </svg>
  );
}

export function IconThumbDown({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <g transform="rotate(180 12 12)">
        <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" />
        <path d="M7 11l4.2-7.3a1.5 1.5 0 0 1 2.8.7V8h4.6a2 2 0 0 1 2 2.3l-1.1 7A2 2 0 0 1 19.5 19H7" />
      </g>
    </svg>
  );
}

export function IconMeh({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 15h7" />
      <path d="M9 9.5h.01" />
      <path d="M15 9.5h.01" />
    </svg>
  );
}

export function IconLink({ className = "" }) {
  return (
    <svg {...baseProps} className={className}>
      <path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 1 0-7.07-7.07l-1.15 1.14" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 1 0 7.07 7.07l1.14-1.14" />
    </svg>
  );
}

// Brand/solid glyphs render with a fill rather than the shared stroke props.
function brandProps(className) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": "true",
    focusable: "false",
    className
  };
}

export function IconPlay({ className = "" }) {
  return (
    <svg {...brandProps(className)}>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z" />
    </svg>
  );
}

export function IconFacebook({ className = "" }) {
  return (
    <svg {...brandProps(className)}>
      <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.7c0-.9.26-1.55 1.57-1.55H17V4.27A21 21 0 0 0 14.55 4C12.1 4 10.5 5.5 10.5 8.25v2.55H7.8V14h2.7v8z" />
    </svg>
  );
}

export function IconXLogo({ className = "" }) {
  return (
    <svg {...brandProps(className)}>
      <path d="M17.53 3h2.97l-6.49 7.42L21.75 21h-5.97l-4.68-6.12L5.74 21H2.77l6.94-7.93L2.25 3h6.13l4.23 5.6zm-1.04 16.2h1.64L7.6 4.7H5.84z" />
    </svg>
  );
}

export function IconWhatsApp({ className = "" }) {
  return (
    <svg {...brandProps(className)}>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.49 14.95L2 22l5.2-1.5A9.9 9.9 0 1 0 12.04 2zm0 1.8a8.1 8.1 0 0 1 6.86 12.42c-.31.5-.43.96-.36 1.36l-3.31-.95-.43.25a8.1 8.1 0 1 1-2.76-15.78zm4.66 11.4c-.25-.13-1.48-.73-1.71-.81-.23-.09-.4-.13-.56.12-.17.25-.65.81-.79.97-.15.17-.29.19-.54.06-.25-.12-1.06-.39-2.02-1.24-.74-.66-1.25-1.48-1.39-1.73-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.42l-.48-.01c-.17 0-.44.06-.67.31s-.88.86-.88 2.1.9 2.43 1.03 2.6c.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29z" />
    </svg>
  );
}
