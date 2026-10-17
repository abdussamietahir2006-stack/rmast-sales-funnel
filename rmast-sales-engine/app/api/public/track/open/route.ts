import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/pipeline";
import { verifySignedValue } from "@/lib/signing";

/**
 * The open-tracking pixel embedded in every email the app sends. Loading it
 * records an open on that message. It always answers with the same 1x1
 * transparent GIF, valid token or not, so it never shows a broken image.
 *
 * Opens are approximate by nature: some clients block images (missed opens)
 * and Apple Mail pre-loads them (early opens). A load within the first
 * seconds after sending is the mail provider or the sender's own Sent folder,
 * not the recipient, so it's ignored.
 */

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const IGNORE_FIRST_MS = 30_000;

function gif() {
    return new Response(PIXEL, {
        headers: {
            "Content-Type": "image/gif",
            "Content-Length": String(PIXEL.length),
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
        },
    });
}

export async function GET(request: Request) {
    try {
        const messageId = verifySignedValue("open", new URL(request.url).searchParams.get("t"));
        if (!messageId || !ObjectId.isValid(messageId)) return gif();

        const db = await getDb();
        const _id = new ObjectId(messageId);
        const message = await db.collection("messages").findOne({ _id }, { projection: { sentAt: 1, leadId: 1, firstOpenedAt: 1 } });
        if (!message) return gif();
        if (Date.now() - Date.parse(message.sentAt) < IGNORE_FIRST_MS) return gif();

        const now = new Date().toISOString();
        await db.collection("messages").updateOne(
            { _id },
            { $inc: { openCount: 1 }, $set: { lastOpenedAt: now } }
        );
        if (!message.firstOpenedAt) {
            const first = await db
                .collection("messages")
                .updateOne({ _id, firstOpenedAt: { $exists: false } }, { $set: { firstOpenedAt: now } });
            if (first.modifiedCount === 1) {
                await logActivity(db, String(message.leadId), "email_opened", "Email was opened");
            }
        }
    } catch (error) {
        console.error("[track/open]", error);
    }
    return gif();
}
