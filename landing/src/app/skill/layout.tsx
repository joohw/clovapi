import type { ReactNode } from "react";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return buildPageMetadata("skill");
}

export default function SkillLayout({ children }: { children: ReactNode }) {
  return children;
}
