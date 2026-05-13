type Channel = {
  name: string;
  contact: string;
  href: string;
  iconBg: string;
  icon: React.ReactNode;
};

const CHANNELS: Channel[] = [
  {
    name: "Email support",
    contact: "support@adcontrol.app",
    href: "mailto:support@adcontrol.app",
    iconBg:
      "bg-[#6D5EF8]/15 border-[#6D5EF8]/40 text-violet-300",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    ),
  },
  {
    name: "Telegram",
    contact: "@adcontrol_support",
    href: "https://t.me/adcontrol_support",
    iconBg: "bg-blue-500/15 border-blue-500/40 text-blue-300",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 5L2 12l7 3 3 7 9-17z" />
        <path d="M9 15l12-10" />
      </svg>
    ),
  },
];

export default function SupportTab() {
  return (
    <div className="space-y-5">

      <p className="text-sm text-zinc-400">
        Get in touch directly — typical response time is within 24 hours.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CHANNELS.map((c) => {
          const external = c.href.startsWith("http");
          return (
            <a
              key={c.name}
              href={c.href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="border border-[#2A2D3A] hover:border-[#6D5EF8]/60 rounded-2xl p-5 bg-[#0B0D14] flex items-center gap-4 transition"
            >
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${c.iconBg}`}
              >
                {c.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">
                  {c.name}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5 truncate font-mono">
                  {c.contact}
                </p>
              </div>
            </a>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">
        Demo channels — not connected to a real inbox yet.
      </p>

    </div>
  );
}
