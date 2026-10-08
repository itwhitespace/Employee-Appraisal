import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Inter } from "next/font/google";
import AppShell from "@/components/AppShell";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

// Inter has no Thai glyphs, so Thai text falls through to IBM Plex Sans Thai.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const thai = IBM_Plex_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Performance Appraisal | Whitespace Partners",
  description: "Employee Performance Appraisal System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${inter.variable} ${thai.variable}`}>
      <body className="font-sans">
        <AuthProvider>
          <ConfirmProvider>
            <AppShell>{children}</AppShell>
          </ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
