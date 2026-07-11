import type { Messages } from "@/messages/en";

export default function SecuritySection({ t }: { t: Messages["security"] }) {
  return (
    <div className="sec" id="security">
      <div className="wrap">
        <div className="sl rv">{t.label}</div>
        <h2 className="landing-h2 rv">{t.h2}</h2>
        <div className="sec-grid">
          {t.items.map((item) => (
            <div key={item.title} className="sg rv">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
