export const dynamic = "force-dynamic";

function fmt(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`; // dd-mm-YYYY
}

function getRange(when) {
  const now = new Date();
  let day = new Date(now);
  if (when === "yesterday") day.setDate(now.getDate() - 1);
  else if (when === "tomorrow") day.setDate(now.getDate() + 1);
  const f = fmt(day);
  return { from: f, to: f };
}

async function callArbox(headersVariant, body) {
  return fetch("https://api.arboxapp.com/index.php/api/v2/schedule", {
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

    // validate coach token
    const tokens = JSON.parse(process.env.COACH_TOKENS || "{}");
    const coaches = JSON.parse(process.env.COACH_MAP || "{}");
    const coachId = tokens[token];
    if (!coachId) {
      return new Response(JSON.stringify({ error: true, message: "invalid token" }), { status: 401 });
    }

    const { from, to } = getRange(when);
    const apiKey = (process.env.ARBOX_API_KEY || "").trim();
    const location = Number(process.env.ARBOX_LOCATION_ID || 1);

    const body = { from, to, location, booked_users: true };

    // 1) primary: x-api-key
    let res = await callArbox(
      {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body
    );

    // 2) fallback: ApiKey (רישיות שונות)
    if (!res.ok) {
      const text = await res.text();
      // ננסה fallback רק אם נראה כמו כשל אימות/500
      if (res.status === 401 || res.status === 403 || res.status === 500) {
        res = await callArbox(
          {
            "Content-Type": "application/json",
            "ApiKey": apiKey,
          },
          body
        );
        if (!res.ok) {
          const text2 = await res.text();
          return new Response(
            JSON.stringify({ error: true, message: `Arbox ${res.status}`, details: text2 }),
            { status: 502 }
          );
        }
      } else {
        return new Response(JSON.stringify({ error: true, message: `Arbox ${res.status}`, details: text }), {
          status: 502,
        });
      }
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, coach: coachId, when, arbox: data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: err?.message || "server error" }), { status: 500 });
  }
}
