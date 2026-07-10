'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const KeysPage: React.FC = () => {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const user = auth.user as any;
  const apiKey = user?.key || '';
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = apiKey;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const maskedKey = apiKey ? apiKey.substring(0, 8) + '••••••••' + apiKey.substring(apiKey.length - 8) : '';

  return (
    <div>
      <h1 className="hub-h1">{t('nav.keys', 'Keys')}</h1>
      <p className="hub-sub mb-6">
        {t('keys.description', 'Your personal API key for MCP endpoint authentication.')}
      </p>

      <div className="hub-card overflow-hidden">
        <div
          className="flex justify-between items-center py-3 px-5"
          style={{ borderBottom: '1px solid var(--hub-line-2)' }}
        >
          <div className="flex items-center gap-2.5">
            <Key size={15} className="text-[var(--hub-ink-2)]" />
            <h2 className="font-medium text-[var(--hub-ink)]">
              {t('keys.apiKey', 'API Key')}
            </h2>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
            <div className="mb-3">
              <h3 className="font-medium text-gray-700 dark:text-gray-300">
                {t('keys.yourKey', 'Your API Key')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('keys.keyDescription', 'Use this key to authenticate MCP requests. Pass it as a query parameter (?key=...) or in the AEK_MCP_KEY environment variable.')}
              </p>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <code
                className="flex-1 px-3 py-2 bg-gray-900 text-gray-100 rounded text-xs font-mono break-all"
                style={{ minHeight: 36 }}
              >
                {showKey ? apiKey : maskedKey}
              </code>
              <button
                className="hub-icon-btn"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? t('common.hide') : t('common.show')}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                className="hub-btn primary"
                onClick={handleCopy}
                disabled={!apiKey}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t('common.copied') : t('common.copy')}
              </button>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p><strong>{t('keys.username', 'Username')}:</strong> {user?.username}</p>
              <p><strong>{t('keys.role', 'Role')}:</strong> {user?.role}</p>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
};

export default KeysPage;
