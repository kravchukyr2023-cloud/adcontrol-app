import Link from "next/link";
import type { Messages } from "@/messages/en";
import type { Locale } from "@/i18n/config";
import { Logo } from "@/components/logo";
import { LocaleSwitcher } from "@/components/landing/locale-switcher";

export default function LandingHeader({
  t,
  locale,
}: {
  t: Messages["header"];
  locale: Locale;
}) {
  return (
    <nav className="landing-nav">
      <div className="wrap nv">
        <Link href="/" className="brand">
          <Logo />
          <b>{t.logo}</b>
        </Link>
        <div className="nl">
          <a href="#how">{t.nav.howItWorks}</a>
          <a href="#engine">{t.nav.engine}</a>
          <a href="#who">{t.nav.whoItsFor}</a>
          <a href="#faq">{t.nav.faq}</a>
        </div>
        <div className="nr">
          <LocaleSwitcher active={locale} />
          <Link href="/auth">{t.login}</Link>
          <Link href="/auth" className="btn btn-p">
            {t.cta}
          </Link>
        </div>
      </div>
    </nav>
  );
}
