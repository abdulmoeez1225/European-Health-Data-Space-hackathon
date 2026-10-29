import type { Metadata } from "next";

import { StaffConsole } from "@/features/staff/StaffConsole";

export const metadata: Metadata = { title: "Staff console" };

export default function StaffPage() {
  return <StaffConsole />;
}
