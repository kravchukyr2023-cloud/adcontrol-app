"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import CreateProjectWizard from "@/components/hub/create-project-wizard";
import ProjectLimitModal from "@/components/billing/project-limit-modal";
import SubscriptionRequiredModal from "@/components/billing/subscription-required-modal";
import {
  ACTIVE_PROJECT_CHANGED,
  emitActiveProjectChange,
} from "@/hooks/use-active-project";
import { useEntitlements } from "@/hooks/use-entitlements";
import { canCreateProject } from "@/lib/billing/can-create-project";
import { getProjectUsage } from "@/lib/billing/get-project-usage";
import { getAccessibleProjects } from "@/lib/billing/get-accessible-projects";

const ACTIVE_KEY = "adcontrol_active_project_id";

type Project = {
  id: string;
  name: string;
  currency: string;
  description: string | null;
  created_at: string | null;
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
  // entitlementsLoading is critical: during cold load `limits.projectsTotal`
  // falls back to 1 (starter default in useEntitlements.INITIAL) until the
  // real plan is fetched. Reassign logic MUST wait for this to settle, or
  // else a Team-plan (limit=5) user briefly looks like Starter (limit=1)
  // and gets all-but-one of their projects misclassified as "locked".
  const { plan, limits, loading: entitlementsLoading } = useEntitlements();

  const [projects, setProjects] = useState<Project[]>([]);
  // Distinguishes "projects haven't loaded yet" from "user has zero projects".
  // Without this, the initial empty array on mount is indistinguishable from
  // a real "no projects" reality-check and triggers a premature reassignment.
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_KEY);
  });
  const [open, setOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [subRequiredOpen, setSubRequiredOpen] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  // Sequence counter to discard stale fetchProjects responses when two
  // refetches overlap (e.g. wizard emits ACTIVE_PROJECT_CHANGED while the
  // mount fetch is still in flight). Only the latest invocation wins.
  const fetchSeqRef = useRef(0);

  const fetchProjects = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, currency, description, created_at")
      .order("created_at", { ascending: false });

    // Stale response — a newer fetch was kicked off after us. Drop.
    if (seq !== fetchSeqRef.current) return;

    if (error || !data) {
      setProjects([]);
    } else {
      setProjects(data as Project[]);
    }
    // Flip the loaded flag in both success and failure paths. Failure
    // is still a settled state ("projects = []" is the truth), and the
    // reassignment FSM is allowed to act on it from this point on.
    setProjectsLoaded(true);
  }, []);

  // Mount fetch. Deferred via microtask to satisfy
  // react-hooks/set-state-in-effect — fetchProjects ultimately calls
  // setState, which the lint rule forbids synchronously inside an effect.
  useEffect(() => {
    Promise.resolve().then(fetchProjects);
  }, [fetchProjects]);

  // Grace-period tracking for Guard D below.
  // Per-activeId memoisation: when we see "activeId exists but not in
  // projects list yet" we allow ONE grace cycle before deciding it is
  // truly stale. Resets when activeId changes — every new id gets its
  // own fresh grace window.
  const verificationGraceRef = useRef<{
    activeId: string | null;
    consumed: boolean;
  }>({ activeId: null, consumed: false });
  // Forced re-evaluation bump used by Guard D's setTimeout fallback.
  const [verificationBump, setVerificationBump] = useState(0);
  // Pending timer for the grace-period fallback. Cleared on unmount or
  // when superseded by a fresher activeId.
  const verificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    return () => {
      if (verificationTimerRef.current !== null) {
        clearTimeout(verificationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Guard A — entitlements not settled yet.
    //   Before this resolves, limits.projectsTotal is the INITIAL fallback
    //   (1, from Starter default). Acting on that value misclassifies a
    //   paid-plan user's projects as "over limit" and silently rewrites
    //   activeId to the oldest "accessible" project.
    if (entitlementsLoading) return;

    // Guard B — projects list not loaded yet.
    //   `projects.length === 0` is ambiguous on cold load: it could mean
    //   "user genuinely has no projects" OR "fetch is still in flight".
    //   The `projectsLoaded` flag disambiguates.
    if (!projectsLoaded) return;

    if (projects.length === 0) {
      // Truly zero projects — clear activeId if it pointed somewhere.
      if (activeId !== null) {
        emitActiveProjectChange(null);
      }
      return;
    }

    const { accessible } = getAccessibleProjects(
      projects,
      limits.projectsTotal
    );

    if (accessible.length === 0) {
      // Plan limit = 0 (edge case) — nothing to switch to.
      if (activeId !== null) {
        emitActiveProjectChange(null);
      }
      return;
    }

    const existsInProjects =
      !!activeId && projects.some((p) => p.id === activeId);
    const isAccessible =
      !!activeId && accessible.some((p) => p.id === activeId);

    // Guard C — respect explicit user choice.
    //   If activeId points to a project that exists in the user's list,
    //   DO NOT reassign just because it falls into the `locked` tier.
    //   The dropdown surfaces locked state per-row and the main button
    //   shows a "Locked" badge.
    if (existsInProjects) {
      // ActiveId resolved cleanly — clear any pending grace timer/state
      // so a future re-entry into the "missing" branch starts fresh.
      verificationGraceRef.current = {
        activeId: null,
        consumed: false,
      };
      if (verificationTimerRef.current !== null) {
        clearTimeout(verificationTimerRef.current);
        verificationTimerRef.current = null;
      }
      return;
    }

    if (isAccessible) {
      // accessible without existsInProjects is logically impossible
      // (accessible ⊆ projects), but keep the check explicit.
      return;
    }

    // Guard D — give-the-fetch-a-chance grace period.
    //   activeId is set, but not in the current `projects` snapshot.
    //   Most often this is a race: wizard just emit'd a new id, but the
    //   matching fetchProjects refetch hasn't completed (or fired) yet.
    //   We allow ONE grace cycle (≈ 2s) before deciding the id is truly
    //   stale (deleted project, logout/login, etc.) and reassigning.
    //
    //   The grace state is keyed by activeId so a brand-new id gets a
    //   fresh window — it's not a global throttle, it's per-candidate.
    const grace = verificationGraceRef.current;
    if (grace.activeId !== activeId) {
      grace.activeId = activeId;
      grace.consumed = false;
    }

    if (!grace.consumed) {
      grace.consumed = true;
      // If projects refetches in this window (Change 2's listener fires
      // fetchProjects on ACTIVE_PROJECT_CHANGED), the effect re-runs
      // earlier with existsInProjects=true and we exit via Guard C.
      // Otherwise this timeout forces a re-evaluation after the window
      // and the second pass falls through to the reassign below.
      if (verificationTimerRef.current !== null) {
        clearTimeout(verificationTimerRef.current);
      }
      verificationTimerRef.current = setTimeout(() => {
        verificationTimerRef.current = null;
        setVerificationBump((v) => v + 1);
      }, 2000);
      return;
    }

    // Grace period already consumed for THIS activeId, and projects still
    // don't contain it after the wait + refetch. Treat as stale: reassign.
    emitActiveProjectChange(accessible[0].id);
  }, [
    projects,
    projectsLoaded,
    limits.projectsTotal,
    entitlementsLoading,
    activeId,
    verificationBump,
  ]);

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

  useEffect(() => {
    function onActiveChange(e: Event) {
      const ce = e as CustomEvent<{ id: string | null }>;
      setActiveId(ce.detail?.id ?? null);
      // The activeId most likely came from a wizard that just inserted a
      // new project (or a project switch from elsewhere). Our local
      // `projects` cache may not yet contain that id. Refetch — closes
      // the wizard-vs-mount race that was reassigning users to the oldest
      // project after a successful create.
      fetchProjects();
    }
    function onStorage(e: StorageEvent) {
      if (e.key === ACTIVE_KEY) {
        setActiveId(e.newValue);
        fetchProjects();
      }
    }
    window.addEventListener(ACTIVE_PROJECT_CHANGED, onActiveChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ACTIVE_PROJECT_CHANGED, onActiveChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [fetchProjects]);

  function handleSwitch(id: string, locked: boolean) {
    if (locked) {
      setOpen(false);
      setSubRequiredOpen(true);
      return;
    }
    emitActiveProjectChange(id);
    setActiveId(id);
    setOpen(false);
    router.push("/dashboard");
  }

  async function handleCreateNew() {
    setOpen(false);
    const fresh = await getProjectUsage();
    if (canCreateProject(fresh.projects, limits)) {
      setWizardOpen(true);
    } else {
      setLimitOpen(true);
    }
  }

  async function handleAfterCreate() {
    // Wizard already emit'd ACTIVE_PROJECT_CHANGED, which triggers a
    // refetch via the listener above. We still call fetchProjects here
    // explicitly to cover the case where the wizard ran in a flow that
    // didn't fire the event (defence in depth).
    await fetchProjects();

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ACTIVE_KEY);
      if (stored) setActiveId(stored);
    }
  }

  const { accessible, locked } = getAccessibleProjects(
    projects,
    limits.projectsTotal
  );
  const accessibleIds = new Set(accessible.map((p) => p.id));
  const active = projects.find((p) => p.id === activeId) ?? null;
  // True when the user's active project is real but falls outside the
  // current plan's per-user limit. We don't silently reassign anymore —
  // we surface the state visually so the user can decide.
  const isActiveLocked = active ? !accessibleIds.has(active.id) : false;

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
          <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
            <span className="truncate">
              {active ? active.name : "Select project"}
            </span>
            {isActiveLocked && (
              <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider border border-rose-500/40 bg-rose-500/10 text-rose-300">
                Locked
              </span>
            )}
          </p>
          <p className="text-[11px] text-zinc-500 truncate">
            {isActiveLocked
              ? `Over ${plan.name} plan limit · Upgrade to unlock`
              : `Meta Ads ${active?.currency ? `· ${active.currency}` : ""}`}
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
                const isLocked = !accessibleIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSwitch(p.id, isLocked)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-[#2A2D3A] last:border-b-0 text-left transition ${
                      isActive
                        ? "bg-[#6D5EF8]/10"
                        : isLocked
                        ? "opacity-60 hover:bg-rose-500/5"
                        : "hover:bg-[#1B2238]/40"
                    }`}
                  >
                    <div
                      className={
                        isLocked
                          ? "w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-500 text-[10px] font-semibold shrink-0"
                          : "w-7 h-7 rounded-md bg-gradient-to-br from-[#6D5EF8] to-purple-600 flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                      }
                    >
                      {buildInitials(p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {isLocked
                          ? "Paused — payment required"
                          : (p.description?.trim() || "Meta Ads")}
                      </p>
                    </div>
                    {isActive && !isLocked && (
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
                    {isLocked && (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-rose-300 shrink-0"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {locked.length > 0 && (
            <div className="px-3 py-2 border-t border-[#2A2D3A] bg-rose-500/5 text-[10px] text-rose-300">
              {locked.length} project{locked.length === 1 ? "" : "s"} paused. Restore payment to unlock.
            </div>
          )}

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
    </div>
  );
}
