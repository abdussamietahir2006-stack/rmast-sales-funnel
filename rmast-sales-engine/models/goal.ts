export interface Goal {
    _id?: string;
    month: string; // e.g. "2026-09"
    targetClients: number;
    createdAt: string;
    updatedAt?: string;
}