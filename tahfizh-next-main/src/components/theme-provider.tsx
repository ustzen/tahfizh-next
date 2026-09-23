"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * V12 — Dark mode aktif: Light / Dark / System. Tema SISTEM UTAMA = TERANG,
 * jadi defaultTheme "light" (pengguna tetap bisa pilih Dark/System).
 * attribute="class" menyinkronkan token .dark pada globals.css.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
