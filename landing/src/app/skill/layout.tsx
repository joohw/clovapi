import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata("skill");
}

export default function SkillLayout({ children }: { children: React.ReactNode }) {
  return children;
}
