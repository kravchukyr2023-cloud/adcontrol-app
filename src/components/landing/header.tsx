import Link from "next/link";
import { en } from "@/messages/en";
import { Logo } from "@/components/logo";

export default function LandingHeader() {
  const t = en.header;
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
          <Link href="/auth">{t.login}</Link>
          <Link href="/auth" className="btn btn-p">
            {t.cta}
          </Link>
        </div>
      </div>
    </nav>
  );
}
