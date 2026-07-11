import Link from "next/link";
import type { Messages } from "@/messages/en";

export default function LandingHero({
  hero,
  tbl,
}: {
  hero: Messages["hero"];
  tbl: Messages["compareTable"];
}) {
  return (
    <div className="hero">
      <div className="wrap">
        <div className="htop">
          <div>
            <div className="eb rv">
              <i />
              {hero.badge}
            </div>
            <h1 className="landing-h1 rv">
              {hero.h1Before}
              <br />
              {hero.h1After}
              <em>{hero.h1Highlight}</em>
              {hero.h1End}
            </h1>
          </div>
          <div>
            <p className="lede rv">{hero.lede}</p>
            <div className="cta rv">
              <Link href="/auth" className="btn btn-p btn-lg">
                {hero.primaryCta}
              </Link>
              <Link href="/auth" className="btn btn-g">
                {hero.secondaryCta}
              </Link>
            </div>
            <div className="fine rv">{hero.fine}</div>
          </div>
        </div>

        <div className="tbl rv">
          <div className="th">
            <div>
              <div className="lbl">{tbl.campaignLabel}</div>
              <div className="nm">{tbl.campaignName}</div>
            </div>
            <div className="c2">
              <div className="lbl">{tbl.claimLabel}</div>
              <div className="nm">{tbl.claimName}</div>
            </div>
            <div className="c3">
              <div className="lbl">{tbl.trueLabel}</div>
              <div className="nm">{tbl.trueName}</div>
            </div>
            <div className="c4">
              <div className="lbl">{tbl.actionLabel}</div>
              <div className="nm">&nbsp;</div>
            </div>
          </div>

          {tbl.rows.map((r) => (
            <div key={r.metric} className={r.win ? "tr win" : "tr"}>
              <div className="met">{r.metric}</div>
              <div className="c2 mono">{r.claim}</div>
              <div className="c3 mono">{r.trueVal}</div>
              <div className="c4">{r.action}</div>
            </div>
          ))}

          <div className="tbl-foot">
            {tbl.footBefore}
            <b>{tbl.footHighlight}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
