import { useEffect, useState } from "react";
import { listFormFields } from "../lib/ops";
import type { FieldInfo } from "../lib/types";
import { useStore } from "../state/store";

export default function FormsPanel() {
  const bytes = useStore((s) => s.bytes);
  const docVersion = useStore((s) => s.docVersion);
  const busy = useStore((s) => s.busy);
  const applyFormValues = useStore((s) => s.applyFormValues);

  const [fields, setFields] = useState<FieldInfo[] | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setFields(null);
    setValues({});
    if (!bytes) return;
    listFormFields(bytes).then((f) => {
      if (!cancelled) setFields(f);
    });
    return () => {
      cancelled = true;
    };
  }, [bytes, docVersion]);

  const set = (name: string, v: string | boolean) => setValues((old) => ({ ...old, [name]: v }));
  const pendingCount = Object.keys(values).length;

  const apply = async () => {
    if (pendingCount) await applyFormValues(values);
  };

  if (!fields) return <aside className="side-panel">Lendo campos…</aside>;

  return (
    <aside className="side-panel">
      <h3>📝 Formulário</h3>
      {fields.length === 0 && <p className="muted">Este PDF não tem campos de formulário (AcroForm).</p>}
      {fields.map((f) => {
        const cur = values[f.name] ?? f.value;
        switch (f.type) {
          case "text":
            return (
              <label key={f.name} className="form-field">
                <span>{f.name}</span>
                {f.multiline ? (
                  <textarea value={String(cur)} onChange={(e) => set(f.name, e.target.value)} rows={3} />
                ) : (
                  <input type="text" value={String(cur)} onChange={(e) => set(f.name, e.target.value)} />
                )}
              </label>
            );
          case "checkbox":
            return (
              <label key={f.name} className="form-field form-check">
                <input type="checkbox" checked={Boolean(cur)} onChange={(e) => set(f.name, e.target.checked)} />
                <span>{f.name}</span>
              </label>
            );
          case "radio":
          case "dropdown":
          case "option-list":
            return (
              <label key={f.name} className="form-field">
                <span>{f.name}</span>
                <select value={String(cur)} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            );
          default:
            return (
              <div key={f.name} className="form-field muted">
                {f.name} (tipo não suportado)
              </div>
            );
        }
      })}
      {fields.length > 0 && (
        <button className="primary" onClick={apply} disabled={!pendingCount || !!busy}>
          Aplicar no PDF {pendingCount ? `(${pendingCount})` : ""}
        </button>
      )}
    </aside>
  );
}
