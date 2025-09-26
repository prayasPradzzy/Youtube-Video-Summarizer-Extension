import React, { useState, useEffect } from 'react';
import './ApiKeyInput.css';

interface ApiKeyInputProps {
  onValidKey: () => void;
}

interface GeminiModel {
  name: string;
  version: string;
  displayName: string;
  description: string;
  supportedGenerationMethods: string[];
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ onValidKey }) => {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  useEffect(() => {
    // Check if API key is already set
    chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (result) => {
      if (result.geminiApiKey) {
        setSelectedModel(result.geminiModel || null);
        onValidKey();
      }
    });
  }, [onValidKey]);

  const validateApiKey = async (key: string): Promise<boolean> => {
    try {
      // Clear any stored model to force re-selection
      await chrome.storage.sync.remove('geminiModel');
      
      // First, try to list available models
      console.log('Fetching available models...');
      const modelsResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${key}`
      );

      const modelsData = await modelsResponse.json();
      console.log('Models response:', modelsData);

      if (!modelsResponse.ok) {
        let errorMessage = 'Invalid API key. Please check your key and try again.';
        if (modelsData.error) {
          if (modelsData.error.status === 'INVALID_ARGUMENT') {
            errorMessage = 'Invalid API key format. Please check your key.';
          } else if (modelsData.error.status === 'PERMISSION_DENIED') {
            errorMessage = 'API key does not have permission to access Gemini. Please check your API key settings.';
          } else if (modelsData.error.message) {
            errorMessage = modelsData.error.message;
          }
        }
        throw new Error(errorMessage);
      }

      // Find a suitable model
      const models = modelsData.models || [];
      console.log('Available models:', models.map((m: any) => m.name));

      // Try preferred models in order
      const preferredModels = ['gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
      let selectedModel: string | null = null;

      for (const preferredModel of preferredModels) {
        const model = models.find((m: any) => 
          m.name.includes(preferredModel) && 
          m.supportedGenerationMethods.includes('generateContent')
        );
        
        if (model) {
          selectedModel = model.name.split('/').pop() || null;
          console.log('Selected model:', selectedModel);
          break;
        }
      }

      // If no preferred model found, try any model that supports generateContent
      if (!selectedModel) {
        const anyModel = models.find((model: any) => 
          model.supportedGenerationMethods.includes('generateContent')
        );
        if (anyModel) {
          selectedModel = anyModel.name.split('/').pop() || null;
          console.log('Using fallback model:', selectedModel);
        }
      }

      if (!selectedModel) {
        throw new Error('No suitable Gemini model found. Please ensure you have access to Gemini API models.');
      }

      setSelectedModel(selectedModel);

      // Test the selected model
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${selectedModel}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: 'Hello'
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
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = 'Error validating API key.';
        if (data.error) {
          if (data.error.status === 'INVALID_ARGUMENT') {
            errorMessage = 'Invalid API key format. Please check your key.';
          } else if (data.error.status === 'PERMISSION_DENIED') {
            errorMessage = 'API key does not have permission to access Gemini. Please check your API key settings.';
          } else if (data.error.message) {
            errorMessage = data.error.message;
          }
        }
        throw new Error(errorMessage);
      }

      return true;
    } catch (error) {
      console.error('API validation error:', error);
      throw error;
    }
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);

    try {
      if (!apiKey.trim()) {
        throw new Error('Please enter an API key');
      }

      // Validate the API key
      await validateApiKey(apiKey);

      // Save the API key and selected model
      await chrome.storage.sync.set({ 
        geminiApiKey: apiKey,
        geminiModel: selectedModel
      });
      await chrome.runtime.sendMessage({ 
        action: 'setApiKey', 
        apiKey,
        model: selectedModel
      });
      onValidKey();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="api-key-section">
      <h3>Gemini API Key Required</h3>
      <p>To use the YouTube Summarizer, you need to provide your Gemini API key.</p>
      <p>Steps to get your API key:</p>
      <ol>
        <li>Go to <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></li>
        <li>Click on "Create API key" or use an existing one</li>
        <li>Make sure you have enabled the Gemini API in your Google Cloud Console</li>
        <li>Copy your API key</li>
        <li>Paste it below</li>
      </ol>
      {selectedModel && (
        <p className="model-info">Using Gemini model: {selectedModel}</p>
      )}
      <div className="input-group">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your Gemini API key"
          className={error ? 'error' : ''}
        />
        <button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
}; 