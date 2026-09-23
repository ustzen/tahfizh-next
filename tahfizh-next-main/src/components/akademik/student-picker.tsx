"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Student selector for Riwayat Perkembangan pages (#43/#48). Uses URL
 * navigation so deep links and back/forward keep working.
 */
export function StudentPicker({
  students,
  selectedId,
  param = "student",
}: {
  students: { id: string; label: string }[];
  selectedId: string;
  param?: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={selectedId}
      onValueChange={(v) => {
        router.push(`?${param}=${v}`, { scroll: false });
      }}
    >
      <SelectTrigger className="w-full sm:w-72" aria-label="Pilih santri">
        <SelectValue placeholder="Pilih santri" />
      </SelectTrigger>
      <SelectContent>
        {students.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
