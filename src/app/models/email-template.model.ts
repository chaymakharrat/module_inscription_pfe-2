export interface EmailTemplate {
    id: number;
    code: string;
    role: string;
    categorie: string;
    label: string;
    subject: string;
    bodyHtml: string;
    variablesDisponibles: string[];  // ← était probablement string, changer en string[]
    actif: boolean;
    updatedAt?: string;
    updatedBy?: string;
}
