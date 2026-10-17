import { redirect } from "next/navigation";

/**
 * There is no public landing page: the root sends everyone to the login
 * screen. The app holds the company's lead and client data, so the only way
 * in is through a sign-in. (Prospects never come here; they get direct links
 * to /audit/... and /demo/... pages, which stay public.)
 */
export default function Home() {
    redirect("/login");
}
