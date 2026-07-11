import type { Messages } from "@/messages/en";

export default function WhoItsForSection({
  t,
}: {
  t: Messages["whoItsFor"];
}) {
  return (
    <div className="sec" id="who">
      <div className="wrap">
        <div className="sl rv">{t.label}</div>
        <h2 className="landing-h2 rv">{t.h2}</h2>
        <div className="who">
          {t.cards.map((c) => (
            <div key={c.badge} className="wc rv">
              <span className="b mono">{c.badge}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
