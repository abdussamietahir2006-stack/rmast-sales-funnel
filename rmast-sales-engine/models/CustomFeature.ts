export interface CustomFeature {
    _id?: string;
    name: string;
    slug: string;
    description: string;
    dataSource: "leads" | "messages" | "appointments" | "activities";
    viewType: "table" | "stat";
    filterField?: string;
    filterValue?: string;
    createdAt: string;
}