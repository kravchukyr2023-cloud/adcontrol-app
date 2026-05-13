"use client";

import { useState } from "react";

type Props = {
  email: string;
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
];

const inputCls =
  "w-full h-11 px-3.5 bg-[#0B0D14] border border-[#2A2D3A] rounded-xl outline-none text-sm text-white focus:border-[#6D5EF8] transition placeholder:text-zinc-600";
const labelCls =
  "text-[11px] uppercase tracking-wider text-zinc-500 block mb-2";

export default function ProfileTab({ email }: Props) {
  const [name, setName] = useState("");
  const [emailValue, setEmailValue] = useState(email);
  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-5">

      <div>
        <label className={labelCls}>Full Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Email</label>
        <input
          type="email"
          value={emailValue}
          onChange={(e) => setEmailValue(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className={inputCls}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Theme</label>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          <button
            onClick={() => setTheme("dark")}
            className={
              theme === "dark"
                ? "h-11 rounded-xl border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white text-sm transition"
                : "h-11 rounded-xl border border-[#2A2D3A] hover:border-zinc-700 text-zinc-300 text-sm transition"
            }
          >
            Dark
          </button>
          <button
            onClick={() => setTheme("light")}
            className={
              theme === "light"
                ? "h-11 rounded-xl border border-[#6D5EF8] bg-[#6D5EF8]/15 text-white text-sm transition"
                : "h-11 rounded-xl border border-[#2A2D3A] hover:border-zinc-700 text-zinc-300 text-sm transition"
            }
          >
            Light
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {saved && (
          <span className="text-xs text-emerald-400">Saved (UI only)</span>
        )}
        <button
          onClick={handleSave}
          className="h-11 px-6 rounded-xl bg-[#6D5EF8] hover:bg-[#7d6ef9] text-white font-medium text-sm transition"
        >
          Save Changes
        </button>
      </div>

    </div>
  );
}
