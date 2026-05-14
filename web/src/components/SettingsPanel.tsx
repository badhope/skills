import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings, Settings } from '../api/client';

function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateSettings(settings);
      setSuccess('Settings saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  if (loading) {
    return (
      <div className="settings-panel">
        <div className="loading-placeholder">Loading settings...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="settings-panel">
        <div className="error-message">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <div className="panel-header">
        <h2>Settings</h2>
      </div>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      <div className="settings-form">
        <div className="form-group">
          <label htmlFor="model">Model</label>
          <input
            id="model"
            type="text"
            value={settings.model}
            onChange={(e) => handleChange('model', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="workspace">Workspace</label>
          <input
            id="workspace"
            type="text"
            value={settings.workspace}
            onChange={(e) => handleChange('workspace', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="maxTokens">Max Tokens</label>
          <input
            id="maxTokens"
            type="number"
            value={settings.maxTokens}
            onChange={(e) => handleChange('maxTokens', parseInt(e.target.value, 10))}
          />
        </div>
        <div className="form-group">
          <label htmlFor="temperature">Temperature</label>
          <input
            id="temperature"
            type="number"
            step="0.1"
            value={settings.temperature}
            onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
          />
        </div>
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={settings.autoCheckpoint}
              onChange={(e) => handleChange('autoCheckpoint', e.target.checked)}
            />
            Auto Checkpoint
          </label>
        </div>
        <div className="form-actions">
          <button onClick={handleSave} disabled={saving} className="save-btn">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
