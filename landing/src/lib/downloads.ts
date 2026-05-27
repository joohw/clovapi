const DESKTOP_DOWNLOAD_BASE = "https://downloads.clovapi.com/desktop/latest";

export type DesktopDownloadUrls = {
  mac: string;
  windows: string;
};

export function getDesktopDownloadUrls(): DesktopDownloadUrls {
  return {
    mac: `${DESKTOP_DOWNLOAD_BASE}/clovapi-desktop-darwin-universal.dmg`,
    windows: `${DESKTOP_DOWNLOAD_BASE}/clovapi-desktop-windows-x64.exe`,
  };
}
