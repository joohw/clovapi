import { permanentRedirect } from "next/navigation";

export default function LegacyGuidesPage() {
  permanentRedirect("/zh-CN/blog");
}
