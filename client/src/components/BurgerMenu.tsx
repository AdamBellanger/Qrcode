import { useEffect, useRef, useState } from "react";

interface LinkItem {
  label: string;
  desc: string;
  href: string;
}

// 👉 ADAPTE CES LIENS selon le site (chaque site pointe vers les deux autres).
const LINKS: LinkItem[] = [
  { label: "OpenWhisper", desc: "Transcription audio", href: "https://whisper.adambellanger.pro" },
  { label: "adambellanger.pro", desc: "Mon portfolio", href: "https://adambellanger.pro" },
  { label: "Github", desc: "Mon github", href: "https://github.com/AdamBellanger" },
];

export default function BurgerMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="burger" ref={ref}>
      <button
        type="button"
        className={`burger__btn glass ${open ? "is-open" : ""}`}
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="burger__lines">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open && (
        <nav className="burger__menu glass" role="menu">
          {LINKS.map((link) => (
            <a
              key={link.href}
              className="burger__link"
              href={link.href}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
            >
              <span className="burger__link-label">{link.label}</span>
              <span className="burger__link-desc">{link.desc}</span>
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
