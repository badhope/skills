import React, { useState, useEffect } from 'react';
import { generateRepoMap } from '../api/client';

function RepoMapPanel() {
  const [repoMap, setRepoMap] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRepoMap = async () => {
    setLoading(true);
    setError(null);
    try {
      const map = await generateRepoMap();
      setRepoMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repo map');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepoMap();
  }, []);

  return (
    <div className="repo-map-panel">
      <div className="panel-header">
        <h2>Repository Map</h2>
        <button onClick={loadRepoMap} disabled={loading} className="refresh-btn">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="repo-map-content">
        {loading ? (
          <div className="loading-placeholder">Loading repository map...</div>
        ) : repoMap ? (
          <pre className="code-block">{repoMap}</pre>
        ) : (
          <div className="empty-placeholder">No repository map available</div>
        )}
      </div>
    </div>
  );
}

export default RepoMapPanel;
