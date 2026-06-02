"use client";

import dynamic from "next/dynamic";

const BiometricScene = dynamic(
  () => import("@/components/BiometricScene"),
  { ssr: false }
);

export default function Home() {
  return <BiometricScene />;
}
