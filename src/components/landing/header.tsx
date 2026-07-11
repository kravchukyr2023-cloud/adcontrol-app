import Link from "next/link";
import { en } from "@/messages/en";

export default function LandingHeader() {
  const t = en.header;
  return (
    <header className="sticky top-0 z-50 bg-[#090A0F]/80 backdrop-blur border-b border-zinc-900">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-6">

        <Link href="/" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            AC
          </span>
          <span className="text-white text-sm font-semibold tracking-tight">
            {t.logo}
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm text-zinc-400">
          <a href="#product" className="hover:text-white transition">{t.nav.product}</a>
          <a href="#how" className="hover:text-white transition">{t.nav.howItWorks}</a>
          <a href="#access" className="hover:text-white transition">{t.nav.access}</a>
          <a href="#security" className="hover:text-white transition">{t.nav.security}</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/auth"
            className="text-sm text-zinc-300 hover:text-white px-3 py-2 transition"
          >
            {t.login}
          </Link>

          <Link
            href="/auth"
            className="text-sm bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-zinc-200 transition"
          >
            {t.cta}
          </Link>
        </div>

      </div>
    </header>
  );
}
