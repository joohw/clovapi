import { UserGate } from "@/components/auth-gates";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <UserGate>{children}</UserGate>;
}
