export interface CallNote {
    _id?: string;
    leadId: string;
    companyName: string;
    notes: string;
    summary?: string;
    nextSteps?: string;
    createdAt: string;
}