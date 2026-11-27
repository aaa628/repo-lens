import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import RepoLens from "@/components/RepoLens";
import { DEMOS } from "@/lib/demos";
import { parseRepoUrl } from "@/lib/github";

type Props = { searchParams: Promise<{ repo?: string; demo?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { repo, demo } = await searchParams;
  return { title: DEMOS.find((d) => d.slug === demo)?.repo ?? repo ?? "Analyze" };
}

export default async function AnalyzePage({ searchParams }: Props) {
  const { repo, demo } = await searchParams;
  if (demo && !DEMOS.some((d) => d.slug === demo)) notFound();
  if (!demo && !repo) redirect("/");
  // The home form submits whatever was pasted; canonicalize it to owner/name. Unparseable input reaches the API, which explains.
  const ref = typeof repo === "string" ? parseRepoUrl(repo) : null;
  if (ref && repo !== `${ref.owner}/${ref.repo}`) redirect(`/analyze?repo=${ref.owner}/${ref.repo}`);
  return <RepoLens repo={repo} demo={demo} />;
}
