"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PageBody } from "@/components/PageHeader";

/** Old link: Privacy & audit moved into the access-body workspace. */
export default function PrivacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/staff/privacy/");
  }, [router]);
  return (
    <PageBody>
      <p className="text-ui text-muted-foreground">
        Privacy & audit moved to{" "}
        <Link href="/staff/privacy/" className="text-foreground underline underline-offset-4">
          /staff/privacy/
        </Link>
        .
      </p>
    </PageBody>
  );
}
