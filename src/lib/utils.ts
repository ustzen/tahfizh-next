import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { fmtDMY, fmtDMYHM } from "@/lib/date-format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string | null) {
  return fmtDMY(value);
}

export function formatDateTime(value?: string | null) {
  return fmtDMYHM(value);
}

export function initialOf(name: string) {
  return name?.trim()?.[0]?.toUpperCase() ?? "?";
}
