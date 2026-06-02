import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BIOMETRIC ARSENAL — Three.js + ShaderMaterial",
  description:
    "A 3D biometric field driven by microphone input and synthetic heart-rate variability. Custom ShaderMaterial, particle systems, and a sovereign-futurism aesthetic.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
