"use client";

import { useMemo, useState } from "react";
import { useActiveProject } from "@/hooks/use-active-project";

type Template = {
  id: string;
  label: string;
  values: Partial<Record<UtmKey, string>>;
};

type UtmKey =
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_content"
  | "utm_term";

const TEMPLATES: Template[] = [
  {
    id: "meta_feed",
    label: "Meta Feed",
    values: { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "feed" },
  },
  {
    id: "meta_stories",
    label: "Meta Stories",
    values: { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "stories" },
  },
  {
    id: "organic_social",
    label: "Organic Social",
    values: { utm_source: "instagram", utm_medium: "social", utm_campaign: "organic" },
  },
];

const FIELDS: { key: UtmKey; label: string; placeholder: string }[] = [
  { key: "utm_source", label: "utm_source", placeholder: "facebook" },
  { key: "utm_medium", label: "utm_medium", placeholder: "cpc" },
  { key: "utm_campaign", label: "utm_campaign", placeholder: "spring_sale" },
  { key: "utm_content", label: "utm_content", placeholder: "video_a" },
  { key: "utm_term", label: "utm_term", placeholder: "running shoes" },
];

const inputCls =
  "w-full h-11 px-3.5 bg-[#050816] border border-[#1B2238] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-600";
const labelCls =
  "text-[11px] uppercase tracking-wider text-zinc-500 block mb-2";

function buildUrl(
  base: string,
  values: Record<UtmKey, string>
): string {
  if (!base.trim()) return "";

  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    return "";
  }

  (Object.keys(values) as UtmKey[]).forEach((k) => {
    const v = values[k].trim();
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  });

  return url.toString();
}

export default function UtmPage() {
  const { project } = useActiveProject();
  const projectWebsite = project?.website_url ?? "";
  const projectKey = project?.id ?? "no-project";

  return (
    <UtmForm
      key={projectKey}
      projectWebsite={projectWebsite}
    />
  );
}

function UtmForm({ projectWebsite }: { projectWebsite: string }) {
  const [website, setWebsite] = useState(projectWebsite);
  const [values, setValues] = useState<Record<UtmKey, string>>({
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_content: "",
    utm_term: "",
  });
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generated = useMemo(
    () => buildUrl(website, values),
    [website, values]
  );

  function applyTemplate(t: Template) {
    setActiveTemplate(t.id);
    setValues((prev) => {
      const next = { ...prev };
      (Object.keys(t.values) as UtmKey[]).forEach((k) => {
        const v = t.values[k];
        if (v !== undefined) next[k] = v;
      });
      return next;
    });
  }

  function reset() {
    setWebsite(projectWebsite);
    setValues({
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_content: "",
      utm_term: "",
    });
    setActiveTemplate(null);
    setCopied(false);
  }

  async function copyToClipboard() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
          UTM Generator
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          Build structured, validated UTM-tagged URLs for your campaigns.
        </p>
      </div>

      <div>
        <p className={labelCls}>Templates</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => {
            const active = activeTemplate === t.id;
            return (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className={
                  active
                    ? "h-9 px-4 rounded-lg border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white text-xs transition"
                    : "h-9 px-4 rounded-lg border border-[#1B2238] hover:border-zinc-700 text-zinc-300 text-xs transition"
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6 space-y-5">

        <div>
          <label className={labelCls}>Website URL</label>
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com/page"
            className={inputCls}
          />
          {projectWebsite && (
            <p className="text-xs text-zinc-500 mt-2">
              Prefilled from project settings.{" "}
              <button
                onClick={() => setWebsite(projectWebsite)}
                className="text-[#a99cff] hover:text-white transition"
              >
                Reset to project URL
              </button>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelCls}>{f.label}</label>
              <input
                type="text"
                value={values[f.key]}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: e.target.value })
                }
                placeholder={f.placeholder}
                className={inputCls + " font-mono"}
              />
            </div>
          ))}
        </div>

      </div>

      <div className="border border-[#1B2238] rounded-2xl bg-[#0B1020] p-6">
        <div className="flex items-center justify-between mb-3">
          <p className={labelCls + " mb-0"}>Generated URL</p>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              className="text-xs text-zinc-400 hover:text-white border border-[#1B2238] hover:border-zinc-700 rounded-md px-3 py-1.5 transition"
            >
              Reset
            </button>
            <button
              onClick={copyToClipboard}
              disabled={!generated}
              className="text-xs bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium rounded-md px-3 py-1.5 transition disabled:opacity-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="border border-[#1B2238] bg-black/40 rounded-xl p-4 min-h-[64px]">
          <p className="font-mono text-sm text-white break-all">
            {generated ? generated : (
              <span className="text-zinc-600">
                Add website URL and parameters to generate a tagged link.
              </span>
            )}
          </p>
        </div>
      </div>

    </div>
  );
}
