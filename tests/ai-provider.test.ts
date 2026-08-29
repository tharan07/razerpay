import assert from 'node:assert';
import { describe, it } from 'node:test';
import { NvidiaNimProvider } from '@/lib/ai/nim-provider';
import { AIProvider } from '@/lib/ai/provider';

describe('Phase 9 — AI Provider Abstraction & NVIDIA NIM', () => {
  it('throws error when NVIDIA_API_KEY is missing', async () => {
    const provider = new NvidiaNimProvider({ apiKey: '' });
    await assert.rejects(
      async () => {
        await provider.generateText({
          systemPrompt: 'sys',
          userPrompt: 'user',
        });
      },
      (err: Error) => {
        return err.message.includes('NVIDIA_API_KEY is not configured');
      }
    );
  });

  it('implements AIProvider interface using mock provider', async () => {
    const mockProvider: AIProvider = {
      generateText: async (input) => {
        assert.strictEqual(input.systemPrompt, 'sys_test');
        assert.strictEqual(input.userPrompt, 'user_test');
        return 'mock_response';
      },
    };

    const res = await mockProvider.generateText({
      systemPrompt: 'sys_test',
      userPrompt: 'user_test',
    });

    assert.strictEqual(res, 'mock_response');
  });
});
