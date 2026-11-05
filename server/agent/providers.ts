import { z } from "zod";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type Tool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
export type SearchHit = { url: string; title: string; content: string };
export type AgentProviders = {
  label: string;
  complete: (
    messages: ChatMessage[],
    tools: Tool[],
    signal: AbortSignal,
  ) => Promise<ChatMessage>;
  search: (query: string, signal: AbortSignal) => Promise<SearchHit[]>;
  extract: (
    urls: string[],
    signal: AbortSignal,
  ) => Promise<{ url: string; content: string }[]>;
};
export class ProviderError extends Error {}
export function agentSetup() {
  return {
    ready: [
      "VULTR_INFERENCE_API_KEY",
      "VULTR_INFERENCE_MODEL",
      "TAVILY_API_KEY",
    ].every((name) => !!process.env[name]?.trim()),
    provider: "Vultr Serverless Inference + Tavily",
    missing: [
      "VULTR_INFERENCE_API_KEY",
      "VULTR_INFERENCE_MODEL",
      "TAVILY_API_KEY",
    ].filter((name) => !process.env[name]?.trim()),
  };
}
async function request(
  url: string,
  key: string,
  body: object,
  signal: AbortSignal,
  provider: string,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
      redirect: "error",
    });
  } catch {
    if (signal.aborted) throw new ProviderError("Research was interrupted.");
    throw new ProviderError(
      `${provider} could not be reached or timed out. Try again shortly.`,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403].includes(response.status))
      throw new ProviderError(
        `${provider} rejected the credentials or account access. Check the server configuration.`,
      );
    if ([402, 429].includes(response.status))
      throw new ProviderError(
        `${provider} has reached an account, credit, or rate limit. Check its dashboard before retrying.`,
      );
    throw new ProviderError(
      `${provider} could not complete this request (HTTP ${response.status}). Check the model and provider status.`,
    );
  }
  if (!response.body)
    throw new ProviderError(`${provider} returned an empty response.`);
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    bytes += item.value.length;
    if (bytes > 2000000) {
      await reader.cancel();
      throw new ProviderError(`${provider} returned too much data.`);
    }
    chunks.push(item.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ProviderError(`${provider} returned an invalid response.`);
  }
}
const completion = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().max(200),
                type: z.literal("function"),
                function: z.object({
                  name: z.string().max(100),
                  arguments: z.string().max(50000),
                }),
              }),
            )
            .max(4)
            .optional(),
        }),
      }),
    )
    .min(1),
});
export function createProviders(): AgentProviders {
  const model = process.env.VULTR_INFERENCE_MODEL?.trim() ?? "";
  const inferenceKey = process.env.VULTR_INFERENCE_API_KEY?.trim() ?? "",
    searchKey = process.env.TAVILY_API_KEY?.trim() ?? "";
  return {
    label: "Vultr Serverless Inference + Tavily",
    async complete(messages, tools, signal) {
      const response = completion.safeParse(
        await request(
          "https://api.vultrinference.com/v1/chat/completions",
          inferenceKey,
          {
            model,
            messages,
            tools,
            tool_choice: "required",
            max_completion_tokens: 8192,
            reasoning: { effort: "low", max_tokens: 1024 },
            temperature: 0.2,
          },
          signal,
          "Vultr",
        ),
      );
      if (!response.success)
        throw new ProviderError(
          "Vultr returned an invalid tool-calling response. Check that the chosen model supports tools.",
        );
      if (response.data.choices[0].finish_reason === "length")
        throw new ProviderError(
          "The model ran out of output space. Retry or choose a suitable tool-calling model.",
        );
      const message = response.data.choices[0].message;
      return {
        role: "assistant",
        content: message.content ?? null,
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
      };
    },
    async search(query, signal) {
      const schema = z.object({
        results: z
          .array(
            z.object({
              url: z.string(),
              title: z.string().default("Source"),
              content: z.string().default(""),
            }),
          )
          .max(10),
      });
      const parsed = schema.safeParse(
        await request(
          "https://api.tavily.com/search",
          searchKey,
          {
            query,
            search_depth: "basic",
            max_results: 4,
            include_answer: false,
            include_raw_content: false,
          },
          signal,
          "Tavily",
        ),
      );
      if (!parsed.success)
        throw new ProviderError("Tavily returned an invalid search response.");
      return parsed.data.results;
    },
    async extract(urls, signal) {
      const schema = z.object({
        results: z
          .array(z.object({ url: z.string(), raw_content: z.string() }))
          .max(4),
      });
      const parsed = schema.safeParse(
        await request(
          "https://api.tavily.com/extract",
          searchKey,
          { urls, extract_depth: "basic", format: "text" },
          signal,
          "Tavily",
        ),
      );
      if (!parsed.success)
        throw new ProviderError(
          "Tavily returned an invalid page-extraction response.",
        );
      return parsed.data.results.map((item) => ({
        url: item.url,
        content: item.raw_content,
      }));
    },
  };
}
