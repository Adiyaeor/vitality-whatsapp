export const dynamic = "force-dynamic"; // אל תשמר בקאש

function fmt(d) {
  // פורמט לפי דרישת Arbox: dd-mm-YYYY
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function getRange(when) {
  const now = new Date();
  let day = new Date(now);
  if (when === "yesterday") day.setDate(now.getDate() - 1);
  else if (when === "tomorrow") day.setDate(now.getDate() + 1);
  // ברירת מחדל: today
  const f = fmt(day);
  return { from: f, to: f };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const when = searchParams.get("when") || "today";
    const token = searchParams.get("t") || "";

    // אימות טוקן של מאמן
    const tokens = JSON.parse(process.env.COACH_TOKENS || "{}");
    const coaches = JSON.parse(process.env.COACH_MAP || "{}");
    const coachId = tokens[token];
    if (!coachId) {
      return new Response(JSON.stringify({ error: true, message: "invalid token" }), { status: 401 });
    }

    // בניית טווח תאריכים לפורמט של Arbox
    const range = getRange(when);

    // קריאה ל-Arbox לפי הדוקומנטציה: POST + כותרת apiKey + גוף JSON
    const res = await fetch("https://api.arboxapp.com/index.php/api/v2/schedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apiKey": process.env.ARBOX_API_KEY || ""
      },
      body: JSON.stringify({
        from: range.from,
        to: range.to,
        location: Number(process.env.ARBOX_LOCATION_ID || 1),
        booked_users: true // שיחזיר גם משתתפים (אם קיים אצלך בחשבון)
      }),
      // Vercel: כדאי לאפשר יציאה לרשת
      cache: "no-store"
    });

    // אם Arbox החזיר שגיאה, נחזיר את הטקסט כדי שנראה מה לא טוב
    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: true, message: `Arbox ${res.status}`, details: text }), { status: 502 });
    }

    const data = await res.json(); // {statusCode, data: [...]}

    // נחזיר זמנית את התשובה הגולמית כדי לראות שכל טוב
    return new Response(JSON.stringify({ ok: true, coach: coachId, when, arbox: data }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: err?.message || "server error" }), { status: 500 });
  }
}
