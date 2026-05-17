"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export const ACTIVE_PROJECT_KEY = "adcontrol_active_project_id";
export const ACTIVE_PROJECT_CHANGED = "active-project-changed";
export const ACTIVE_PROJECT_UPDATED = "active-project-updated";

export type ActiveProject = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  timezone: string;
  website_url: string | null;
  monthly_revenue_goal: number;
  monthly_ad_budget: number;
  target_roas: number;
  target_cpa: number;
};

export function emitActiveProjectChange(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }
  window.dispatchEvent(
    new CustomEvent(ACTIVE_PROJECT_CHANGED, { detail: { id } })
  );
}

export function emitActiveProjectUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACTIVE_PROJECT_UPDATED));
}

export function useActiveProject() {
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  });
  const [project, setProject] = useState<ActiveProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    function onActiveChange(e: Event) {
      const ce = e as CustomEvent<{ id: string | null }>;
      setActiveId(ce.detail?.id ?? null);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === ACTIVE_PROJECT_KEY) {
        setActiveId(e.newValue);
      }
    }
    function onUpdated() {
      setBump((v) => v + 1);
    }

    window.addEventListener(ACTIVE_PROJECT_CHANGED, onActiveChange);
    window.addEventListener(ACTIVE_PROJECT_UPDATED, onUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ACTIVE_PROJECT_CHANGED, onActiveChange);
      window.removeEventListener(ACTIVE_PROJECT_UPDATED, onUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!activeId) {
        if (cancelled) return;
        setProject(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, name, description, currency, timezone, website_url, monthly_revenue_goal, monthly_ad_budget, target_roas, target_cpa"
        )
        .eq("id", activeId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setProject(null);
      } else {
        setProject(data as ActiveProject);
      }
      setLoading(false);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [activeId, bump]);

  return { project, loading, activeId };
}
