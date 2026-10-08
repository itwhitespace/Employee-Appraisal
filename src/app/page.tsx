"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { homePath } from "@/lib/permissions";

/** Sends a signed-in user to their role's landing page; AppShell handles the signed-out case. */
export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace(homePath(user));
  }, [user, router]);

  return null;
}
