export interface Appointment {
    _id?: string;
    leadId: string;
    companyName: string;
    scheduledAt: string;
    serviceInterest?: string;
    budget?: string;
    timeline?: string;
    status: "Scheduled" | "Completed" | "Cancelled";
    /** Where the booking came from — the public audit page or the dashboard. */
    source?: "audit_page" | "operator" | "engine";
    createdAt: string;
}