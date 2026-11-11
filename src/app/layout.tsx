import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { PwaRegister } from "@/components/pwa-register";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "TAHFIZH",
  // PWA: tanpa <link rel="manifest"> browser tidak tahu aplikasi ini bisa di-install.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "TAHFIZH",
    statusBarStyle: "default",
  },
  title: {
    default: "TAHFIZH — Platform Pengelolaan Tahfizh",
    template: "%s · TAHFIZH",
  },
  description:
    "TAHFIZH membantu sekolah, TPQ, dan lembaga Al-Qur'an mengelola pembelajaran dan data santri dalam satu platform. Gratis untuk lembaga.",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${geistMono.variable} font-sans antialiased`}>
        <PwaRegister />
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
