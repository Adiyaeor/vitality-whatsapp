export const dynamic = "force-dynamic"; // אל תשמר בקאש

// dd-mm-YYYY - כמו ש-Arbox מצפים
function fmt(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// today / tomorrow / yesterday
function getRange(when) {
  const now = new Date();
  const day = new Date(now);
  if (when === "yesterday") day.setDate(now.getDate() - 1);
  else if (when === "tomorrow") day.setDate(now.getDate() + 1);
  const f = fmt(day);
  return { from: f, to: f };
}

// בקשה ל-Arbox (עם וריאציות כותרת לאימות)
async function callArbox(headersVariant, body) {
  return fetch("https://api.arboxapp.com/index.php/api/v2/reports/shiftSummaryReport", {
    method: "POST",
    headers: headersVariant,
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

// ניסיון להוציא מזה את שם/זהות המדריך והמשתתפים – גמיש לשמות שדות שונים
function normalizeItem(row) {
  const coachName =
    row?.coach_name ||
    row?.trainer ||
    row?.instructor ||
    row?.staffName ||
    row?.coach ||
    "";

  // לפעמים הרשימה יושבת בשדות שונים – ננסה כמה וריאציות
  const participants =
    row?.participants ||
    row?.booked_users ||
    row?.clients ||
    row?.users ||
    row?.attendees ||
    [];

  return { coachName, participants, raw: row };
}

// סינון ע"י שם מאמן בהתאם ל-COACH_MAP שלך (array של שמות לכל מאמן)
function rowMatchesCoach(row, allowedNames = []) {
  const { coachName } = normalizeItem(row);
  if (!allowedNames.length) return true; // אם לא הוגדרו שמות—אל תסנן
  const ref = (coachName || "").toString().trim().toLowerCase();
  return allowedNames.some(n => ref.includes(n.toString().trim().toLowerCase()));
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const when = searchParams.get("when") || "today";
    const token = searchParams.get("t") || "";

    // אימות טוקן והבאת מיפוי שמות המאמן/ת
    const tokens = JSON.parse(process.env.COACH_TOKENS || "{}");   // { "DN123": "coach-1", ... }
    const coaches = JSON.parse(process.env.COACH_MAP || "{}");     // { "coach-1": ["דניאל"], ... }
    const coachId = tokens[token];
    if (!coachId) {
      return new Response(JSON.stringify({ error: true, message: "invalid token" }), { status: 401 });
    }
    const allowedNames = Array.isArray(coaches[coachId]) ? coaches[coachId] : [];

    // טווח התאריכים
    const { from, to } = getRange(when);

    // גוף הבקשה לפי ההנחיה של הקבוצה
    const body = { fromDate: from, toDate: to };

    const apiKey = (process.env.ARBOX_API_KEY || "").trim();

    // ננסה קודם x-api-key, ואם צריך ניפול ל-ApiKey (שינוי רישיות)
    const headerVariants = [
      { "Content-Type": "application/json", Accept: "application/json", "x-api-key": apiKey },
      { "Content-Type": "application/json", Accept: "application/json", ApiKey: apiKey },
    ];

    let lastText = "";
    let res;
    for (const hv of headerVariants) {
      res = await callArbox(hv, body);
      if (res.ok) break;
      lastText = await res.text().catch(() => "");
    }

    if (!res || !res.ok) {
      return new Response(
        JSON.stringify({ error: true, message: `Arbox ${res?.status ?? "unknown"}`, details: lastText }),
        { status: 502 }
      );
    }

    const data = await res.json(); // מבנה התשובה בדו"ח—Arbox קובעים
    // ננסה לנרמל למבנה צפוי: מערך של שורות דוח תחת data או rows וכו'
    const rows =
      Array.isArray(data) ? data :
      Array.isArray(data?.data) ? data.data :
      Array.isArray(data?.rows) ? data.rows :
      Array.isArray(data?.result) ? data.result :
      [];

    // סינון לפי המאמן
    const filtered = nofilter ? rows : rows.filter(r => rowMatchesCoach(r, allowedNames));

    // שליפה "חכמה" של רשימות משתתפים מתוך השדות הנפוצים
    const participants = filtered.flatMap(r => {
      const norm = normalizeItem(r);
      const list = Array.isArray(norm.participants) ? norm.participants : [];
      return list;
    });

    // מחזירים גם נתונים גולמיים (לעזרה בדיבוג מול Arbox) וגם את התמצית למאמן
    return new Response(
      JSON.stringify({
        ok: true,
        when,
        coach: coachId,
        dateRange: { from, to },
        count: participants.length,
        participants,
        // להשוואה/תמיכה: השורה הגולמית והמאמן ש-Arbox מציינים
        raw: filtered.map(normalizeItem),
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: err?.message || "server error" }), { status: 500 });
  }
}
