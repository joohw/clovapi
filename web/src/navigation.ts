export const pages = ['models', 'providers', 'call-logs', 'system-logs', 'settings'] as const;
export type Page = typeof pages[number];

function knownPage(value: string): Page | null {
  return pages.find(page => page === value) ?? null;
}

export function resolveRoute(location: Pick<Location, 'pathname' | 'search' | 'hash'>): { page: Page | null; canonicalHref?: string } {
  if (location.pathname === '/') {
    const legacyPage = knownPage(location.hash.slice(1));
    const page = legacyPage ?? 'models';
    return { page, canonicalHref: `/${page}${location.search}${legacyPage ? '' : location.hash}` };
  }
  if (location.pathname.endsWith('/')) {
    const page = knownPage(location.pathname.slice(1, -1));
    return page ? { page, canonicalHref: `/${page}${location.search}${location.hash}` } : { page: null };
  }
  return { page: knownPage(location.pathname.slice(1)) };
}
