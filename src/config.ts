export const config = {
  gemini: {
    model: 'gemini-2.0-flash-lite',
    maxOutputTokens: 1024,
    temperature: 0.7,
    topK: 40,
    topP: 0.95
  },
  cache: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxEntries: 100
  }
}; 