export const dynamic = "force-dynamic"; // אל תשמור בקאש

function fmtYMD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getRange(when) {
  const now = new Date();
  const day = new Date(now);

  if (when === "yesterday") day.setDate(day.getDate() - 1);
  else if (when === "tomorrow") day.setDate(day.getDate() + 1);

  const fromDate = fmtYMD(day);
  const toDate = fmtYMD(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
  return { fromDate, toDate };
}

async function callArbox(url, headersVariant, body) {
  return fetch(url, {
    method: "POST",
    headers: headersVariant,
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const when = searchParams.get("when") || "today";
    const token = searchParams.get("t") || "";
    const nofilter = searchParams.has("nofilter");
    const raw = searchParams.has("raw");

    const tokens = JSON.parse(process.env.COACH_TOKENS || "{}");
    const coachMap = JSON.parse(process.env.COACH_MAP || "{}");
    const coachId = tokens[token];
    if (!coachId && !nofilter) {
      return new Response(JSON.stringify({ error: true, message: "invalid token" }), { status: 401 });
    }

    const { fromDate, toDate } = getRange(when);
    const apiKey = (process.env.ARBOX_API_KEY || "").trim();
    const locationId = Number(process.env.ARBOX_LOCATION_ID || 16681);

    // נבנה גוף בקשה עם כמה תיבות אפשריות למיקום + תאריכים
    const baseBody = { fromDate, toDate };
    const bodies = [
      { ...baseBody, location_box_id: locationId },
      { ...baseBody, locationId },
      { ...baseBody, location_fk: locationId },
      { ...baseBody, location: locationId },
    ];

    // ננסה כמה וריאציות של כותרות מפתח
    const headerVariants = [
      { "Content-Type": "application/json", Accept: "application/json", "x-api-key": apiKey },
      { "Content-Type": "application/json", Accept: "application/json", ApiKey: apiKey },
      { "Content-Type": "application/json", Accept: "application/json", apiKey: apiKey },
    ];

    // ננסה גם 2 כתובות אפשריות (אם הדוח פתאום מוגדר אחרת בסביבה שלך)
    const urls = [
      "https://api.arboxapp.com/index.php/api/v2/reports/shiftSummaryReport",
      "https://api.arboxapp.com/index.php/api/v2/schedule",
    ];

    let res;
    let lastText = "";
    let tried = [];

    outer: for (const url of urls) {
      for (const hv of headerVariants) {
        for (const body of bodies) {
          res = await callArbox(url, hv, body);
          tried.push({ url, headers: Object.keys(hv), body });
          if (res.ok) break outer;
          lastText = await res.text().catch(() => "");
        }
      }
    }

    if (!res || !res.ok) {
      return new Response(
        JSON.stringify({
          error: true,
          message: `Arbox ${res?.status ?? "unknown"}`,
          details: lastText,
          tried,
        }),
        { status: 502 }
      );
    }

    const arbox = await res.json();
    const list = Array.isArray(arbox?.data) ? arbox.data : Array.isArray(arbox) ? arbox : [];

    if (raw) {
      return new Response(JSON.stringify({ ok: true, coach: coachId ?? null, when, arbox }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let filtered = list;
    if (!nofilter) {
      const aliases = (coachMap[coachId] || []).map((s) => String(s).trim()).filter(Boolean);
      filtered = list.filter((row) => {
        const full = (row.coach_full_name || "").trim();
        return aliases.length === 0 ? true : aliases.some((a) => full.includes(a));
      });
    }

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
        locationId,
        count: simplified.length,
        participants: simplified,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: err?.message || "server error" }), { status: 500 });
  }
}