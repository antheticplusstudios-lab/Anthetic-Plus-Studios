import { db3Admin } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 1100;
const OVERLAP = 140;

type ProviderKeyRow = {
  id: string;
  key_ciphertext: string;
  model: string | null;
  is_active: boolean;
  cooldown_until: string | null;
};

function chunkText(content: string) {
  const clean = content.replace(/\r/g, "").trim();
  if (!clean) return [];
  const out: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(clean.length, start + CHUNK_SIZE);
    const chunk = clean.slice(start, end).trim();
    if (chunk) out.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(start + 1, end - OVERLAP);
  }
  return out;
}

async function getOpenAiKey(): Promise<string | null> {
  const { data } = await db3Admin
    .from("llm_api_keys")
    .select("id,key_ciphertext,model,is_active,cooldown_until")
    .eq("provider_key", "openai")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(20);
  const now = Date.now();
  for (const row of (data ?? []) as ProviderKeyRow[]) {
    if (row.cooldown_until && new Date(row.cooldown_until).getTime() > now) continue;
    try {
      return decryptSecret(row.key_ciphertext);
    } catch {
      /* try next key */
    }
  }
  return null;
}

export async function embedText(text: string): Promise<number[] | null> {
  const key = await getOpenAiKey();
  if (!key) return null;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 8000) }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}) as unknown);
  if (!response.ok) return null;
  const embedding = payload?.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding.map(Number) : null;
}

export async function indexKnowledgeDocument(documentId: string) {
  const { data: doc, error } = await db3Admin
    .from("kb_documents")
    .select("id,knowledge_base_id,client_id,automation_id,content,source_name")
    .eq("id", documentId)
    .single();
  if (error || !doc) throw new Error(error?.message ?? "Knowledge document not found");
  const chunks = chunkText(String(doc.content ?? ""));
  await db3Admin.from("kb_chunks").delete().eq("document_id", documentId);
  if (!chunks.length) return { count: 0, embedded: 0 };
  let embedded = 0;
  const vectors = await Promise.all(chunks.map((content) => embedText(content)));
  for (let i = 0; i < chunks.length; i++) {
    const embedding = vectors[i];
    if (!embedding) continue;
    const { error: chunkError } = await db3Admin.rpc("insert_kb_chunk", {
      p_document_id: documentId,
      p_knowledge_base_id: doc.knowledge_base_id,
      p_client_id: doc.client_id,
      p_automation_id: doc.automation_id,
      p_chunk_index: i,
      p_content: chunks[i],
      p_token_count: null,
      p_embedding: `[${embedding.join(",")}]`,
      p_metadata: { source_name: doc.source_name, model: EMBEDDING_MODEL },
    });
    if (!chunkError) embedded++;
  }
  return { count: chunks.length, embedded };
}

export async function retrieveKnowledge(automationId: string, query: string, topK = 8) {
  const embedding = await embedText(query);
  if (!embedding) return [];
  const { data, error } = await db3Admin.rpc("match_kb_chunks", {
    p_automation_id: automationId,
    p_embedding: `[${embedding.join(",")}]`,
    p_match_count: topK,
    p_min_similarity: 0.22,
  });
  if (error) return [];
  return (data ?? []) as {
    chunk_id: string;
    document_id: string;
    content: string;
    source_name: string;
    similarity: number;
  }[];
}
