import React, { useState } from 'react';
import ChatPanel from './components/ChatPanel';
import RepoMapPanel from './components/RepoMapPanel';
import PluginsPanel from './components/PluginsPanel';
import MCPPanel from './components/MCPPanel';
import SettingsPanel from './components/SettingsPanel';

type Tab = 'chat' | 'repo-map' | 'plugins' | 'mcp' | 'settings';

const tabs: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'repo-map', label: 'Repo Map' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'mcp', label: 'MCP' },
  { id: 'settings', label: 'Settings' },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  const renderPanel = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatPanel />;
      case 'repo-map':
        return <RepoMapPanel />;
      case 'plugins':
        return <PluginsPanel />;
      case 'mcp':
        return <MCPPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>DevFlow Agent</h1>
      </header>
      <nav className="app-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="app-main">
        {renderPanel()}
      </main>
    </div>
  );
}

export default App;
