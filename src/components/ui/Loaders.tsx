"use client";

export function Orbit({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls = size === "sm" ? "orbit orbit-sm" : size === "lg" ? "orbit orbit-lg" : "orbit";
  return <span className={cls} aria-label="Loading" role="status" />;
}

export function Dots({ className = "" }: { className?: string }) {
  return (
    <span className={`dots ${className}`} aria-label="Loading" role="status">
      <span /><span /><span />
    </span>
  );
}

export function Bars({ className = "" }: { className?: string }) {
  return (
    <span className={`bars ${className}`} aria-label="Loading" role="status">
      <span /><span /><span /><span /><span />
    </span>
  );
}

export function StripeProgress({ className = "" }: { className?: string }) {
  return <div className={`stripe-progress ${className}`} role="progressbar" aria-label="Loading" />;
}

export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
}) {
  return (
    <span
      className={`skeleton block ${className}`}
      style={{ width, height }}
      aria-hidden
    />
  );
}

/** Full-screen splash for initial loads */
export function PageSplash({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-paper mesh-canvas">
      <div className="flex flex-col items-center gap-5">
        <Orbit size="lg" />
        <p className="eyebrow text-[10px] text-muted">{label}</p>
      </div>
    </div>
  );
}
