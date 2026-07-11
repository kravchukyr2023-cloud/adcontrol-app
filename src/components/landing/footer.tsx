import { en } from "@/messages/en";

export default function LandingFooter() {
  const t = en.footer;
  return (
    <footer className="landing-footer">
      <div className="wrap ft">
        <span>{t.copyright}</span>
        <nav className="ft-nav">
          {t.links.map((l) => (
            <a key={l.text} href={l.href}>
              {l.text}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
