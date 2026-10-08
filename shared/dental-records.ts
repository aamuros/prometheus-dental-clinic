export type DentalRecordKind = 'note' | 'treatment';
export type DentalRecordInput = {
  patientId: string;
  kind: DentalRecordKind;
  clinicalNotes: string | null;
  diagnosis: string | null;
  procedures: string | null;
  toothNumbers: number[];
  treatmentDate: string;
  dentistId: string;
  appointmentId: string | null;
};
export type DentalRecord = DentalRecordInput & {
  id: string;
  version: number;
  dentistName: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};
export type DentalRecordChange = {
  version: number;
  snapshot: DentalRecordInput;
  dentistName: string;
  changedBy: string;
  changedByName: string;
  changedAt: string;
};
export type DentalRecordList = {
  records: DentalRecord[];
  page: number;
  hasMore: boolean;
};
export type DentalRecordDetails = {
  record: DentalRecord;
  history: DentalRecordChange[];
  page: number;
  hasMore: boolean;
};
export function isFdiTooth(value: number) {
  const quadrant = Math.floor(value / 10);
  const position = value % 10;
  return (
    Number.isInteger(value) &&
    position >= 1 &&
    ((quadrant >= 1 && quadrant <= 4 && position <= 8) ||
      (quadrant >= 5 && quadrant <= 8 && position <= 5))
  );
}
