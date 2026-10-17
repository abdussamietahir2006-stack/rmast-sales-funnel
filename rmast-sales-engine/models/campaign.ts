export interface Campaign {
    _id?: string;
    name: string;
    niche: string;
    country: string;
    locations: string[];
    leadCountPerRun: number;
    leadCount: number;
    status: "Active" | "Paused";
    createdAt: string;
}