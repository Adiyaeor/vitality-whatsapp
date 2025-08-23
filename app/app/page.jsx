"use client";
import { useEffect, useState } from "react";

function normalizePhone(phone, defaultCountry = "972") {
  if (!phone) return "";
  let d = String(phone).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0")) d = defaultCountry + d.slice(1);
  return d;
}
function waLink(phone, text) {
  const number = normalizePhone(phone);
  const msg = encodeURIComponent(text || "");
  return `https://wa.me/${number}?text=${msg}`;
}
function tHe(d) {
  return d.toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

const WHEN = { today: "היום", tomorrow: "מחר", yesterday: "אתמול" };

export default function Page() {
  const [when, setWhen] = useState("today");
  const [data, setData] = useState([]);
  const [messages, setMessages] = useState({});
  const [fetchedAt, setFetchedAt] = useState(null);
  const [err, setErr] = useState("");
  const [template, setTemplate] = useState("custom"); // custom | before | after

  useEffect(() => {
    let canceled = false;
    async function load() {
      setErr("");
      try {
        const url = `/api/participants?when=${when}&t=${encodeURIComponent(getToken())}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("תקלה בטעינה");
        const items = await res.json();
        if (canceled) return;
        setData(items || []);
        setFetchedAt(Date.now());
        const seed = {};
        (items || []).forEach((p) => {
          if (template === "before") seed[p.id] = beforeTpl(p);
          else if (template === "after") seed[p.id] = afterTpl(p);
          else seed[p.id] = messages[p.id] || "";
        });
        setMessages(seed);
      } catch (e) {
        if (!canceled) setErr(e.message || "שגיאה");
      }
    }
    load();
    return () => (canceled = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when]);

  function onTemplateChange(val) {
    setTemplate(val);
    const next = { ...messages };
    data.forEach((p) => {
      if (val === "before") next[p.id] = beforeTpl(p);
      else if (val === "after") next[p.id] = afterTpl(p);
    });
    setMessages(next);
  }

  return (
    <div className="min-h-screen" style={{ padding: 16, direction: "rtl" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 6 }}>היי מאמן/ת,</h1>
        <p style={{ color: "#555", marginBottom: 6 }}>
          אלו המתאמנים שלך {WHEN[when]}.
          {fetchedAt && <span> נכון לשעה {tHe(new Date(fetchedAt))}</span>}
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 16px" }}>
          {Object.entries(WHEN).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setWhen(k)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: when === k ? "#eee" : "#fff",
              }}
            >
              {v}
            </button>
          ))}

          <div style={{ marginInlineStart: "auto" }} />

          <span style={{ alignSelf: "center", color: "#666", fontSize: 14 }}>טקסט שבלוני:</span>
          {[
            { v: "custom", l: "ללא" },
            { v: "before", l: "לפני שיעור" },
            { v: "after", l: "אחרי שיעור" },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => onTemplateChange(o.v)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: template === o.v ? "#eee" : "#fff",
              }}
            >
              {o.l}
            </button>
          ))}
        </div>

        {err && (
          <div
            style={{
              background: "#fdecea",
              border: "1px solid #f5c2c7",
              color: "#b42318",
              padding: 12,
              borderRadius: 12,
            }}
          >
            {err}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 0" }}>
          <div style={{ color: "#666", fontSize: 14 }}>נמצאו {data.length} מתאמנים/ות</div>
          <button
            onClick={() => sendAll(data, messages)}
            style={{ padding: "8px 12px", borderRadius: 14, background: "#000", color: "#fff", border: 0 }}
          >
            שלח/י לכולן.ם
          </button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {data.map((p) => (
            <div key={p.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ color: "#666", fontSize: 13 }}>
                    {p.class_name} • {p.class_time}
                  </div>
                  <div style={{ color: "#666", fontSize: 13, direction: "ltr" }}>{p.phone}</div>
                </div>
                <a
                  href={waLink(p.phone, messages[p.id] || "")}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    alignSelf: "flex-start",
                    padding: "8px 12px",
                    borderRadius: 14,
                    border: "1px solid #ddd",
                    textDecoration: "none",
                    color: "#111",
                  }}
                >
                  שלח/י ב‑WhatsApp
                </a>
              </div>
              <textarea
                value={messages[p.id] || ""}
                onChange={(e) => setMessages((m) => ({ ...m, [p.id]: e.target.value }))}
                placeholder="כתבי כאן הודעה אישית…"
                style={{ marginTop: 8, width: "100%", minHeight: 70, borderRadius: 12, border: "1px solid #e5e7eb", padding: 10 }}
              />
            </div>
          ))}
        </div>

        <p style={{ marginTop: 18, color: "#777", fontSize: 12 }}>
          הערה: ההודעה תישלח מהחשבון שמחובר כרגע למכשיר/WhatsApp Web. לכל מאמן/ת קישור אישי עם טוקן סודי.
        </p>
      </div>
    </div>
  );
}

function beforeTpl(p) {
  return `היי ${p.name} 🙂 מזכירה שמחר ב-${p.class_time} את/ה רשום/ה ל-${p.class_name}. הכל בסדר?`;
}
function afterTpl(p) {
  return `היי ${p.name}! איך היה אתמול ב-${p.class_name}? אשמח לשמוע איך הרגשת.`;
}
function getToken() {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get("t") || "";
}
function sendAll(list, messages) {
  if (!confirm("לשלוח לכולם/ן? זה יפתח מספר חלונות וואטסאפ.")) return;
  let delay = 0;
  list.forEach((p) => {
    const link = waLink(p.phone, messages[p.id] || "");
    setTimeout(() => window.open(link, "_blank"), delay);
    delay += 400;
  });
}
