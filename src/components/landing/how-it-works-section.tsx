import { en } from "@/messages/en";

export default function HowItWorksSection() {
  const t = en.howItWorks;
  return (
    <div className="sec" id="how">
      <div className="wrap">
        <div className="sl rv">{t.label}</div>
        <h2 className="landing-h2 rv">{t.h2}</h2>
        <div className="steps">
          {t.steps.map((s) => (
            <div key={s.index} className="st rv">
              <div className="i mono">{s.index}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
