const configured = process.env.NEXT_PUBLIC_CLOVAPI_API_URL?.trim().replace(/\/$/, "") ?? "";

export function platformAPI(path: string) {
  return `${configured}${path}`;
}

export function platformAPIOrigin() {
  return configured || window.location.origin;
}

export const platformCredentials: RequestCredentials = "include";
