import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLead } from "@/lib/pipeline";
import { suppressLead } from "@/lib/send";
import { verifySignedValue } from "@/lib/signing";

const PAGE = (heading: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070C0E;
       color:#e2e8f0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
  .card{max-width:32rem;padding:2.5rem;border:1px solid #132E32;border-radius:12px;
        background:#091215;text-align:center}
  h1{margin:0 0 .75rem;font-size:1.25rem;color:#fff}
  p{margin:0;color:#94a3b8;font-size:.9rem}
</style></head>
<body><div class="card"><h1>${heading}</h1><p>${body}</p></div></body></html>`;

function html(heading: string, body: string, status = 200) {
    return new NextResponse(PAGE(heading, body), {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
}

async function unsubscribe(token: string | null) {
    const leadId = verifySignedValue("unsubscribe", token);
    if (!leadId) {
        return html(
            "Link not recognised",
            "This unsubscribe link is invalid or has expired.",
            400
        );
    }

    const db = await getDb();
    const lead = await getLead(db, leadId);
    if (!lead) {
        return html("Already removed", "There is nothing left to unsubscribe.", 404);
    }

    await suppressLead(db, leadId, lead.email, "unsubscribe link");

    return html(
        "You've been unsubscribed",
        "We won't contact you again. Sorry for the interruption."
    );
}

export async function GET(request: Request) {
    const token = new URL(request.url).searchParams.get("token");
    return unsubscribe(token);
}

/**
 * Gmail and Yahoo require bulk senders to honour one-click unsubscribe, which
 * arrives as a POST to the List-Unsubscribe URL.
 */
export async function POST(request: Request) {
    const token = new URL(request.url).searchParams.get("token");
    return unsubscribe(token);
}
