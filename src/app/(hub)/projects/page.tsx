"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { emitActiveProjectChange } from "@/hooks/use-active-project";

import ProjectsHeader from "@/components/hub/projects-header";
import ProjectCard from "@/components/hub/project-card";
import EmptyProjects from "@/components/hub/empty-projects";
import CreateProjectCard from "@/components/hub/create-project-card";
import CreateProjectWizard from "@/components/hub/create-project-wizard";

type Project = {
  id: string;
  name: string;
  currency: string;
  monthly_revenue_goal: number;
  monthly_ad_budget: number;
  target_roas: number;
};

async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, currency, monthly_revenue_goal, monthly_ad_budget, target_roas"
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data as Project[];
}

export default function ProjectsPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

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

  function handleOpen(id: string) {
    emitActiveProjectChange(id);
    router.push("/dashboard");
  }

  const hasProjects = projects !== null && projects.length > 0;
  const isEmpty = projects !== null && projects.length === 0;

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
              onClick={() => setWizardOpen(true)}
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
          <EmptyProjects onCreate={() => setWizardOpen(true)} />
        )}

        {hasProjects && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects!.map((p) => (
              <ProjectCard
                key={p.id}
                id={p.id}
                name={p.name}
                currency={p.currency}
                monthlyRevenueGoal={p.monthly_revenue_goal}
                monthlyAdBudget={p.monthly_ad_budget}
                targetRoas={p.target_roas}
                onOpen={handleOpen}
              />
            ))}
            <CreateProjectCard onClick={() => setWizardOpen(true)} />
          </div>
        )}

      </main>

      <CreateProjectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={refresh}
      />
    </>
  );
}
