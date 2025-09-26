import type { APIResponse, Summary, SummaryOptions } from '../types';
import { config } from '../config';

export class GeminiService {
  private static instance: GeminiService;
  private apiKey: string | null = null;
  private model: string | null = null;
  private readonly BASE_URL = 'https://generativelanguage.googleapis.com/v1';
  private readonly PREFERRED_MODELS = ['gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY = 1000;
  private readonly MAX_CHUNK_LENGTH = 30000; // Gemini can handle much larger chunks

  private constructor() {}

  public static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  public async initialize(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    this.model = null; // Reset model to force new selection
    await this.findAndSetModel();
  }

  private async findAndSetModel(): Promise<void> {
    try {
      console.log('[YouTube Summarizer] Fetching available models...');
      const response = await fetch(`${this.BASE_URL}/models?key=${this.apiKey}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[YouTube Summarizer] Models API error:', errorData);
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
        }
        throw new Error(`Failed to list models: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const models = data.models || [];
      console.log('[YouTube Summarizer] Available models:', models.map((m: any) => m.name));

      // Try preferred models in order
      for (const preferredModel of this.PREFERRED_MODELS) {
        console.log(`[YouTube Summarizer] Checking for model: ${preferredModel}`);
        const model = models.find((m: any) => {
          const isMatch = m.name.includes(preferredModel);
          const hasGenerateContent = m.supportedGenerationMethods.includes('generateContent');
          console.log(`[YouTube Summarizer] Model ${m.name}: match=${isMatch}, hasGenerateContent=${hasGenerateContent}`);
          return isMatch && hasGenerateContent;
        });
        
        if (model) {
          this.model = model.name;
          console.log(`[YouTube Summarizer] Selected model: ${this.model}`);
          return;
        }
      }

      // If no preferred model found, try any model that supports generateContent
      const anyModel = models.find((model: any) => 
        model.supportedGenerationMethods.includes('generateContent')
      );

      if (anyModel) {
        this.model = anyModel.name;
        console.log(`[YouTube Summarizer] Using fallback model: ${this.model}`);
        return;
      }

      throw new Error('No suitable Gemini model found. Please ensure you have access to Gemini API models.');
    } catch (error) {
      console.error('[YouTube Summarizer] Model initialization error:', error);
      throw error;
    }
  }

  private get apiEndpoint(): string {
    if (!this.model) {
      throw new Error('Model not initialized');
    }
    // If the model name already includes the full path, use it as is
    const modelName = this.model.includes('/') ? this.model : `models/${this.model}`;
    return `${this.BASE_URL}/${modelName}:generateContent`;
  }

  private async validateApiKey(): Promise<void> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Test input for API validation.'
            }]
          }],
          safetySettings: [{
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(this.getDetailedErrorMessage(response.status, errorText));
      }
    } catch (error) {
      console.error('[YouTube Summarizer] API key validation failed:', error);
      throw new Error(
        error instanceof Error 
          ? `Invalid API key: ${error.message}`
          : 'Failed to validate API key'
      );
    }
  }

  public async summarize(
    videoId: string,
    transcript: string,
    options: SummaryOptions
  ): Promise<APIResponse<Summary>> {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key not set');
      }

      const cleanedTranscript = this.cleanTranscript(transcript);
      const chunks = this.splitIntoChunks(cleanedTranscript, this.MAX_CHUNK_LENGTH);
      
      // Process chunks sequentially
      const summaries: string[] = [];
      for (const chunk of chunks) {
        const summary = await this.summarizeChunkWithRetry(chunk);
        if (summary) {
          summaries.push(summary);
        }
      }

      if (summaries.length === 0) {
        throw new Error('Failed to generate any valid summaries');
      }

      // If we have multiple summaries, summarize them again to get a cohesive summary
      const finalSummary = summaries.length === 1 
        ? summaries[0] 
        : await this.summarizeChunkWithRetry(summaries.join('\n\n'), 1, true);

      if (!finalSummary) {
        throw new Error('Failed to generate final summary');
      }

      const keyPoints = await this.extractKeyPoints(finalSummary);
      const topics = await this.extractTopics(finalSummary);

      const summary: Summary = {
        id: `${videoId}_${Date.now()}`,
        videoId,
        content: finalSummary,
        keyPoints,
        topics,
        timestamp: Date.now(),
        language: 'en'
      };

      return {
        success: true,
        data: summary
      };
    } catch (error) {
      console.error('[YouTube Summarizer] Summarization error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate summary'
      };
    }
  }

  private async summarizeChunkWithRetry(
    text: string, 
    attempt = 1,
    isFinalSummary = false
  ): Promise<string | null> {
    try {
      console.log(`[YouTube Summarizer] Attempting to summarize chunk (attempt ${attempt}/${this.MAX_RETRIES})`);
      
      const prompt = isFinalSummary
        ? "Create a comprehensive summary of these combined summaries, maintaining the key information and flow:"
        : "Summarize this transcript segment, focusing on the main points and key information:";

      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${prompt}\n\n${text}`
            }]
          }],
          safetySettings: [{
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[YouTube Summarizer] API error:', errorData);
        
        if (response.status === 429) {
          console.log('[YouTube Summarizer] Rate limit hit, waiting before retry...');
          if (attempt < this.MAX_RETRIES) {
            const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`[YouTube Summarizer] Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.summarizeChunkWithRetry(text, attempt + 1, isFinalSummary);
          }
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        
        throw new Error(errorData.error?.message || 'Failed to generate summary');
      }

      const data = await response.json();
      
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response format from API');
      }

      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error(`[YouTube Summarizer] Chunk summarization error (attempt ${attempt}):`, error);

      if (attempt < this.MAX_RETRIES) {
        const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`[YouTube Summarizer] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.summarizeChunkWithRetry(text, attempt + 1, isFinalSummary);
      }

      return null;
    }
  }

  private async extractKeyPoints(text: string): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Extract 3-5 key points from this summary, formatted as a list:\n\n${text}`
            }]
          }],
          safetySettings: [{
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        })
      });

      if (!response.ok) {
        throw new Error('Failed to extract key points');
      }

      const data = await response.json();
      const keyPointsText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      return keyPointsText
        .split('\n')
        .map((point: string) => point.replace(/^[-•*]\s*/, '').trim())
        .filter((point: string) => point.length > 0);
    } catch (error) {
      console.error('[YouTube Summarizer] Key points extraction error:', error);
      return [];
    }
  }

  private async extractTopics(text: string): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Extract 3-5 main topics or themes from this summary, as a comma-separated list:\n\n${text}`
            }]
          }],
          safetySettings: [{
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          },
        })
      });

      if (!response.ok) {
        throw new Error('Failed to extract topics');
      }

      const data = await response.json();
      const topicsText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      return topicsText
        .split(',')
        .map((topic: string) => topic.trim())
        .filter((topic: string) => topic.length > 0);
    } catch (error) {
      console.error('[YouTube Summarizer] Topics extraction error:', error);
      return [];
    }
  }

  private getDetailedErrorMessage(status: number, errorText: string): string {
    switch (status) {
      case 400:
        return 'Invalid request. Please check your input.';
      case 401:
        return 'Invalid or expired API key. Please check your Gemini API key.';
      case 403:
        return 'Access forbidden. Your API key might not have the required permissions.';
      case 429:
        return 'Too many requests. Please try again later.';
      case 500:
        return 'Gemini server error. Please try again later.';
      case 503:
        return 'Gemini service unavailable. Please try again later.';
      default:
        return `API error (${status}): ${errorText}`;
    }
  }

  private cleanTranscript(transcript: string): string {
    return transcript
      .replace(/\[.*?\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private splitIntoChunks(text: string, maxChunkLength = 30000): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    for (const word of words) {
      if (currentChunk.join(' ').length + word.length > maxChunkLength) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [word];
      } else {
        currentChunk.push(word);
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }
} 