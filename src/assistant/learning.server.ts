import { db3Admin } from "@/server/db/clients.server";

function redact(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/\b(?:password|api[_ -]?key|secret|token)\b[^\n]{0,80}/gi, "[sensitive]")
    .slice(0, 1200);
}

export async function recordWebsiteKnowledgeGap(siteId: string, question: string, answer: string) {
  const cleanQuestion = redact(question.trim());
  if (cleanQuestion.length < 4) return;
  const cleanAnswer = redact(answer.trim());
  try {
    const { data: existing } = await db3Admin
      .from("website_ai_learning_candidates")
      .select("id,occurrence_count,evidence")
      .eq("site_id", siteId)
      .eq("question", cleanQuestion)
      .maybeSingle();
    const evidence = Array.isArray(existing?.evidence) ? existing.evidence.slice(-4) : [];
    evidence.push({ answer: cleanAnswer, seenAt: new Date().toISOString() });
    if (existing?.id) {
      await db3Admin.from("website_ai_learning_candidates").update({ occurrence_count: Number(existing.occurrence_count ?? 0) + 1, last_seen_at: new Date().toISOString(), evidence }).eq("id", existing.id);
    } else {
      await db3Admin.from("website_ai_learning_candidates").insert({ site_id: siteId, question: cleanQuestion, candidate_answer: null, evidence, occurrence_count: 1 });
    }
  } catch (error) {
    console.error("website AI learning candidate write failed", error);
  }
}
