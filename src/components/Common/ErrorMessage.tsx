import React from 'react';
import './ErrorMessage.css';

interface ErrorMessageProps {
  message: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  return (
    <div className="error-container">
      <div className="error-icon">⚠️</div>
      <p className="error-message">{message}</p>
    </div>
  );
}; 