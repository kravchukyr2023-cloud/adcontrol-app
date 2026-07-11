import { en } from "@/messages/en";

export default function FaqSection() {
  const t = en.faq;
  return (
    <div className="sec" id="faq">
      <div className="wrap">
        <div className="sl rv">{t.label}</div>
        <h2 className="landing-h2 rv">{t.h2}</h2>
        <div className="faq">
          {t.items.map((item) => (
            <details key={item.q} className="fq rv">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
