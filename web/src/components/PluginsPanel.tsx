import React, { useState, useEffect } from 'react';
import { listPlugins, togglePlugin, Plugin } from '../api/client';

function PluginsPanel() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlugins = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listPlugins();
      if (response.success && response.data) {
        setPlugins(response.data);
      } else {
        setError(response.error?.message || 'Failed to load plugins');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlugins();
  }, []);

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      const response = await togglePlugin(name, !enabled);
      if (response.success) {
        setPlugins((prev) =>
          prev.map((p) => (p.name === name ? { ...p, enabled: !enabled } : p))
        );
      } else {
        setError(response.error?.message || 'Failed to toggle plugin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle plugin');
    }
  };

  return (
    <div className="plugins-panel">
      <div className="panel-header">
        <h2>Plugins</h2>
        <button onClick={loadPlugins} disabled={loading} className="refresh-btn">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="items-list">
        {loading ? (
          <div className="loading-placeholder">Loading plugins...</div>
        ) : plugins.length === 0 ? (
          <div className="empty-placeholder">No plugins available</div>
        ) : (
          plugins.map((plugin) => (
            <div key={plugin.name} className="list-item">
              <div className="item-info">
                <span className="item-name">{plugin.name}</span>
                {plugin.description && (
                  <span className="item-description">{plugin.description}</span>
                )}
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={plugin.enabled}
                  onChange={() => handleToggle(plugin.name, plugin.enabled)}
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

export default PluginsPanel;
