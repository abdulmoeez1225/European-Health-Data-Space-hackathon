import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted">This page does not exist in the Gatekeeper portal.</p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-[10px] bg-accent px-4 font-semibold text-accent-fg"
      >
        Go to the applicant portal
      </Link>
    </div>
  );
}
