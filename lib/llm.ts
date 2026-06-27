// OpenAI Chat Completions 호출 모듈.
// Our Real Trip(ggui) 프로젝트와 동일한 규약을 따른다:
//   - 환경변수: OPENAI_API_KEY (필수), OPENAI_MODEL (기본 gpt-4o)
//   - 서버사이드에서만 호출, 키는 브라우저에 절대 노출하지 않음
//   - response_format=json_object 로 유효 JSON 강제
// 호환을 위해 스펙의 LLM_API_KEY / LLM_MODEL 도 보조로 읽는다.

const DEFAULT_MODEL = "gpt-4o";

export function llmEnabled(): boolean {
  return !!apiKey();
}

function apiKey(): string | undefined {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    undefined
  );
}

function model(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.LLM_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

// 코드펜스/잡텍스트가 섞여도 첫 { … 마지막 } 블록을 파싱한다.
export function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type ChatArgs = {
  system: string;
  user: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
};

// JSON 객체를 반환하는 단일 chat 호출. 실패 시 throw (호출부에서 폴백 처리).
export async function chatJson(args: ChatArgs): Promise<Record<string, unknown>> {
  const key = apiKey();
  if (!key) throw new Error("OPENAI_API_KEY 미설정");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model(),
      max_tokens: args.maxTokens ?? 1800,
      temperature: args.temperature ?? 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 22000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status} ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(text);
  if (!parsed) throw new Error("LLM JSON 파싱 실패");
  return parsed;
}
