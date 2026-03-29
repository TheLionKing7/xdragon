/**
 * ═══════════════════════════════════════════════════════════════════════
 *  ARCHON_WRITE FEEDBACK PANEL — File Operation Visibility
 * ═══════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';

interface FileOperation {
  id: string;
  path: string;
  content: string;
  success: boolean;
  error?: string;
  hash?: string;
  timestamp: string;
  agent?: string;
}

interface ArchonWriteFeedbackProps {
  operations?: FileOperation[];
  onClear?: () => void;
  maxVisible?: number;
}

export const ArchonWriteFeedback: React.FC<ArchonWriteFeedbackProps> = ({
  operations = [],
  onClear,
  maxVisible = 5,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (operations.length === 0) {
    return (
      <div
        style={{
          background: '#1a1a2e',
          border: '1px solid #2d2d44',
          borderRadius: 8,
          fontFamily: 'Menlo, Monaco, monospace',
          fontSize: 13,
          textAlign: 'center',
          color: '#666',
          padding: 24, // FIXED: Removed duplicate padding: 12
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>📁</div>
        <div>No file operations yet. When Archon writes files, they'll appear here.</div>
      </div>
    );
  }

  const recentOperations = operations.slice(-maxVisible).reverse();

  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid #2d2d44',
        borderRadius: 8,
        padding: 12,
        fontFamily: 'Menlo, Monaco, monospace',
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: '1px solid #2d2d44',
        }}
      >
        <h4 style={{ margin: 0, color: '#e0e0e0', fontSize: 14 }}>📁 File Operations</h4>
        {onClear && (
          <button
            onClick={onClear}
            style={{
              background: 'transparent',
              border: '1px solid #444',
              color: '#888',
              padding: '4px 12px',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {recentOperations.map((op) => (
          <div
            key={op.id}
            onClick={() => setExpanded(expanded === op.id ? null : op.id)}
            style={{
              background: '#16162a',
              border: `1px solid ${op.success ? '#4ade80' : '#f87171'}`,
              borderLeft: `3px solid ${op.success ? '#4ade80' : '#f87171'}`,
              borderRadius: 6,
              padding: 10,
              marginBottom: 8,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontWeight: 'bold',
                  fontSize: 16,
                  color: op.success ? '#4ade80' : '#f87171',
                }}
              >
                {op.success ? '✓' : '✗'}
              </span>
              <span
                style={{
                  flex: 1,
                  color: '#e0e0e0',
                  fontFamily: 'Menlo, Monaco, monospace',
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {op.path}
              </span>
              <span style={{ color: '#666', fontSize: 11 }}>
                {new Date(op.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {expanded === op.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2d2d44' }}>
                {op.agent && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12 }}>
                    <span style={{ color: '#888' }}>Agent:</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 'bold',
                        background: op.agent === 'AYO' ? '#c9a84c' : '#9a7ab0',
                        color: '#fff',
                      }}
                    >
                      {op.agent}
                    </span>
                  </div>
                )}
                {op.hash && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12 }}>
                    <span style={{ color: '#888' }}>SHA256:</span>
                    <code
                      style={{
                        background: '#0d0d1a',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontFamily: 'Menlo, Monaco, monospace',
                        fontSize: 11,
                      }}
                    >
                      {op.hash.substring(0, 16)}...
                    </code>
                  </div>
                )}
                {op.error && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: '#f87171' }}>
                    <span style={{ color: '#888' }}>Error:</span>
                    <span>{op.error}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                  <span style={{ color: '#888' }}>Content:</span>
                  <pre
                    style={{
                      background: '#0d0d1a',
                      padding: 8,
                      borderRadius: 4,
                      maxHeight: 150,
                      overflowY: 'auto',
                      fontSize: 11,
                      color: '#a0a0a0',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {op.content.substring(0, 500)}
                    {op.content.length > 500 ? '...' : ''}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 12,
          paddingTop: 8,
          borderTop: '1px solid #2d2d44',
          textAlign: 'center',
          fontSize: 11,
          color: '#666',
        }}
      >
        🔐 All writes validated against workspace boundary
      </div>
    </div>
  );
};

export default ArchonWriteFeedback;