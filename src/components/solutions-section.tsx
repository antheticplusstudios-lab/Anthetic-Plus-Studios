import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { SectionHead } from "@/components/page-shell";
import { useLang, useT } from "@/lib/i18n";
import { getSolutions } from "@/lib/solutions.functions";
import { availableSolutions, DEFAULT_SOLUTIONS, SOLUTION_ICONS } from "@/lib/solutions";
import { useLivePricing } from "@/lib/pricing";

/** Solutions merged into the Products page: who each system is built for. */
export function SolutionsSection() {
  const t = useT();
  const { lang } = useLang();
  const { data: plans } = useLivePricing();
  const { data } = useQuery({
    queryKey: ["site-solutions"],
    queryFn: () => getSolutions(),
    // Defaults render instantly; the admin-edited list swaps in when loaded.
    placeholderData: DEFAULT_SOLUTIONS,
    staleTime: 5 * 60_000,
  });
  const solutions = availableSolutions(data ?? DEFAULT_SOLUTIONS, plans);
  if (!solutions.length) return null;
  return (
    <section className="mt-20">
      <SectionHead
        eyebrow={t("Solutions", "সলিউশন")}
        title={t(
          "One focused system for each moment you lose customers.",
          "যেখানে গ্রাহক হারান, সেখানেই একটি নির্দিষ্ট সিস্টেম।",
        )}
        lead={t(
          "Pick your team to see which system fits. Every system is configured with your own business context and hands off to a person when needed.",
          "আপনার টিম বেছে দেখুন কোন সিস্টেম মানায়। প্রতিটি সিস্টেম আপনার ব্যবসার তথ্যে কনফিগার করা এবং প্রয়োজনে মানুষের কাছে হস্তান্তর করে।",
        )}
      />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {solutions.map((s) => {
          const c = s[lang];
          const Icon = SOLUTION_ICONS[s.icon];
          return (
            <Link
              key={s.id}
              to="/automations/$slug"
              params={{ slug: s.slug }}
              className="surface-card lift group block p-6"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-extrabold tracking-tight">{c.team}</h3>
              <p className="mt-2 text-sm text-body">{c.problem}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                {t("View product", "প্রোডাক্ট দেখুন")}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
