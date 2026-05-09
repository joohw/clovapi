import { UserGate } from "@/components/auth-gates";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserGate>
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 pt-4 pb-4 sm:px-6 sm:pt-6 sm:pb-6">
        {children}
      </div>
    </UserGate>
  );
}
