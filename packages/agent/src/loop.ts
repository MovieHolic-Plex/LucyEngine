import Anthropic from "@anthropic-ai/sdk";
import { type AgentHost, executeTool, toolDefinitions, toolStatus } from "./tools";
import { SYSTEM_PROMPT, buildUserMessage, type TurnContext } from "./prompt";

export interface AgentConfig {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** 거절당한 요청을 다른 모델로 다시 돌리는 서버 쪽 대체를 켠다. */
  fallbacks: boolean;
  maxSteps: number;
}

export function agentConfigFromEnv(env: Record<string, string | undefined> = process.env): AgentConfig {
  return {
    model: env.AGENT_MODEL ?? "claude-opus-5-5",
    effort: (env.AGENT_EFFORT as AgentConfig["effort"]) ?? "medium",
    fallbacks: env.AGENT_FALLBACKS !== "off",
    maxSteps: env.AGENT_MAX_STEPS ? Number(env.AGENT_MAX_STEPS) : 40,
  };
}

export interface TurnCallbacks {
  /** 답 글자가 흘러나올 때. */
  onText?(delta: string): void;
  /** 한 단계의 답이 도구 호출로 이어져 그 글이 최종 답이 아니게 됐을 때. */
  onTextReset?(): void;
  onTool?(name: string, status: string): void;
}

export interface TurnResult {
  /** 사용자에게 보일 마지막 답. */
  text: string;
  toolCalls: number;
  steps: number;
  ended: "done" | "max-steps" | "refusal" | "truncated";
  usage: { input: number; output: number; cacheRead: number };
}

type Msg = Anthropic.Beta.BetaMessageParam;

/**
 * 에이전트의 한 턴: 요청을 받아 도구를 써 가며 장면을 고치고 마지막 답을 돌려준다.
 * 문서 변경은 host.apply 로만 일어난다. 중단되면 host.signal 을 통해 예외로 빠져나온다.
 */
export async function runTurn(client: Anthropic, host: AgentHost, ctx: TurnContext, cfg: AgentConfig, cb: TurnCallbacks = {}): Promise<TurnResult> {
  const tools = toolDefinitions().filter((t) => (ctx.canLook || t.name !== "look") && (ctx.canGenerate || (t.name !== "create_assets" && t.name !== "redraw_asset")));
  const messages: Msg[] = [{ role: "user", content: buildUserMessage(host.doc(), host.sceneId, ctx) }];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  let toolCalls = 0;
  let lastText = "";

  for (let step = 1; step <= cfg.maxSteps; step++) {
    if (host.signal.aborted) throw new Error("aborted");
    const stream = client.beta.messages.stream(
      {
        model: cfg.model,
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        tools,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: cfg.effort },
        cache_control: { type: "ephemeral" },
        ...(cfg.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal: host.signal },
    );
    stream.on("text", (delta) => cb.onText?.(delta));
    const message = await stream.finalMessage();
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;

    const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("").trim();
    if (text) lastText = text;

    if (message.stop_reason === "refusal") return { text: lastText, toolCalls, steps: step, ended: "refusal", usage };
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) return { text: lastText, toolCalls, steps: step, ended: message.stop_reason === "max_tokens" ? "truncated" : "done", usage };
    // 잘린 도구 입력은 멀쩡한 부분 객체로 읽힐 수 있다. 실행하지 않는다.
    if (message.stop_reason === "max_tokens") return { text: lastText, toolCalls, steps: step, ended: "truncated", usage };

    cb.onTextReset?.();
    messages.push({ role: "assistant", content: message.content });
    // 문서를 바꾸는 도구들이 서로의 결과에 기대므로 차례대로 실행한다
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      toolCalls++;
      cb.onTool?.(use.name, toolStatus(use.name));
      host.status(toolStatus(use.name));
      const { content, isError } = await executeTool(host, use.name, use.input);
      results.push({ type: "tool_result", tool_use_id: use.id, content, ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: lastText, toolCalls, steps: cfg.maxSteps, ended: "max-steps", usage };
}
