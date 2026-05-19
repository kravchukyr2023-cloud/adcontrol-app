import { EffectiveLimits } from "./merge-custom-limits";

export function canCreateProject(
  usedProjects: number,
  limits: EffectiveLimits
): boolean {
  return usedProjects < limits.projectsTotal;
}
