export default function Page() {
  return (
    <div style={{ padding: 20, direction: "rtl", fontFamily: "system-ui" }}>
      זה עובד ✅ — דף הבית נטען
    </div>
  );
}
"use client";
import { useEffect, useState } from "react";

function buildWaLink(phone: string, msg: string) {
  // wa.me דורש מספר בפורמט בינלאומי ללא +
  const text = encodeURIComponent(msg);
  return `https://wa.me/${phone}?text=${text}`;
}

export default function Page() {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(d: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/participants?date=${d}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(date);
  }, [date]);

  return (
    <main className="mx-auto max-w-4xl p-6" dir="rtl">
      <h1 className="text-2xl font-bold mb-4">רשימת מתאמנים בזמן אמת</h1>

      <div className="flex gap-3 items-center mb-6">
        <label className="text-sm">תאריך</label>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); load(e.target.value); }} className="border rounded px-3 py-2" />
      </div>

      {loading && <p>טוען…</p>}
      {error && <p className="text-red-600">שגיאה: {error}</p>}

      {data?.participants?.map((p: any) => (
        <section key={p.id} className="mb-8 border rounded-2xl p-4 shadow-sm">
          <header className="mb-3">
            <h2 className="text-xl font-semibold">{p.name}</h2>
          </header>
          <textarea placeholder="כתבו כאן הודעה אישית…" className="border rounded-lg p-3 w-full md:w-[36ch]" id={`msg-${p.id}`} />
          <a
            onClick={(e) => {
              const ta = document.getElementById(`msg-${p.id}`) as HTMLTextAreaElement | null;
              const msg = ta?.value || "היי, רק מזכיר/ה את השיעור הקרוב.";
              const href = buildWaLink(p.phone, msg);
              (e.currentTarget as HTMLAnchorElement).setAttribute("href", href);
            }}
            href="#"
            target="_blank"
            className="bg-green-600 text-white px-4 py-2 rounded-xl shadow text-center"
          >
            שלח
          </a>
        </section>
      ))}

      {!loading && data?.participants?.length === 0 && (
        <p>אין מתאמנים בתאריך שנבחר.</p>
      )}
    </main>
  );
}
