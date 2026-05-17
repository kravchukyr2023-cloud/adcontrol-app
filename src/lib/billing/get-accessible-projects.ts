export type ProjectLike = {
  id: string;
  created_at?: string | null;
};

export function getAccessibleProjects<T extends ProjectLike>(
  projects: T[],
  limit: number
): { accessible: T[]; locked: T[] } {
  const safeLimit = Math.max(0, limit);

  const sorted = [...projects].sort((a, b) => {
    const av = a.created_at ?? "";
    const bv = b.created_at ?? "";
    if (av === bv) return a.id.localeCompare(b.id);
    return av < bv ? -1 : 1;
  });

  const accessible = sorted.slice(0, safeLimit);
  const locked = sorted.slice(safeLimit);
  return { accessible, locked };
}

export function isAccessibleProject<T extends ProjectLike>(
  id: string,
  projects: T[],
  limit: number
): boolean {
  const { accessible } = getAccessibleProjects(projects, limit);
  return accessible.some((p) => p.id === id);
}
