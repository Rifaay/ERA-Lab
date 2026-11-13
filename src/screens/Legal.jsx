import { legal, UPDATED } from "../legal";

export default function Legal({ lang }) {
  const l = legal[lang];
  return (
    <div className="screen legal">
      <h2>{l.title}</h2>
      <p className="muted">{l.updated.replace("{date}", UPDATED)}</p>
      {l.sections.map((s) => (
        <section key={s.h} className="card">
          <h3 className="card-title">{s.h}</h3>
          {s.p.map((t) => <p key={t}>{t}</p>)}
        </section>
      ))}
    </div>
  );
}
