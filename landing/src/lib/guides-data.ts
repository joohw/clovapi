import type { AppLanguage } from "@/i18n/config";

export type GuideStep = { title: string; body: string; command?: string };

export type GuideContent = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  steps: GuideStep[];
  tips: string;
};

export const GUIDE_SLUGS = [] as const;

export type GuideSlug = (typeof GUIDE_SLUGS)[number];

export function getGuideContent(slug: string, language: AppLanguage): GuideContent | undefined {
  void slug;
  void language;
  return undefined;
}
