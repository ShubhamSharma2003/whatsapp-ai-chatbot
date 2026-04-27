"use client";

function hashIndex(seed: string, modulo: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (Math.abs(h) % modulo) + 1;
}

export function Avatar({
  seed,
  initials,
  size = 40,
  ring = false,
  className = "",
}: {
  seed: string;
  initials: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const idx = hashIndex(seed, 8);
  return (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold tracking-wider avatar-grad-${idx} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.32)),
        boxShadow: ring
          ? "0 0 0 2px var(--paper), 0 0 0 4px var(--accent)"
          : "0 1px 2px rgba(14, 20, 16, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.08)",
      }}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}
