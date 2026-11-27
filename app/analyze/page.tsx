import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import RepoLens from "@/components/RepoLens";
import { DEMOS } from "@/lib/demos";

type Props = { searchParams: Promise<{ repo?: string; demo?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { repo, demo } = await searchParams;
  return { title: DEMOS.find((d) => d.slug === demo)?.repo ?? repo ?? "Analyze" };
}

export default async function AnalyzePage({ searchParams }: Props) {
  const { repo, demo } = await searchParams;
  if (demo && !DEMOS.some((d) => d.slug === demo)) notFound();
  if (!demo && !repo) redirect("/");
  return <RepoLens repo={repo} demo={demo} />;
}
