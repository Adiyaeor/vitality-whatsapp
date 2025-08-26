export const dynamic = "force-dynamic"; // אל תשמור בקאש

/** ---------- עזר: תאריכים בפורמט ש-Arbox ביקשו (YYYY-MM-DD) ---------- */
function fmtYMD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** today / tomorrow / yesterday ⇒ טווח [fromDate, toDate] */
function getRange(when) {
  const now = new Date();
  const day = new Date(now);

  if (when === "yesterday") day.setDate(day.getDate() - 1);
  else if (when === "tomorrow") day.setDate(day.getDate() + 1);
  // ברירת מחדל: today

  // לפי הדוגמה מהקבוצה – ליום מסוים שולחים fromDate=היום, toDate=מחר
  const fromDate = fmtYMD(day);
  const toDate = fmtYMD(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
  return { fromDate, toDate };
}

/** קריאה לארבוקס (ננסה כמה וריאציות של הכותרת של המפתח) */
async function callArbox(headersVariant, body) {
  return fetch("https://api.arboxapp.com/index.php/api/v2/reports/shiftSummaryReport", {
    method: "POST",
    headers: headersVariant,
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

/** ---------- ה־API שלנו ---------- */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const when = searchParams.get("when") || "today";
    const token = searchParams.get("t") || "";
    const nofilter = searchParams.has("nofilter"); // ?nofilter=1 יחזיר הכל בלי סינון לפי מאמן
    const raw = searchParams.has("raw");          // ?raw=1 יחזיר את תשובת Arbox כמו שהיא

    // 1) אימות טוקן ומיפוי למאמן
    const tokens = JSON.parse(process.env.COACH_TOKENS || "{}");
    const coachMap = JSON.parse(process.env.COACH_MAP || "{}");
    const coachId = tokens[token];
    if (!coachId && !nofilter) {
      return new Response(
        JSON.stringify({ error: true, message: "invalid token" }),
        { status: 401 }
      );
    }

    // 2) בניית גוף הבקשה לפי מה שקיבלת מהקבוצה
    const { fromDate, toDate } = getRange(when);
    const apiKey = (process.env.ARBOX_API_KEY || "").trim();

    const body = { fromDate, toDate };

    // 3) וריאציות של כותרות מפתח – x-api-key / ApiKey / apiKey
    const headerVariants = [
      { "Content-Type": "application/json", Accept: "application/json", "x-api-key": apiKey },
      { "Content-Type": "application/json", Accept: "application/json", ApiKey: apiKey },
      { "Content-Type": "application/json", Accept: "application/json", apiKey: apiKey },
    ];

    let res;
    let lastText = "";
    for (const hv of headerVariants) {
      res = await callArbox(hv, body);
      if (res.ok) break;
      lastText = await res.text().catch(() => "");
    }

    if (!res || !res.ok) {
      return new Response(
        JSON.stringify({
          error: true,
          message: `Arbox ${res?.status ?? "unknown"}`,
          details: lastText,
        }),
        { status: 502 }
      );
    }

    // 4) פירוק תשובת Arbox
    const arbox = await res.json(); // בדרך כלל שדה data: [...]
    const list = Array.isArray(arbox?.data) ? arbox.data : Array.isArray(arbox) ? arbox : [];

    if (raw) {
      // החזרה גולמית לצורך דיבוג
      return new Response(JSON.stringify({ ok: true, coach: coachId ?? null, when, arbox }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 5) סינון לפי המאמן (אלא אם ביקשת nofilter)
    let filtered = list;
    if (!nofilter) {
      const aliases = (coachMap[coachId] || []).map((s) => String(s).trim()).filter(Boolean);
      filtered = list.filter((row) => {
        const full = (row.coach_full_name || "").trim();
        return aliases.length === 0 ? true : aliases.some((a) => full.includes(a));
      });
    }

    // 6) החזרה “ידידותית” – אפשר לשנות לפי הצורך
    const simplified = filtered.map((r) => ({
      time: r.time ?? null,
      first_name: r.first_name ?? null,
      last_name: r.last_name ?? null,
      phone: r.phone ?? null,
      coach: r.coach_full_name ?? null,
      location: r.schedule_location ?? r.location ?? null,
      schedule_id: r.schedule_id ?? null,
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        coach: coachId ?? null,
        when,
        fromDate,
        toDate,
        count: simplified.length,
        participants: simplified,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: true, message: err?.message || "server error" }),
      { status: 500 }
    );
  }
}
