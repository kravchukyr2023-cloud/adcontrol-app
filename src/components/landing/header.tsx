import Link from "next/link";

export default function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 bg-[#090A0F]/80 backdrop-blur border-b border-zinc-900">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-6">

        <Link href="/landing" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            AC
          </span>
          <span className="text-white text-sm font-semibold tracking-tight">
            AdControl
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm text-zinc-400">
          <a href="#product" className="hover:text-white transition">Product</a>
          <a href="#how" className="hover:text-white transition">How it works</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <a href="#security" className="hover:text-white transition">Security</a>
        </nav>

        <div className="flex items-center gap-2">

          <div className="hidden lg:flex items-center border border-zinc-800 rounded-md text-xs overflow-hidden">
            <button className="px-2 py-1 text-white bg-zinc-900">EN</button>
            <button className="px-2 py-1 text-zinc-500 hover:text-zinc-300 transition">UK</button>
          </div>

          <button
            aria-label="Toggle theme"
            className="hidden lg:flex w-8 h-8 items-center justify-center text-zinc-400 hover:text-white border border-zinc-800 rounded-md transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </button>

          <Link
            href="/auth"
            className="text-sm text-zinc-300 hover:text-white px-3 py-2 transition"
          >
            Login
          </Link>

          <Link
            href="/auth"
            className="text-sm bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-zinc-200 transition"
          >
            Start free
          </Link>

        </div>

      </div>
    </header>
  );
}
