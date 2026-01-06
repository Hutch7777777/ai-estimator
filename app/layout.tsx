import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { UserProvider } from "@/lib/hooks/useUser";
import { OrganizationProvider } from "@/lib/hooks/useOrganization";
import { DebugLogger } from "@/components/debug-logger";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Estimate.ai - Construction Estimation SaaS",
  description: "Transform HOVER PDFs into professional Excel takeoffs in minutes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}>
      <body className="antialiased">
        <DebugLogger />
        <UserProvider>
          <OrganizationProvider>
            {children}
          </OrganizationProvider>
        </UserProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
