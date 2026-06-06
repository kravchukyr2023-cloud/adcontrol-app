"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { emitActiveProjectChange } from "@/hooks/use-active-project";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useProjectSummaries } from "@/hooks/use-project-summaries";
import { canCreateProject } from "@/lib/billing/can-create-project";
import { getProjectUsage } from "@/lib/billing/get-project-usage";
import { getAccessibleProjects } from "@/lib/billing/get-accessible-projects";

import ProjectsHeader from "@/components/hub/projects-header";
import ProjectCard from "@/components/hub/project-card";
import EmptyProjects from "@/components/hub/empty-projects";
import CreateProjectCard from "@/components/hub/create-project-card";
import CreateProjectWizard from "@/components/hub/create-project-wizard";
import ProjectLimitModal from "@/components/billing/project-limit-modal";
import SubscriptionRequiredModal from "@/components/billing/subscription-required-modal";

type Project = {
  id: string;
  name: string;
  currency: string;
  created_at: string | null;
  monthly_revenue_goal: number;
  monthly_ad_budget: number;
  target_roas: number;
};

async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, currency, created_at, monthly_revenue_goal, monthly_ad_budget, target_roas"
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as Project[];
}

export default function ProjectsPage() {
  const router = useRouter();
  const { plan, limits } = useEntitlements();
  const { summaries } = useProjectSummaries();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [subRequiredOpen, setSubRequiredOpen] = useState(false);

  // O(1) lookup from projectId → this-month totals. Null while the
  // summaries fetch is in flight — card renders a skeleton row in that
  // case (see `loaded` prop on MetricRow).
  const summaryByProject = summaries
    ? new Map(summaries.map((s) => [s.projectId, s]))
    : null;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const list = await fetchProjects();
      if (cancelled) return;
      setProjects(list);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    const list = await fetchProjects();
    setProjects(list);
  }

  async function openCreate() {
    const fresh = await getProjectUsage();
    if (canCreateProject(fresh.projects, limits)) {
      setWizardOpen(true);
    } else {
      setLimitOpen(true);
    }
  }

  function handleOpen(id: string) {
    emitActiveProjectChange(id);
    router.push("/dashboard");
  }

  const hasProjects = projects !== null && projects.length > 0;
  const isEmpty = projects !== null && projects.length === 0;

  const split = projects
    ? getAccessibleProjects(projects, limits.projectsTotal)
    : { accessible: [], locked: [] };
  const accessibleIds = new Set(split.accessible.map((p) => p.id));

  return (
    <>
      <ProjectsHeader />

      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-12 lg:py-16">

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-3">
              Workspace
            </p>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-3">
              Choose a project
            </h1>
            <p className="text-zinc-400 max-w-xl">
              Select a workspace to view performance, attribution and recommendations.
            </p>
          </div>

          {hasProjects && (
            <button
              onClick={openCreate}
              className="shrink-0 bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white text-sm font-medium px-5 py-3 rounded-xl transition"
            >
              + Create New Project
            </button>
          )}
        </div>

        {projects === null && (
          <p className="text-zinc-500 text-sm">
            Loading workspaces…
          </p>
        )}

        {isEmpty && (
          <EmptyProjects onCreate={openCreate} />
        )}

        {hasProjects && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects!.map((p) => {
              const locked = !accessibleIds.has(p.id);
              return (
                <ProjectCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  currency={p.currency}
                  monthlyRevenueGoal={p.monthly_revenue_goal}
                  monthlyAdBudget={p.monthly_ad_budget}
                  targetRoas={p.target_roas}
                  locked={locked}
                  summary={
                    summaryByProject
                      ? summaryByProject.get(p.id) ?? null
                      : null
                  }
                  onOpen={handleOpen}
                  onLockedClick={() => setSubRequiredOpen(true)}
                />
              );
            })}
            <CreateProjectCard onClick={openCreate} />
          </div>
        )}

      </main>

      <CreateProjectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={refresh}
      />

      <ProjectLimitModal
        open={limitOpen}
        plan={plan}
        currentLimit={limits.projectsTotal}
        onClose={() => setLimitOpen(false)}
      />

      <SubscriptionRequiredModal
        open={subRequiredOpen}
        onClose={() => setSubRequiredOpen(false)}
      />
    </>
  );
}
