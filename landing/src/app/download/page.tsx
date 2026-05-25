import type { Metadata } from "next";
import { DownloadPageContent } from "@/components/download/download-page-content";

export const metadata: Metadata = {
  title: "Download clovapi",
  description: "Download clovapi CLI install script and desktop builds from the official R2 mirror.",
};

export default function DownloadPage() {
  return <DownloadPageContent />;
}
