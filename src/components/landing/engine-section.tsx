import { en } from "@/messages/en";

export default function EngineSection() {
  const t = en.engine;
  return (
    <div className="sec" id="engine">
      <div className="wrap">
        <div className="sl rv">{t.label}</div>
        <h2 className="landing-h2 rv">{t.h2}</h2>
        <p className="sd rv">{t.sd}</p>

        <div className="eng-card rv">
          <div className="ch">
            <span className="l mono">{t.card.header}</span>
            <span className="tag">{t.card.tag}</span>
          </div>
          <div className="cb">
            {t.card.cells.map((cell) => (
              <div key={cell.k} className={cell.act ? "cc act" : "cc"}>
                <div className="k">{cell.k}</div>
                <div className="v">
                  {cell.v.split("\n").map((line, i, arr) => (
                    <span key={i}>
                      {line}
                      {i < arr.length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
