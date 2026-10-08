export type PatientInput = {
  name: string;
  birthDate: string;
  contactNumber: string;
  email: string | null;
};

export type Patient = PatientInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type PatientList = {
  patients: Patient[];
  page: number;
  hasMore: boolean;
};

export type PatientSearch = {
  q: string;
  page: number;
  status: 'active' | 'archived';
};
