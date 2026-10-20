import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "VetOS",
  description: "Veterinary clinic operating system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="vetos-print-root" aria-hidden="true" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
