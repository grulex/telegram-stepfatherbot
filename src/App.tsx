import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw, Globe2, Bot, Trash2 } from 'lucide-react';

interface Bot {
  bot_id: string;
  username: string;
  last_sync: string | null;
}

interface BotSettings {
  language: string;
  name: string;
  description: string;
  short_description: string;
}

interface Language {
  code: string;
  name: string;
}

function App() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<string | null>(() => {
    return localStorage.getItem('selectedBot');
  });
  const [settings, setSettings] = useState<BotSettings[]>([]);
  const [newBotToken, setNewBotToken] = useState('');
  const [currentLanguage, setCurrentLanguage] = useState<string>(() => {
    return localStorage.getItem('currentLanguage') || '';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<BotSettings[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBots();
    fetchLanguages();
  }, []);

  useEffect(() => {
    if (selectedBot) {
      localStorage.setItem('selectedBot', selectedBot);
      fetchBotSettings(selectedBot);
    } else {
      localStorage.removeItem('selectedBot');
    }
  }, [selectedBot]);

  useEffect(() => {
    localStorage.setItem('currentLanguage', currentLanguage);
  }, [currentLanguage]);

  const fetchBots = async () => {
    const response = await fetch('/api/bots');
    const data = await response.json();
    setBots(data);
    if (data.length > 0 && !selectedBot) {
      setSelectedBot(data[0].bot_id);
    }
  };

  const fetchBotSettings = async (botId: string) => {
    const response = await fetch(`/api/bots/${botId}/settings`);
    const data = await response.json();
    setSettings(data);
    setOriginalSettings(JSON.parse(JSON.stringify(data)));
    setHasChanges(false);
  };

  const fetchLanguages = async () => {
    try {
      const response = await fetch('/api/languages');
      const data = await response.json();
      const allLanguages = [{ code: '', name: 'Default' }, ...data];
      setLanguages(allLanguages);
      if (!currentLanguage && allLanguages.length > 0) {
        setCurrentLanguage(allLanguages[0].code);
      }
    } catch (error) {
      console.error('Failed to fetch languages:', error);
    }
  };

  const handleAddBot = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newBotToken })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Неизвестная ошибка при добавлении бота');
      }
      
      setNewBotToken('');
      await fetchBots();
    } catch (error) {
      console.error('Ошибка при добавлении бота:', error);
      setError(error instanceof Error ? error.message : 'Неизвестная ошибка при добавлении бота');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!selectedBot) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/bots/${selectedBot}/refresh`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Неизвестная ошибка при обновлении данных');
      }
      
      if (data.settings) {
        setSettings(data.settings);
        setOriginalSettings(JSON.parse(JSON.stringify(data.settings)));
        setHasChanges(false);
        await fetchBots();
      }
    } catch (error) {
      console.error('Ошибка при обновлении данных:', error);
      setError(error instanceof Error ? error.message : 'Неизвестная ошибка при обновлении данных');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedBot || !hasChanges) return;

    const currentSettings = settings.find(s => s.language === currentLanguage);
    const originalSettingsCurrent = originalSettings.find(s => s.language === currentLanguage);
    
    if (!currentSettings) return;

    const changes: {
      language: string;
      name?: string;
      description?: string;
      short_description?: string;
    } = {
      language: currentLanguage
    };

    if (currentSettings.name !== (originalSettingsCurrent?.name || '')) {
      changes.name = currentSettings.name;
    }
    if (currentSettings.description !== (originalSettingsCurrent?.description || '')) {
      changes.description = currentSettings.description;
    }
    if (currentSettings.short_description !== (originalSettingsCurrent?.short_description || '')) {
      changes.short_description = currentSettings.short_description;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/bots/${selectedBot}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Неизвестная ошибка при сохранении настроек');
      }
      
      setOriginalSettings(JSON.parse(JSON.stringify(settings)));
      setHasChanges(false);
    } catch (error) {
      console.error('Ошибка при сохранении настроек:', error);
      setError(error instanceof Error ? error.message : 'Неизвестная ошибка при сохранении настроек');
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentSettings = () => {
    const languageSettings = settings.find(s => s.language === currentLanguage);
    if (languageSettings) return languageSettings;

    const defaultSettings = settings.find(s => s.language === '');
    if (!defaultSettings) {
      return {
        language: currentLanguage,
        name: '',
        description: '',
        short_description: ''
      };
    }

    if (currentLanguage !== '') {
      return {
        ...defaultSettings,
        language: currentLanguage
      };
    }

    return defaultSettings;
  };

  const updateSetting = (field: keyof BotSettings, value: string) => {
    const newSettings = [...settings];
    const currentIndex = newSettings.findIndex(s => s.language === currentLanguage);
    
    if (currentIndex === -1) {
      if (currentLanguage === '') {
        newSettings.push({
          language: currentLanguage,
          name: field === 'name' ? value : '',
          description: field === 'description' ? value : '',
          short_description: field === 'short_description' ? value : ''
        });
      } else {
        const defaultSettings = settings.find(s => s.language === '') || {
          language: '',
          name: '',
          description: '',
          short_description: ''
        };
        
        newSettings.push({
          ...defaultSettings,
          language: currentLanguage,
          [field]: value
        });
      }
    } else {
      newSettings[currentIndex] = {
        ...newSettings[currentIndex],
        [field]: value
      };
    }
    
    setSettings(newSettings);

    const originalSettingsCurrent = originalSettings.find(s => s.language === currentLanguage);
    const currentSettings = newSettings.find(s => s.language === currentLanguage);

    const hasChanges = 
      currentSettings?.name !== (originalSettingsCurrent?.name || '') ||
      currentSettings?.description !== (originalSettingsCurrent?.description || '') ||
      currentSettings?.short_description !== (originalSettingsCurrent?.short_description || '');

    setHasChanges(hasChanges);
  };

  const handleDeleteBot = async () => {
    if (!selectedBot) return;
    
    if (!window.confirm('Вы уверены, что хотите удалить этого бота? Это действие нельзя отменить.')) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/bots/${selectedBot}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Неизвестная ошибка при удалении бота');
      }
      
      await fetchBots();
      setSelectedBot(null);
      setSettings([]);
      setOriginalSettings([]);
      setHasChanges(false);
    } catch (error) {
      console.error('Ошибка при удалении бота:', error);
      setError(error instanceof Error ? error.message : 'Неизвестная ошибка при удалении бота');
    } finally {
      setIsLoading(false);
    }
  };

  const formatLastSync = (lastSync: string | null): string => {
    if (!lastSync) return 'Никогда';
    return new Date(lastSync).toLocaleString('ru-RU');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
            {error}
          </div>
        )}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="w-8 h-8" />
              Telegram Bot Manager
            </h1>
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <select
                className="px-4 py-2 border rounded-md w-full sm:w-auto"
                value={selectedBot || ''}
                onChange={(e) => setSelectedBot(e.target.value)}
              >
                {bots.map(bot => (
                  <option key={bot.bot_id} value={bot.bot_id}>
                    @{bot.username}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                <div className="flex gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={isLoading || !selectedBot}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 flex-1 sm:flex-none"
                  >
                    <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    onClick={handleDeleteBot}
                    disabled={isLoading || !selectedBot}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 flex-1 sm:flex-none"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete Bot
                  </button>
                </div>
                {selectedBot && (
                  <div className="text-xs text-gray-500 text-center">
                    Last sync: {formatLastSync(bots.find(b => b.bot_id === selectedBot)?.last_sync || null)}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newBotToken}
                onChange={(e) => setNewBotToken(e.target.value)}
                placeholder="Enter bot token"
                className="flex-1 px-4 py-2 border rounded-md"
              />
              <button
                onClick={handleAddBot}
                disabled={isLoading || !newBotToken}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 w-full sm:w-auto"
              >
                <Plus className="w-5 h-5" />
                Add Bot
              </button>
            </div>
          </div>

          {selectedBot && (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <Globe2 className="w-6 h-6" />
                <select
                  value={currentLanguage}
                  onChange={(e) => setCurrentLanguage(e.target.value)}
                  className="px-4 py-2 border rounded-md"
                >
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={getCurrentSettings().name}
                    onChange={(e) => updateSetting('name', e.target.value)}
                    className="w-full px-4 py-2 border rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={getCurrentSettings().description}
                    onChange={(e) => updateSetting('description', e.target.value)}
                    className="w-full px-4 py-2 border rounded-md"
                    rows={4}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Short Description
                  </label>
                  <textarea
                    value={getCurrentSettings().short_description}
                    onChange={(e) => updateSetting('short_description', e.target.value)}
                    className="w-full px-4 py-2 border rounded-md"
                    rows={2}
                  />
                </div>

                <button
                  onClick={handleSaveSettings}
                  disabled={isLoading || !hasChanges}
                  className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {hasChanges ? 'Save Changes' : 'No Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;