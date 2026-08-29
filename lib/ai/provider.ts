export interface AIProviderInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  generateText(input: AIProviderInput): Promise<string>;
}
