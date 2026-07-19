import { permanentRedirect } from "next/navigation";

type LegacyBlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LegacyBlogPostPage({ params }: LegacyBlogPostPageProps) {
  const { slug } = await params;
  permanentRedirect(`/zh-CN/blog/${encodeURIComponent(slug)}`);
}
