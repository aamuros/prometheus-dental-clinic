export type StaffRole = 'admin' | 'staff';
export type StaffSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    passwordChangeRequired?: boolean;
  };
};
