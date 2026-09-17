import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { getMDXComponents } from "../../../../../mdx-components";
import { isAppLanguage } from "@/i18n/config";
import { docsSource } from "@/lib/docs-source";
import { hreflangUrl } from "@/lib/seo-data";
import { PUBLIC_SITE_URL } from "@/lib/site";

type DocsPageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

const MIN_TOC_ITEMS = 5;

export function generateStaticParams() {
  return docsSource.generateParams("slug", "locale");
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isAppLanguage(locale)) return {};

  const page = docsSource.getPage(slug, locale);
  if (!page) return {};

  const pathname = `/docs${slug?.length ? `/${slug.join("/")}` : ""}`;
  return {
    title: `${page.data.title} · clovapi`,
    description: page.data.description,
    alternates: {
      canonical: hreflangUrl(PUBLIC_SITE_URL, pathname, locale),
      languages: {
        "zh-CN": hreflangUrl(PUBLIC_SITE_URL, pathname, "zh-CN"),
        en: hreflangUrl(PUBLIC_SITE_URL, pathname, "en"),
        "x-default": hreflangUrl(PUBLIC_SITE_URL, pathname, "zh-CN"),
      },
    },
  };
}

export default async function Page({ params }: DocsPageProps) {
  const { locale, slug } = await params;
  if (!isAppLanguage(locale)) notFound();

  const page = docsSource.getPage(slug, locale);
  if (!page) notFound();

  const MDXContent = page.data.body;
  const showTableOfContents = page.data.toc.length >= MIN_TOC_ITEMS;
  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{ enabled: showTableOfContents }}
      tableOfContentPopover={{ enabled: showTableOfContents }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDXContent components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}
