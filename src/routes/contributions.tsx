import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, HeartHandshake, Users } from "lucide-react";
import { MarketingPage, PageHero } from "@/components/page-shell";
import { getContributions } from "@/lib/contributions.functions";

export const Route = createFileRoute("/contributions")({
  head: () => ({
    meta: [
      { title: "Contributions of Autumic — Build To Automate" },
      { name: "description", content: "Meet the people and contributors helping build Autumic." },
      { property: "og:title", content: "Contributions of Autumic" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ContributionsPage,
});

function ContributionsPage() {
  const load = useServerFn(getContributions);
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["autumic-contributions"],
    queryFn: () => load(),
    staleTime: 60_000,
  });
  const people = [...data].filter((p) => p.published).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <MarketingPage>
      <PageHero
        eyebrow="The people behind the work"
        title="Contributions of Autumic"
        lead="A growing group of people contributing their time, ideas and expertise to build practical AI systems for businesses. Every meaningful contribution moves the work forward."
      />
      <section className="container-page pb-24">
        <div className="mb-8 flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <HeartHandshake className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Built through collaboration</p>
            <p className="text-sm text-muted-foreground">
              Recognising the people who help shape, improve and deliver Autumic.
            </p>
          </div>
          <span className="ml-auto hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Users className="size-4" />
            {people.length} {people.length === 1 ? "contributor" : "contributors"}
          </span>
        </div>
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-72 animate-pulse rounded-2xl border border-border bg-card"
              />
            ))}
          </div>
        ) : isError ? (
          <p
            role="status"
            className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground"
          >
            Contributor profiles are temporarily unavailable. Please check back soon.
          </p>
        ) : people.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <article
                key={p.id}
                className="group overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
              >
                <div className="relative aspect-[5/4] overflow-hidden bg-muted">
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent opacity-70" />
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.badge && (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight">{p.name}</h2>
                  <p className="mt-1 text-sm font-medium text-primary">{p.title}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{p.description}</p>
                  <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    Autumic contributor <ArrowUpRight className="size-3.5" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">Our contributions are taking shape</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              We’re building a team of people who care about making useful automation accessible.
              Check back as contributors are recognised here.
            </p>
          </div>
        )}
      </section>
    </MarketingPage>
  );
}
