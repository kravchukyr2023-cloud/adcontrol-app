import Link from "next/link";
import type { Messages } from "@/messages/en";

export default function AccessSection({ t }: { t: Messages["access"] }) {
  return (
    <div className="acc" id="access">
      <div className="wrap ai">
        <div>
          <div className="sl rv">{t.label}</div>
          <h2 className="landing-h2 rv">{t.h2}</h2>
          <ul className="ck rv">
            {t.bullets.map((b) => (
              <li key={b}>
                <svg width="15" height="15" viewBox="0 0 16 16">
                  <path
                    d="M3 8.5L6 11.5L13 4.5"
                    stroke="#0C6B41"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="form rv">
          <div className="t">{t.form.title}</div>
          <div className="s">{t.form.sub}</div>
          <input type="email" placeholder={t.form.placeholder} />
          <Link href="/auth" className="btn btn-p btn-lg">
            {t.form.cta}
          </Link>
          <div className="f">{t.form.fine}</div>
        </div>
      </div>
    </div>
  );
}
