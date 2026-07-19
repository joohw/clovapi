import { permanentRedirect } from "next/navigation";

type LegacyGuidePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LegacyGuidePage({ params }: LegacyGuidePageProps) {
  const { slug } = await params;
  permanentRedirect(`/zh-CN/blog/${encodeURIComponent(slug)}`);
}
