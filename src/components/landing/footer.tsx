import Link from "next/link";
import { en } from "@/messages/en";

export default function LandingFooter() {
  const t = en.footer;
  const { product, company, account } = t.columns;
  return (
    <footer className="bg-[#090A0F] text-zinc-400 border-t border-zinc-900">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">

          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <span className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                AC
              </span>
              <span className="text-white text-sm font-semibold">{en.header.logo}</span>
            </Link>
            <p className="text-sm text-zinc-500 max-w-xs">
              {t.tagline}
            </p>
          </div>

          <FooterColumn title={product.title} links={product.links} />
          <FooterColumn title={company.title} links={company.links} />
          <FooterColumn title={account.title} links={account.links} />

        </div>

        <div className="border-t border-zinc-900 pt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-zinc-500">
            {t.copyright}
          </p>
          <p className="text-xs text-zinc-600">
            {t.infrastructure}
          </p>
        </div>

      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ text: string; href: string }>;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
        {title}
      </p>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.text}>
            {l.href.startsWith("/") ? (
              <Link href={l.href} className="hover:text-white transition">
                {l.text}
              </Link>
            ) : (
              <a href={l.href} className="hover:text-white transition">
                {l.text}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
