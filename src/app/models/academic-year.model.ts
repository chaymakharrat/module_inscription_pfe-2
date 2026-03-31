export interface AnneeUniversitaire {
  id: number;
  annee: string;
  courante: boolean;
  verrouillee: boolean;
  dateOuverture?: string;
  dateFermeture?: string;
  scellee: boolean;
}
