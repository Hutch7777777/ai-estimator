'use client';

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Send, Sparkles, Trash2, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useClaudeAssistant,
  QUICK_PROMPTS,
  type ClaudeAssistantMessage,
} from '@/lib/hooks/useClaudeAssistant';
import type { PageInput } from '@/lib/utils/pageTypeMapping';

// =============================================================================
// Action Prompts - Document Generation
// =============================================================================

const ACTION_PROMPTS = [
  { id: 'window-takeoff', label: 'Window Takeoff', prompt: 'Create a window takeoff spreadsheet', icon: '📊' },
  { id: 'door-takeoff', label: 'Door Takeoff', prompt: 'Create a door takeoff spreadsheet', icon: '📊' },
  { id: 'export-schedules', label: 'Export Schedules', prompt: 'Export all schedules as spreadsheets', icon: '📋' },
  { id: 'generate-rfi', label: 'Generate RFIs', prompt: 'Generate RFIs for any missing or unclear specifications', icon: '📝' },
  { id: 'scope-of-work', label: 'Scope of Work', prompt: 'Create a scope of work for the exterior', icon: '📄' },
  { id: 'install-checklist', label: 'Checklist', prompt: 'Create an installation checklist', icon: '✅' },
] as const;

// =============================================================================
// Types
// =============================================================================

export interface PlanReaderChatbotProps {
  /** Image URL to analyze (fallback if no pages or PDF provided) */
  imageUrl: string;
  /** Current page ID for smart selection */
  currentPageId?: string;
  /** All available pages for smart selection */
  allPages?: PageInput[];
  /** PDF URL for best quality analysis (preferred over images) */
  pdfUrl?: string;
  /** Page context hint for better analysis */
  pageContext?: 'elevation' | 'schedule' | 'detail' | 'notes';
  /** Project name for generated documents */
  projectName?: string;
  /** Project address for generated documents */
  projectAddress?: string;
}

export interface PlanReaderChatbotRef {
  toggle: () => void;
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const PlanReaderChatbot = forwardRef<PlanReaderChatbotRef, PlanReaderChatbotProps>(
  function PlanReaderChatbot({
    imageUrl,
    currentPageId,
    allPages,
    pdfUrl,
    pageContext = 'elevation',
    projectName,
    projectAddress,
  }, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [showActions, setShowActions] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { isLoading, messages, askClaude, clearMessages } = useClaudeAssistant({
      imageUrl,
      currentPageId,
      allPages,
      pdfUrl,
      pageContext,
      projectName,
      projectAddress,
    });

    // Expose toggle methods via ref
    useImperativeHandle(ref, () => ({
      toggle: () => setIsOpen(prev => !prev),
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      isOpen,
    }), [isOpen]);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when panel opens
    useEffect(() => {
      if (isOpen) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }, [isOpen]);

    const handleSend = () => {
      if (!inputValue.trim() || isLoading) return;
      askClaude(inputValue.trim());
      setInputValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    const handleQuickPrompt = (prompt: string) => {
      askClaude(prompt);
    };

    // Collapsed: Floating button
    if (!isOpen) {
      return (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            'fixed bottom-6 right-6 z-50 w-14 h-14',
            'bg-purple-600 hover:bg-purple-700',
            'text-white rounded-full shadow-lg',
            'flex items-center justify-center',
            'transition-all duration-200 hover:scale-105',
            'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2'
          )}
          title="Plan Reader - Ask questions about this drawing (Cmd+K)"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      );
    }

    // Expanded: Chat panel
    return (
      <div
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'w-[380px] h-[520px]',
          'bg-white dark:bg-zinc-900',
          'rounded-xl shadow-2xl border border-gray-200 dark:border-zinc-700',
          'flex flex-col overflow-hidden',
          'animate-in slide-in-from-bottom-4 duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-purple-600 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <span className="font-semibold">Plan Reader</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="p-1.5 hover:bg-purple-700 rounded transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-purple-700 rounded transition-colors"
              title="Minimize (Cmd+K)"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Quick Prompts & Actions - Always visible when no messages */}
        {messages.length === 0 && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 space-y-3">
            {/* Toggle between Questions and Actions */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setShowActions(false)}
                className={cn(
                  'text-xs px-3 py-1 rounded-full transition-colors',
                  !showActions
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-600'
                )}
              >
                Questions
              </button>
              <button
                onClick={() => setShowActions(true)}
                className={cn(
                  'text-xs px-3 py-1 rounded-full transition-colors flex items-center gap-1',
                  showActions
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-zinc-600'
                )}
              >
                <FileSpreadsheet className="h-3 w-3" />
                Actions
              </button>
            </div>

            {!showActions ? (
              // Quick Questions
              <>
                <p className="text-xs text-muted-foreground">Quick questions:</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.slice(0, 5).map((qp) => (
                    <button
                      key={qp.id}
                      onClick={() => handleQuickPrompt(qp.prompt)}
                      disabled={isLoading}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full',
                        'bg-purple-100 dark:bg-purple-900/30',
                        'text-purple-700 dark:text-purple-300',
                        'hover:bg-purple-200 dark:hover:bg-purple-900/50',
                        'transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              // Quick Actions (Document Generation)
              <>
                <p className="text-xs text-muted-foreground">Generate documents:</p>
                <div className="flex flex-wrap gap-1.5">
                  {ACTION_PROMPTS.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickPrompt(action.prompt)}
                      disabled={isLoading}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full flex items-center gap-1',
                        'bg-green-100 dark:bg-green-900/30',
                        'text-green-700 dark:text-green-300',
                        'hover:bg-green-200 dark:hover:bg-green-900/50',
                        'transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      <span>{action.icon}</span>
                      {action.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Compact action buttons - shown when there are messages */}
        {messages.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Actions:</span>
              <div className="flex flex-wrap gap-1 overflow-x-auto">
                {ACTION_PROMPTS.slice(0, 4).map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleQuickPrompt(action.prompt)}
                    disabled={isLoading}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap',
                      'bg-green-100 dark:bg-green-900/30',
                      'text-green-700 dark:text-green-300',
                      'hover:bg-green-200 dark:hover:bg-green-900/50',
                      'transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    <span>{action.icon}</span>
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <Sparkles className="h-12 w-12 text-purple-300 dark:text-purple-700 mb-4" />
              <p className="text-sm text-muted-foreground">
                Ask me about materials, specs, or callouts in this drawing.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                I can read text, identify products, and find specifications.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm max-w-[85%]">
                    <span className="flex items-center gap-2">
                      <span className="animate-pulse">Analyzing drawing</span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-zinc-700 p-3 bg-gray-50 dark:bg-zinc-800/50">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about materials, specs..."
              className={cn(
                'flex-1 px-3 py-2 text-sm',
                'border border-gray-300 dark:border-zinc-600 rounded-lg',
                'bg-white dark:bg-zinc-900',
                'text-gray-900 dark:text-gray-100',
                'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent',
                'placeholder:text-muted-foreground',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

// =============================================================================
// Message Bubble Sub-component
// =============================================================================

interface MessageBubbleProps {
  message: ClaudeAssistantMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.content.startsWith('Error:');

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-purple-600 text-white'
            : isError
            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-100'
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
      </div>

      {/* Processing info for assistant messages */}
      {!isUser && message.processingTimeMs && (
        <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500 px-1">
          <span>{(message.processingTimeMs / 1000).toFixed(1)}s</span>
          {message.tokensUsed && (
            <span className="text-gray-300 dark:text-gray-600">
              {message.tokensUsed.input + message.tokensUsed.output} tokens
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default PlanReaderChatbot;
