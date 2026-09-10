export type UserRole = 'ADMIN' | 'CONTABILIDAD' | 'CONSULTA';

export interface SystemUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserFormData {
  fullName: string;
  email: string;
  password?: string;
  role: UserRole;
}

export type UserStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
export type UserRoleFilter = 'ALL' | 'ADMIN' | 'CONTABILIDAD' | 'CONSULTA';
