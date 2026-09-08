"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export function Modal({ open, onClose, children, className = "" }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal-panel ${className}`} role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>{children}</section></div>;
}
