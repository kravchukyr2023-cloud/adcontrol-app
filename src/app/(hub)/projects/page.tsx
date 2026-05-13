"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

import ProjectsHeader from "@/components/hub/projects-header";
import ProjectCard from "@/components/hub/project-card";
import EmptyProjects from "@/components/hub/empty-projects";
import CreateProjectCard from "@/components/hub/create-project-card";
import CreateProjectWizard from "@/components/hub/create-project-wizard";

type Project = {
  id: string;
  name: string;
  currency: string;
};

export default function ProjectsPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, currency")
      .order("created_at", { ascending: false });

    if (error || !data) {
      setProjects([]);
      return;
    }

    setProjects(data as Project[]);
  }

  function handleOpen() {
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
                name={p.name}
                currency={p.currency}
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
        onCreated={loadProjects}
      />
    </>
  );
}
