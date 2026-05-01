import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export interface NavItem {
  name: string;
  path?: string;
  children?: { name: string; path: string }[];
}

interface NavDropdownProps {
  item: NavItem;
  className?: string;
  style?: React.CSSProperties;
  dropdownBg?: string;
  dropdownBorder?: string;
  dropdownTextColor?: string;
  dropdownHoverBg?: string;
  glass?: boolean;
}

export function NavDropdown({ item, className, style, dropdownBg, dropdownBorder, dropdownTextColor, dropdownHoverBg, glass }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLDivElement>(null);

  function handleEnter() {
    clearTimeout(timeout.current);
    setOpen(true);
  }

  function handleLeave() {
    timeout.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => {
    return () => clearTimeout(timeout.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        className={className}
        style={style}
        onClick={() => setOpen(!open)}
        type="button"
      >
        {item.name}
        <ChevronDown
          className={`inline-block w-3.5 h-3.5 ml-0.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && item.children && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 min-w-[160px] rounded-lg shadow-lg py-1 z-50"
          style={{
            background: dropdownBg || "rgba(26,43,60,0.97)",
            border: `1px solid ${dropdownBorder || "rgba(255,255,255,0.12)"}`,
            ...(glass ? {
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            } : {}),
          }}
        >
          {item.children.map((child) => (
            <Link
              key={child.path}
              to={child.path}
              className="block px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap"
              style={{ color: dropdownTextColor || "#fff" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = dropdownHoverBg || "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
              onClick={() => setOpen(false)}
            >
              {child.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface MobileNavGroupProps {
  item: NavItem;
  textColor?: string;
  onNavigate: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function MobileNavGroup({ item, textColor, onNavigate, className, style }: MobileNavGroupProps) {
  const [expanded, setExpanded] = useState(false);

  if (!item.children) {
    return (
      <Link
        to={item.path!}
        className={className}
        style={style}
        onClick={onNavigate}
      >
        {item.name}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left flex items-center justify-between ${className || ""}`}
        style={style}
        type="button"
      >
        <span>{item.name}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          style={{ color: textColor }}
        />
      </button>
      {expanded && (
        <div className="pl-4">
          {item.children.map((child) => (
            <Link
              key={child.path}
              to={child.path}
              className={className}
              style={{ ...style, opacity: 0.85 }}
              onClick={onNavigate}
            >
              {child.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
