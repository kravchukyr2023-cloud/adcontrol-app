import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="bg-[#090A0F] text-zinc-400 border-t border-zinc-900">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">

          <div className="col-span-2 md:col-span-1">
            <Link href="/landing" className="flex items-center gap-2 mb-4">
              <span className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                AC
              </span>
              <span className="text-white text-sm font-semibold">AdControl</span>
            </Link>
            <p className="text-sm text-zinc-500 max-w-xs">
              Operational marketing workspace for paid advertising.
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
              Product
            </p>
            <ul className="space-y-2 text-sm">
              <li><a href="#product" className="hover:text-white transition">Product</a></li>
              <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
              <li><a href="#security" className="hover:text-white transition">Security</a></li>
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
              Company
            </p>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Privacy</a></li>
              <li><a href="#" className="hover:text-white transition">Support</a></li>
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
              Account
            </p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/auth" className="hover:text-white transition">Login</Link></li>
              <li><Link href="/auth" className="hover:text-white transition">Create account</Link></li>
            </ul>
          </div>

        </div>

        <div className="border-t border-zinc-900 pt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-zinc-500">
            © 2026 AdControl. All rights reserved.
          </p>
          <p className="text-xs text-zinc-600">
            Marketing Operations Infrastructure
          </p>
        </div>

      </div>
    </footer>
  );
}
