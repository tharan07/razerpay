import { AIProvider, AIProviderInput } from '@/lib/ai/provider';

// Enforce server-only execution
if (typeof window !== 'undefined') {
  throw new Error('lib/ai/nim-provider.ts is server-only and cannot be imported into browser code.');
}

export class NvidiaNimProvider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey || process.env.NVIDIA_API_KEY || '';
    this.baseUrl = (
      options?.baseUrl ||
      process.env.NVIDIA_BASE_URL ||
      'https://integrate.api.nvidia.com/v1'
    ).replace(/\/+$/, '');
    this.model = options?.model || process.env.AI_MODEL || 'meta/llama-3.1-70b-instruct';
  }

  async generateText(input: AIProviderInput): Promise<string> {
    if (!this.apiKey) {
      throw new Error('NVIDIA_API_KEY is not configured on the server.');
    }

    const endpoint = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
          ],
          temperature: input.temperature ?? 0.2,
          max_tokens: input.maxTokens ?? 1024,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(
          `NVIDIA NIM endpoint returned HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error('NVIDIA NIM endpoint returned an empty or malformed response body.');
      }

      return content;
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          throw new Error('NVIDIA NIM endpoint request timed out.');
        }
        // Sanitize error message to ensure no API keys or secret headers leak
        const sanitizedMsg = err.message.replace(new RegExp(this.apiKey, 'g'), '[REDACTED]');
        throw new Error(`NVIDIA NIM Provider error: ${sanitizedMsg}`);
      }
      throw new Error('NVIDIA NIM Provider encountered an unknown transport error.');
    }
  }
}

let instance: NvidiaNimProvider | null = null;

/**
 * Gets a reusable server-side singleton instance of NvidiaNimProvider.
 */
export function getNvidiaNimProvider(): NvidiaNimProvider {
  if (!instance) {
    instance = new NvidiaNimProvider();
  }
  return instance;
}
