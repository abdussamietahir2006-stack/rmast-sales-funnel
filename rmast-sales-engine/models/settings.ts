export interface Settings {
    _id?: string;
    companyName: string;
    website?: string;
    contactEmail?: string;
    phone?: string;
    whatsapp?: string;
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    /**
     * Master switch for unattended outreach. When false the cron runs the full
     * pipeline but stops before contacting anyone, so every message goes out
     * only after a human has looked at it.
     */
    autoSendEnabled?: boolean;
    updatedAt: string;
}