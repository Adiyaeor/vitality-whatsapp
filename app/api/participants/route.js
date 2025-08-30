import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// צורת נתונים אחידה לעמוד
export type Participant = { id: string; name: string; phone: string };
export type ClassRow = { id: string; title: string; start: string; coach?: string; participants: Participant[] };
export type ParticipantsResponse = { date: string; classes: ClassRow[] };

// הוספתי את הפונקציה הזו כדי לאתר לוגים בזמן אמת
async function fetchParticipants(fromDate: string, toDate: string) {
  console.log(`Fetching data for fromDate: ${fromDate} toDate: ${toDate}`);  // לוג של התחלת הבקשה
  
  const url = `https://api.arboxapp.com/index.php/api/v2/reports/shiftSummaryReport`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-key": process.env.ARBOX_API_KEY || "", // ודא שהמפתח API מוגדר נכון
  };

  const body = JSON.stringify({ fromDate, toDate });
  const res = await fetch(url, { method: "POST", headers, body });

  console.log(`Response Status: ${res.status}`);  // לוג של סטטוס התגובה (לראות אם 200/500 וכו')
  
  if (!res.ok) {
    throw new Error(`Error fetching data: ${res.statusText}`);
  }

  return await res.json();
}

function toIL(raw: string) {
  const d = raw.replace(/\D+/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return "972" + d;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const fromDate = `${date}T00:00:00Z`;
    const toDate = `${date}T23:59:59Z`;

    // קריאה ל־API
    const data = await fetchParticipants(fromDate, toDate);

    // מיפוי נתונים לתצורה אחידה
    const participants = data.data.map((r: any) => {
      const phone = toIL(r.phone || r.additional_phone || "");
      if (!phone) return null;

      const start = `${date}T${r.time}:00`;
      return {
        id: `${r.schedule_id}-${phone}`,
        name: `${r.first_name || ""} ${r.last_name || ""}`,
        phone,
      };
    }).filter(Boolean);

    const simplified = participants.map((p: any) => ({
      ...p,
      schedule_id: p.id,
    }));

    return NextResponse.json(
      {
        ok: true,
        date,
        participants: simplified,
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: true, message: err.message || "server error" }),
      { status: 500 }
    );
  }
}
