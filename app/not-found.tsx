import Link from "next/link";
import { DemoLinks, SiteFooter, SiteHeader } from "@/components/Site";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-signal-400">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-3 text-sm text-muted">
          Head back to the <Link href="/" className="text-fg underline underline-offset-4 hover:text-signal-200">home page</Link> or
          open one of the demos.
        </p>
        <div className="mt-10">
          <DemoLinks />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
