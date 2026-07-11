import { en } from "@/messages/en";

export default function NumbersStrip() {
  const items = en.numbersStrip;
  return (
    <div className="nums">
      <div className="wrap nb">
        {items.map((item, i) => (
          <div key={i} className="nc rv">
            <span className={`n ${item.tone === "true" ? "tr2" : "ik"} mono`}>
              {item.value}
            </span>
            <span className="d">{item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
