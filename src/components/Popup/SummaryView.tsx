import React from 'react';
import { Summary } from '../../types';
import './SummaryView.css';

interface SummaryViewProps {
  summary: Summary;
  onExport: (format: string) => void;
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  summary,
  onExport
}) => {
  return (
    <div className="summary-container">
      <div className="summary-content">
        {summary.keyPoints.length > 0 && (
          <section className="key-points">
            <h3>Key Points</h3>
            <ul>
              {summary.keyPoints.map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          </section>
        )}

        {summary.topics.length > 0 && (
          <section className="topics">
            <h3>Topics</h3>
            <div className="topic-tags">
              {summary.topics.map((topic, index) => (
                <span key={index} className="topic-tag">
                  {topic}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="full-summary">
          <h3>Full Summary</h3>
          <div className="summary-text">
            {summary.content}
          </div>
        </section>
      </div>

      <div className="summary-actions">
        <div className="export-buttons">
          <button
            className="export-button"
            onClick={() => onExport('text')}
          >
            Copy as Text
          </button>
          <button
            className="export-button"
            onClick={() => onExport('markdown')}
          >
            Copy as Markdown
          </button>
        </div>

        <div className="summary-meta">
          <span className="timestamp">
            Generated: {new Date(summary.timestamp).toLocaleString()}
          </span>
          <span className="language">
            Language: {summary.language.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}; 