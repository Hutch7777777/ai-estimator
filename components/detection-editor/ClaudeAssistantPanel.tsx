'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import {
  X,
  Send,
  Sparkles,
  Loader2,
  MessageSquare,
  Trash2,
  FileText,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  UseClaudeAssistantResult,
  ClaudeAssistantMessage,
} from '@/lib/hooks/useClaudeAssistant';
import { QUICK_PROMPTS } from '@/lib/hooks/useClaudeAssistant';

// =============================================================================
// Types
// =============================================================================

export interface ClaudeAssistantPanelProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Close the panel */
  onClose: () => void;
  /** Claude assistant hook result */
  assistant: UseClaudeAssistantResult;
}

// =============================================================================
// Sub-components
// =============================================================================

interface QuickPromptButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

const QuickPromptButton = memo(function QuickPromptButton({
  label,
  onClick,
  disabled,
}: QuickPromptButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-3 py-1.5 text-sm rounded-full border transition-colors',
        'border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300',
        'hover:bg-purple-50 dark:hover:bg-purple-900/30',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {label}
    </button>
  );
});

interface MessageBubbleProps {
  message: ClaudeAssistantMessage;
}

const MessageBubble = memo(function MessageBubble({
  message,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.content.startsWith('Error:');

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[95%] rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-blue-600 text-white'
            : isError
            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
      </div>

      {/* Processing info for assistant messages */}
      {!isUser && message.processingTimeMs && (
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
          <Clock className="w-3 h-3" />
          <span>{(message.processingTimeMs / 1000).toFixed(1)}s</span>
          {message.tokensUsed && (
            <span className="text-gray-300 dark:text-gray-600">
              ({message.tokensUsed.input + message.tokensUsed.output} tokens)
            </span>
          )}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

const ClaudeAssistantPanel = memo(function ClaudeAssistantPanel({
  isOpen,
  onClose,
  assistant,
}: ClaudeAssistantPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    isLoading,
    error,
    messages,
    askClaude,
    clearMessages,
  } = assistant;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    askClaude(inputValue.trim());
    setInputValue('');
  };

  const handleQuickPrompt = (prompt: string) => {
    if (isLoading) return;
    askClaude(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col shadow-xl z-40">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-indigo-600">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="w-5 h-5" />
          <div>
            <span className="font-semibold">Plan Reader</span>
            <span className="text-xs text-purple-200 block">Ask about materials & specs</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-white/20 text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-purple-50/50 dark:bg-purple-900/10">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
          <FileText className="w-3 h-3" />
          Quick questions:
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.slice(0, 6).map((qp) => (
            <QuickPromptButton
              key={qp.id}
              label={qp.label}
              onClick={() => handleQuickPrompt(qp.prompt)}
              disabled={isLoading}
            />
          ))}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm font-medium">Read Specs & Materials</p>
            <p className="text-xs mt-2 max-w-[200px]">
              Ask about siding, trim, windows, roofing, or any materials specified on this page
            </p>
            <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-xs text-left max-w-[220px]">
              <p className="font-medium text-purple-700 dark:text-purple-300 mb-1">Try asking:</p>
              <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                <li>&quot;What siding is used?&quot;</li>
                <li>&quot;What window brand?&quot;</li>
                <li>&quot;List all callouts&quot;</li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Reading the drawing...</span>
          </div>
        )}

        {/* Error display */}
        {error && !messages.some(m => m.content.includes(error)) && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-gray-200 dark:border-gray-700"
      >
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about materials or specifications..."
            disabled={isLoading}
            rows={2}
            className={cn(
              'flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600',
              'bg-white dark:bg-gray-800 px-3 py-2 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-purple-500',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          />
          <div className="flex flex-col gap-1">
            <Button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3"
            >
              <Send className="w-4 h-4" />
            </Button>
            {messages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                className="text-gray-400 hover:text-gray-600"
                title="Clear conversation"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
});

export default ClaudeAssistantPanel;
