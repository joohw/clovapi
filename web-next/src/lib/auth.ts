export type UserInfo = {
  id?: number;
  username?: string;
  display_name?: string;
  role?: number | string;
  group?: string;
};

export function getStoredUser(): UserInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("user");
}

export function getUserId(): string {
  const user = getStoredUser();
  return String(user?.id ?? -1);
}

export function isAdminUser(user: UserInfo | null): boolean {
  const role = Number(user?.role ?? -1);
  return Number.isFinite(role) && role >= 10;
}
