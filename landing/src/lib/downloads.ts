const DEFAULT_DESKTOP_BASE = "https://downloads.clovapi.com/desktop/latest";

export type DesktopDownloadUrls = {
  mac: string;
  windows: string;
};

export function getDesktopDownloadUrls(): DesktopDownloadUrls {
  const mac =
    (process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_MAC_URL || "").trim() ||
    `${DEFAULT_DESKTOP_BASE}/clovapi-desktop-darwin-universal.dmg`;
  const windows =
    (process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_WINDOWS_URL || "").trim() ||
    `${DEFAULT_DESKTOP_BASE}/clovapi-desktop-windows-x64.exe`;

  return { mac, windows };
}
