import { apiGet } from "@/lib/api/http";

export interface UserProfile {
  id: number;
  email: string;
  fullName: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  status: string;
}

export function getMe(): Promise<UserProfile> {
  return apiGet<UserProfile>("/api/users/me");
}
