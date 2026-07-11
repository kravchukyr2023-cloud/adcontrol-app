import type { Messages } from "@/messages/en";

export default function DataSourcesSection({
  t,
}: {
  t: Messages["dataSources"];
}) {
  return (
    <div className="sec" id="sources">
      <div className="wrap">
        <div className="sl rv">{t.label}</div>
        <h2 className="landing-h2 rv">{t.h2}</h2>
        <p className="sd rv">{t.sd}</p>
        <div className="srcs">
          {t.sources.map((s) => (
            <div key={s.name} className="src rv">
              <span className="dot" />
              <span>
                <span className="n">{s.name}</span>
                <span className="s">{s.desc}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
