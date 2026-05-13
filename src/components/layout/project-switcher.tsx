"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import CreateProjectWizard from "@/components/hub/create-project-wizard";

const ACTIVE_KEY = "adcontrol_active_project_id";

type Project = {
  id: string;
  name: string;
  currency: string;
  description: string | null;
};

function buildInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "");
  return parts.join("") || "P";
}

export default function ProjectSwitcher() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_KEY);
  });
  const [open, setOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, currency, description")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error || !data) {
        setProjects([]);
        return;
      }

      const list = data as Project[];
      setProjects(list);

      const stored = localStorage.getItem(ACTIVE_KEY);
      const exists = stored && list.some((p) => p.id === stored);

      if (!exists && list.length > 0) {
        const newId = list[0].id;
        setActiveId(newId);
        localStorage.setItem(ACTIVE_KEY, newId);
      } else if (!list.length) {
        setActiveId(null);
        localStorage.removeItem(ACTIVE_KEY);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleSwitch(id: string) {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
    setOpen(false);
    router.push("/dashboard");
  }

  function handleCreateNew() {
    setOpen(false);
    setWizardOpen(true);
  }

  async function handleAfterCreate() {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, currency, description")
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) return;

    const list = data as Project[];
    setProjects(list);

    const newId = list[0].id;
    setActiveId(newId);
    localStorage.setItem(ACTIVE_KEY, newId);
    router.push("/dashboard");
  }

  const active =
    projects.find((p) => p.id === activeId) ?? null;

  return (
    <div ref={ref} className="relative">

      <button
        onClick={() => setOpen((v) => !v)}
        className={
          open
            ? "w-full flex items-center gap-3 p-3 bg-[#6D5EF8]/10 border border-[#6D5EF8]/40 rounded-xl transition text-left"
            : "w-full flex items-center gap-3 p-3 bg-[#050816] border border-[#1B2238] hover:border-zinc-700 rounded-xl transition text-left"
        }
      >
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
          {active ? buildInitials(active.name) : "AC"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {active ? active.name : "Select project"}
          </p>
          <p className="text-[11px] text-zinc-500 truncate">
            Meta Ads {active?.currency ? `· ${active.currency}` : ""}
          </p>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={
            open
              ? "text-[#a99cff] rotate-180 transition shrink-0"
              : "text-zinc-500 transition shrink-0"
          }
        >
          <path d="M7 9l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-40 bg-[#0F111A] border border-[#2A2D3A] rounded-xl shadow-2xl overflow-hidden">

          <div className="max-h-72 overflow-y-auto">
            {projects.length === 0 ? (
              <p className="text-xs text-zinc-500 px-4 py-4 text-center">
                No projects yet.
              </p>
            ) : (
              projects.map((p) => {
                const isActive = p.id === activeId;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSwitch(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-[#2A2D3A] last:border-b-0 text-left transition ${
                      isActive
                        ? "bg-[#6D5EF8]/10"
                        : "hover:bg-[#1B2238]/40"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                      {buildInitials(p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {p.description?.trim() || "Meta Ads"}
                      </p>
                    </div>
                    {isActive && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-[#a99cff] shrink-0"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={handleCreateNew}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 bg-[#0B0D14] border-t border-[#2A2D3A] hover:bg-[#1B2238]/40 text-sm text-zinc-300 hover:text-white transition"
          >
            <span className="text-[#a99cff] text-base leading-none">+</span>{" "}
            Project
          </button>

        </div>
      )}

      <CreateProjectWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleAfterCreate}
      />
    </div>
  );
}
