import { permanentRedirect } from "next/navigation";

export default function LegacyBlogPage() {
  permanentRedirect("/zh-CN/blog");
}
