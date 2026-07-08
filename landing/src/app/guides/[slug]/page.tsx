import { redirect } from "next/navigation";
import { GUIDE_SLUGS } from "@/lib/guides-data";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return GUIDE_SLUGS.map((slug) => ({ slug }));
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  redirect(`/blog/${slug}`);
}
