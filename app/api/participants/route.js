import { NextResponse } from "next/server";

const TZ = "Asia/Jerusalem";

function fmtDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfDayLocal(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = Number(parts.find(p => p.type === "year").value);
  const m = Number(parts.find(p => p.type === "month").value);
  const d = Number(parts.find(p => p.type === "day").value);
  const base = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base;
}
function rangeFor(when) {
  if (when === "yesterday") { const s = startOfDayLocal(-1); return { from: fmtDateISO(s), to: fmtDateISO(s) }; }
  if (when === "tomorrow") { const s = startOfDayLocal(1);  return { from: fmtDateISO(s), to: fmtDateISO(s) }; }
  const s = startOfDayLocal(0); return { from: fmtDateISO(s), to: fmtDateISO(s) };
}

function safeJSON(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
const COACH_MAP   = safeJSON(process.env.COACH_MAP)   || {};
const COACH_TOKENS= safeJSON(process.env.COACH_TOKENS)|| {};

function coachFromToken(t) {
  const coachId = COACH_TOKENS[t];
  if (!coachId) return null;
  const names = COACH_MAP[coachId] || [];
  return { id: coachId, names };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const when  = searchParams.get("when") || "today";
    const token = searchParams.get("t") || "";
    const coach = coachFromToken(token);
    if (!coach) return NextResponse.json({ error: true, message: "invalid token" }, { status: 401 });

    const { from, to } = rangeFor(when);
    const items = await arboxSchedule({ from, to });
    const flat  = mapSchedule(items);
    const filtered = filterByCoach(flat, coach);
    filtered.sort((a,b) => `${a.class_date} ${a.class_time}`.localeCompare(`${b.class_date} ${b.class_time}`) || a.name.localeCompare(b.name,"he"));

    return NextResponse.json(filtered, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: true, message: e.message || "server error" }, { status: 500 });
  }
}

async function arboxSchedule({ from, to }) {
  const base = process.env.ARBOX_BASE_URL || "https://api.arboxapp.com/index.php";
  const url  = `${base}/api/v2/schedule`;
  const body = { from, to, booked_users: true };
  if (process.env.ARBOX_LOCATION_ID) body.location = Number(process.env.ARBOX_LOCATION_ID);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apiKey: process.env.ARBOX_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Arbox ${res.status}`);
  return res.json();
}

function mapSchedule(json) {
  const arr = Array.isArray(json) ? json : json?.data || [];
  const out = [];
  for (const cls of arr) {
    const className = cls.name || cls.class_name || cls.title || "שיעור";
    const classDate = cls.date || cls.class_date || "";
    const classTime = cls.startTime || cls.class_time || cls.start_time || "";
    const instructor = cls.instructor_name || cls.trainer_name || cls.teacher_name || "";
    const users = cls.booked_users || cls.users || [];
    for (const u of users) {
      const id    = String(u.id || u.user_id || `${cls.id || cls.class_id}-${u.email || u.phone || Math.random()}`);
      const name  = u.full_name || u.name || `${u.first_name || ""} ${u.last_name || ""}`.trim();
      const phone = u.phone || u.mobile_phone || u.mobile || u.cellphone || "";
      out.push({ id, name, phone, class_name: className, class_date: classDate, class_time: classTime, instructor });
    }
  }
  return out;
}
function filterByCoach(list, coach) {
  const keys = (coach?.names || []).map(s => String(s).toLowerCase());
  if (!keys.length) return list;
  return list.filter(p => keys.some(k => String(p.instructor || "").toLowerCase().includes(k)));
}
