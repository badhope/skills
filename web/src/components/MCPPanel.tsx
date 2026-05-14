import React, { useState, useEffect } from 'react';
import { listMCPServices, toggleMCPService, MCPService } from '../api/client';

function MCPPanel() {
  const [services, setServices] = useState<MCPService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listMCPServices();
      if (response.success && response.data) {
        setServices(response.data);
      } else {
        setError(response.error?.message || 'Failed to load MCP services');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      const response = await toggleMCPService(name, !enabled);
      if (response.success) {
        setServices((prev) =>
          prev.map((s) => (s.name === name ? { ...s, enabled: !enabled } : s))
        );
      } else {
        setError(response.error?.message || 'Failed to toggle service');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle service');
    }
  };

  return (
    <div className="mcp-panel">
      <div className="panel-header">
        <h2>MCP Services</h2>
        <button onClick={loadServices} disabled={loading} className="refresh-btn">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="items-list">
        {loading ? (
          <div className="loading-placeholder">Loading MCP services...</div>
        ) : services.length === 0 ? (
          <div className="empty-placeholder">No MCP services available</div>
        ) : (
          services.map((service) => (
            <div key={service.name} className="list-item">
              <div className="item-info">
                <span className="item-name">{service.name}</span>
                {service.description && (
                  <span className="item-description">{service.description}</span>
                )}
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={service.enabled}
                  onChange={() => handleToggle(service.name, service.enabled)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default MCPPanel;
