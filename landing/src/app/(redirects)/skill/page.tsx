import { permanentRedirect } from "next/navigation";

export default function LegacySkillPage() {
  permanentRedirect("/zh-CN/skill");
}
