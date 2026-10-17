"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const MIN_PASSWORD_LENGTH = 12;

export default function SettingsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const [companyName, setCompanyName] = useState("");
    const [website, setWebsite] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [instagram, setInstagram] = useState("");
    const [facebook, setFacebook] = useState("");
    const [linkedin, setLinkedin] = useState("");
    const [autoSendEnabled, setAutoSendEnabled] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState("");
    const [passwordFailed, setPasswordFailed] = useState(false);

    useEffect(() => {
        async function fetchSettings() {
            const res = await fetch("/api/settings");
            const data = await res.json();
            const s = data.settings;
            if (s) {
                setCompanyName(s.companyName || "");
                setWebsite(s.website || "");
                setContactEmail(s.contactEmail || "");
                setPhone(s.phone || "");
                setWhatsapp(s.whatsapp || "");
                setInstagram(s.instagram || "");
                setFacebook(s.facebook || "");
                setLinkedin(s.linkedin || "");
                setAutoSendEnabled(s.autoSendEnabled === true);
            }
            setLoading(false);
        }
        fetchSettings();
    }, []);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setSaved(false);

        await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                companyName,
                website,
                contactEmail,
                phone,
                whatsapp,
                instagram,
                facebook,
                linkedin,
                autoSendEnabled,
            }),
        });

        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        setPasswordMessage("");
        setPasswordFailed(false);

        if (newPassword !== confirmPassword) {
            setPasswordMessage("New passwords do not match.");
            setPasswordFailed(true);
            return;
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            setPasswordMessage(
                `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
            );
            setPasswordFailed(true);
            return;
        }

        setChangingPassword(true);

        const res = await fetch("/api/settings/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        const data = await res.json();

        if (!res.ok) {
            setPasswordMessage(data.error || "Something went wrong.");
            setPasswordFailed(true);
            setChangingPassword(false);
            return;
        }

        setPasswordMessage(data.message);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setChangingPassword(false);

        // A password change revokes every session, this one included.
        setTimeout(() => router.push("/login"), 1500);
    }

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    }

    if (loading) {
        return (
            <div className="flex items-center gap-3 text-slate-400 py-12">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2DD4BF] border-t-transparent" />
                <p className="text-sm font-medium">Loading Account Settings...</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">System Settings</h1>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                    Configure agency defaults reused by AI model generators for audits, demos, and cold outreach.
                </p>
            </div>

            <form onSubmit={handleSave} className="rounded-xl border border-[#164E53] bg-gradient-to-br from-[#0E1D1F] to-[#070C0E] p-6 shadow-lg space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#2DD4BF] border-b border-[#164E53] pb-3 mb-4">Agency Identity & Channels</h2>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Company Name</label>
                    <input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                        placeholder="RMAST STUDIO"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Official Website</label>
                    <input
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Contact Email</label>
                    <input
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#2DD4BF]">Direct Phone Line</label>
                    <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#86EFAC]">WhatsApp Business Number</label>
                    <input
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#86EFAC]">Instagram Handle / URL</label>
                    <input
                        value={instagram}
                        onChange={(e) => setInstagram(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#86EFAC]">Facebook Page URL</label>
                    <input
                        value={facebook}
                        onChange={(e) => setFacebook(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#86EFAC]">LinkedIn Profile URL</label>
                    <input
                        value={linkedin}
                        onChange={(e) => setLinkedin(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div className="rounded-lg border border-[#423219] bg-[#1B1710] p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                        <input
                            type="checkbox"
                            checked={autoSendEnabled}
                            onChange={(e) => setAutoSendEnabled(e.target.checked)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#F59E0B]"
                        />
                        <span>
                            <span className="block text-xs font-bold uppercase tracking-wider text-[#FDE68A]">
                                Auto-Send Outreach {autoSendEnabled ? "— ON" : "— OFF"}
                            </span>
                            <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">
                                {autoSendEnabled ? (
                                    <>
                                        <strong className="text-[#FDE68A]">On:</strong> the
                                        scheduled run sends each lead&apos;s email and WhatsApp
                                        outreach the moment it&apos;s drafted — automatically,
                                        with nobody reviewing it first.
                                    </>
                                ) : (
                                    <>
                                        <strong className="text-slate-300">Off:</strong> the
                                        engine still finds, audits, and drafts everything — it
                                        just never sends on its own. Use the Send button on each
                                        lead&apos;s page to send that message yourself.
                                    </>
                                )}
                            </span>
                            <span className="mt-2 block text-xs leading-relaxed text-slate-500">
                                Cold outreach is regulated — GDPR and PECR in the EU and UK,
                                CASL in Canada, CAN-SPAM in the US. Only turn this on once
                                you&apos;ve reviewed enough drafts by hand to trust them
                                unsupervised (and, if sending email, once your domain is
                                warmed up).
                            </span>
                        </span>
                    </label>
                </div>

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="rounded-lg bg-gradient-to-r from-[#0D9488] to-[#059669] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-all duration-200 hover:from-[#14B8A6] hover:to-[#10B981] disabled:opacity-50"
                    >
                        {saving ? "Saving..." : saved ? "Saved ✓" : "Save Settings"}
                    </button>
                </div>
            </form>

            <form
                onSubmit={handleChangePassword}
                className="rounded-xl border border-[#4C1D24] bg-gradient-to-br from-[#1F1015] to-[#070C0E] p-6 shadow-lg space-y-4"
            >
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#FB7185] border-b border-[#4C1D24] pb-3 mb-4">Security & Password</h2>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#FB7185]">Current Password</label>
                    <input
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#FB7185]">New Password</label>
                    <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#FB7185]">Confirm New Password</label>
                    <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-lg border border-[#132E32] bg-[#070C0E] px-3.5 py-2.5 text-sm text-slate-100 focus:border-[#2DD4BF] focus:outline-none"
                    />
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                    At least {MIN_PASSWORD_LENGTH} characters. The password is stored as a
                    salted hash in the database, so changing it here takes effect
                    immediately in production — and signs out every session, including
                    this one.
                </p>
                {passwordMessage && (
                    <div
                        className={`rounded-lg border p-3 text-xs ${passwordFailed
                            ? "border-[#9F1239]/40 bg-[#9F1239]/10 text-[#FB7185]"
                            : "border-[#0D9488]/40 bg-[#0D9488]/10 text-[#2DD4BF]"
                            }`}
                    >
                        {passwordMessage}
                    </div>
                )}
                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={changingPassword}
                        className="rounded-lg border border-[#9F1239]/40 bg-[#9F1239]/20 px-6 py-2.5 text-sm font-semibold text-[#FB7185] transition-all duration-200 hover:bg-[#9F1239]/40 disabled:opacity-50"
                    >
                        {changingPassword ? "Updating Password..." : "Change Password"}
                    </button>
                </div>
            </form>

            <div className="flex items-center justify-between rounded-xl border border-[#132E32] bg-[#091215] p-6 shadow-lg">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                        Session
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                        Sign out of this browser.
                    </p>
                </div>
                <button
                    onClick={handleLogout}
                    className="rounded-lg border border-[#132E32] bg-[#070C0E] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:border-[#164E53] hover:text-white"
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
}