/** 이미지 생성 제공자. 글(과 선택적으로 참고 그림)을 받아 그림 한 장을 돌려준다. */
export interface ImageProvider {
  generate(req: ImageRequest): Promise<Buffer>;
}

export interface ImageRequest {
  prompt: string;
  /** 참고 그림 (PNG/JPEG). 스타일 기준이나 포즈 틀로 쓴다. */
  refs?: Buffer[];
  aspect?: "1:1" | "3:2" | "2:3" | "16:9" | "4:3" | "3:4";
  signal?: AbortSignal;
}

export interface GeminiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  retries?: number;
  timeoutMs?: number;
  /** 분당 요청 수 상한. 넘지 않도록 시작 간격을 벌린다. */
  rpm?: number;
  concurrency?: number;
}

function sniffMime(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  return "image/webp";
}

/** Gemini generateContent 규격의 이미지 모델. */
export class GeminiImageProvider implements ImageProvider {
  private active = 0;
  private waiting: Array<() => void> = [];
  private nextStart = 0;

  constructor(private cfg: GeminiProviderConfig) {}

  /** 동시 실행 수와 분당 요청 수를 지키며 차례를 기다린다. */
  private async acquire(): Promise<void> {
    const limit = this.cfg.concurrency ?? 4;
    if (this.active >= limit) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    const gap = 60_000 / (this.cfg.rpm ?? 10);
    const now = Date.now();
    const at = Math.max(now, this.nextStart);
    this.nextStart = at + gap;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }

  private release(): void {
    this.active--;
    this.waiting.shift()?.();
  }

  async generate(req: ImageRequest): Promise<Buffer> {
    await this.acquire();
    try {
      return await this.request(req);
    } finally {
      this.release();
    }
  }

  private async request(req: ImageRequest): Promise<Buffer> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}/v1beta/models/${this.cfg.model}:generateContent`;
    const parts: unknown[] = [];
    for (const r of req.refs ?? []) parts.push({ inlineData: { mimeType: sniffMime(r), data: r.toString("base64") } });
    parts.push({ text: req.prompt });
    const body = JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE"], ...(req.aspect ? { imageConfig: { aspectRatio: req.aspect } } : {}) },
    });
    const retries = this.cfg.retries ?? 4;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (req.signal?.aborted) throw new Error("aborted");
      try {
        const timeout = AbortSignal.timeout(this.cfg.timeoutMs ?? 120_000);
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.cfg.apiKey, authorization: `Bearer ${this.cfg.apiKey}` },
          body,
          signal: req.signal ? AbortSignal.any([req.signal, timeout]) : timeout,
        });
        if (!res.ok) throw new Error(`image api ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const json = (await res.json()) as any;
        const part = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
        if (!part) throw new Error(`image api returned no image: ${JSON.stringify(json).slice(0, 300)}`);
        return Buffer.from(part.inlineData.data, "base64");
      } catch (e) {
        lastErr = e;
        if (req.signal?.aborted) throw e;
        // 한도 초과는 1~2분 뒤에 풀린다. 갈수록 길게 기다린다.
        await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

export function providerFromEnv(env: Record<string, string | undefined> = process.env): ImageProvider | null {
  const baseUrl = env.IMAGE_API_BASE ?? env.ANTHROPIC_BASE_URL;
  const apiKey = env.IMAGE_API_KEY ?? env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_AUTH_TOKEN;
  if (!baseUrl || !apiKey) return null;
  return new GeminiImageProvider({
    baseUrl,
    apiKey,
    model: env.IMAGE_MODEL ?? "gemini-3.1-flash-image",
    rpm: env.IMAGE_RPM ? Number(env.IMAGE_RPM) : undefined,
  });
}
