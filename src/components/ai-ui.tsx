"use client";
export function Sparkle({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" />
    </svg>
  );
}

export function AiButton({ onClick, busy, children, className = "", disabled }: { onClick: () => void; busy?: boolean; children: React.ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`btn border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 text-violet-700 hover:from-violet-100 hover:to-fuchsia-100 ${className}`}
    >
      <Sparkle className={`size-4 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Thinking…" : children}
    </button>
  );
}

export function AiError({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{msg}</p>;
}
