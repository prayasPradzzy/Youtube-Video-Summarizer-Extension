import React from 'react';
import { SummaryOptions } from '../../types';
import './OptionsPanel.css';

interface OptionsPanelProps {
  options: SummaryOptions;
  onChange: (options: SummaryOptions) => void;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  options,
  onChange
}) => {
  const handleChange = (
    field: keyof SummaryOptions,
    value: string | boolean
  ) => {
    onChange({
      ...options,
      [field]: value
    });
  };

  return (
    <div className="options-panel">
      <h3>Summary Options</h3>
      
      <div className="option-group">
        <label>Style</label>
        <select
          value={options.style}
          onChange={(e) => handleChange('style', e.target.value)}
        >
          <option value="bullet">Bullet Points</option>
          <option value="paragraph">Paragraphs</option>
        </select>
      </div>

      <div className="option-group">
        <label>Length</label>
        <select
          value={options.length}
          onChange={(e) => handleChange('length', e.target.value)}
        >
          <option value="short">Short (3-5 points)</option>
          <option value="medium">Medium (5-8 points)</option>
          <option value="long">Long (8-12 points)</option>
        </select>
      </div>

      <div className="option-group">
        <label>Language</label>
        <select
          value={options.language}
          onChange={(e) => handleChange('language', e.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="it">Italian</option>
          <option value="pt">Portuguese</option>
          <option value="hi">Hindi</option>
          <option value="ja">Japanese</option>
          <option value="ko">Korean</option>
          <option value="zh">Chinese</option>
        </select>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.includeTags}
            onChange={(e) => handleChange('includeTags', e.target.checked)}
          />
          Include Topic Tags
        </label>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.includeTimestamps}
            onChange={(e) => handleChange('includeTimestamps', e.target.checked)}
          />
          Include Timestamps
        </label>
      </div>
    </div>
  );
}; 