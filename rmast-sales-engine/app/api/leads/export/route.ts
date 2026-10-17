import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function escapeCsv(value: unknown): string {
    const text = String(value ?? "");
    // A leading =, +, - or @ is executed as a formula when the CSV is opened
    // in Excel or Sheets. Prefix it so an injected value stays inert text.
    const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${guarded.replace(/"/g, '""')}"`;
}

const COLUMNS = [
    "companyName",
    "niche",
    "market",
    "location",
    "website",
    "phone",
    "email",
    "status",
    "growthScore",
    "contactMethod",
    "optedOut",
    "createdAt",
] as const;

export async function GET() {
    try {
        const db = await getDb();

        const cursor = db.collection("leads").find(
            {},
            {
                projection: Object.fromEntries(COLUMNS.map((c) => [c, 1])),
                sort: { createdAt: -1 },
            }
        );

        const lines = [COLUMNS.join(",")];
        for await (const lead of cursor) {
            lines.push(COLUMNS.map((column) => escapeCsv(lead[column])).join(","));
        }

        const filename = `rmast-leads-${new Date().toISOString().slice(0, 10)}.csv`;

        return new NextResponse(lines.join("\n"), {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("[leads/export]", error);
        return NextResponse.json({ error: "Export failed" }, { status: 500 });
    }
}
