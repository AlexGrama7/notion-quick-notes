import React, { useState } from 'react';
import { useRateLimit, getRateLimitMessage, getTimeUntilReset } from '../services/rateLimitService';
import './RateLimitIndicator.css';

interface RateLimitIndicatorProps {
  /**
   * Size of the indicator in pixels
   * @default 24
   */
  size?: number;
  
  /**
   * Whether to show the detailed tooltip
   * @default true
   */
  showTooltip?: boolean;
  
  /**
   * Whether to show the text label
   * @default false
   */
  showLabel?: boolean;
  
  /**
   * Optional custom class name
   */
  className?: string;
}

/**
 * A component that displays the current API rate limit status
 * with a visual indicator and optional tooltip details.
 */
export const RateLimitIndicator: React.FC<RateLimitIndicatorProps> = ({
  size = 24,
  showTooltip = true,
  showLabel = false,
  className = '',
}) => {
  const { rateLimitState, isLoading, error, refresh } = useRateLimit();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  
  // Skip rendering if not available
  if (isLoading || error || (!rateLimitState.limit && !rateLimitState.isLimited)) {
    return null;
  }
  
  // Calculate the visual properties
  const strokeWidth = size * 0.1;
  const radius = (size - strokeWidth) / 2;
  const normalizedRadius = radius - strokeWidth * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  
  // Calculate the percentage filled (inverted so 0% means no usage)
  const percentage = Math.min(100, Math.max(0, rateLimitState.usagePercent));
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // Determine the color based on status
  const getStatusColor = () => {
    if (rateLimitState.isLimited) return 'var(--error-color, #f44336)';
    switch (rateLimitState.status) {
      case 'critical':
        return 'var(--warning-color, #ff9800)';
      case 'warning':
        return 'var(--caution-color, #ffeb3b)';
      case 'normal':
      default:
        return 'var(--success-color, #4caf50)';
    }
  };
  
  // Get human-readable message for label and tooltip
  const message = getRateLimitMessage(rateLimitState);
  const resetTime = rateLimitState.resetAt 
    ? getTimeUntilReset(rateLimitState.resetAt)
    : 'Unknown';
  
  return (
    <div 
      className={`rate-limit-indicator ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => showTooltip && setTooltipVisible(true)}
      onMouseLeave={() => showTooltip && setTooltipVisible(false)}
      aria-label={`API Rate Limit: ${message}`}
      role="status"
    >
      {/* Circular progress indicator */}
      <svg
        height={size}
        width={size}
        className="rate-limit-circle"
      >
        {/* Background circle */}
        <circle
          stroke="var(--background-dim, #e0e0e0)"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        {/* Foreground circle showing usage */}
        <circle
          stroke={getStatusColor()}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          transform={`rotate(-90 ${radius} ${radius})`}
          strokeLinecap="round"
        />
        
        {/* Limit icon */}
        {rateLimitState.isLimited && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.4}
            fill={getStatusColor()}
            fontWeight="bold"
          >
            !
          </text>
        )}
      </svg>
      
      {/* Optional text label */}
      {showLabel && (
        <div className="rate-limit-label">
          {rateLimitState.remaining !== null && rateLimitState.limit
            ? `${rateLimitState.remaining}/${rateLimitState.limit}`
            : `${Math.round(100 - rateLimitState.usagePercent)}%`
          }
        </div>
      )}
      
      {/* Tooltip with detailed information */}
      {tooltipVisible && (
        <div className="rate-limit-tooltip">
          <div className="tooltip-title">API Rate Limits</div>
          <div className="tooltip-content">
            <p>{message}</p>
            {rateLimitState.resetAt && (
              <p className="tooltip-reset">Resets in: {resetTime}</p>
            )}
            {rateLimitState.isLimited && (
              <button 
                className="tooltip-action"
                onClick={refresh}
                aria-label="Check rate limit status again"
              >
                Check Again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RateLimitIndicator;