import type { ReactNode } from "react";
import { isAppLanguage } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/seo";

type SkillLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SkillLayoutProps) {
  const { locale } = await params;
  if (!isAppLanguage(locale)) return {};
  return buildPageMetadata("skill", locale);
}

export default function SkillLayout({ children }: SkillLayoutProps) {
  return children;
}
