"use client";

export function UserGate({ children }: { children: React.ReactNode }) {
  // Auth has been removed from the frontend-only build.
  return <>{children}</>;
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  // Auth has been removed from the frontend-only build.
  return <>{children}</>;
}
