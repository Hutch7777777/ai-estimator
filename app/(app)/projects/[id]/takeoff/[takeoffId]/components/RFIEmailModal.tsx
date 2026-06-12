'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, Loader2, X, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RFIEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
}

interface RFIEmailData {
  subject: string;
  body: string;
  items_count: number;
}

export default function RFIEmailModal({ isOpen, onClose, jobId }: RFIEmailModalProps) {
  const [emailData, setEmailData] = useState<RFIEmailData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'subject' | 'body' | 'all' | null>(null);

  // Editable fields
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (isOpen && jobId) {
      fetchEmailContent();
    }
  }, [isOpen, jobId]);

  useEffect(() => {
    if (emailData) {
      setSubject(emailData.subject);
      setBody(emailData.body);
    }
  }, [emailData]);

  const fetchEmailContent = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/generate-rfi?job_id=${jobId}&format=email`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to generate email');
      }

      setEmailData(result.data);
    } catch (err) {
      console.error('[RFIEmailModal] Error fetching email:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate email');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (type: 'subject' | 'body' | 'all') => {
    let textToCopy = '';

    if (type === 'subject') {
      textToCopy = subject;
    } else if (type === 'body') {
      textToCopy = body;
    } else {
      textToCopy = `Subject: ${subject}\n\n${body}`;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClose = () => {
    setEmailData(null);
    setSubject('');
    setBody('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" />
            RFI Email
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
            <p className="text-sm text-gray-500">Generating RFI email...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <X className="h-8 w-8 text-red-500 mb-3" />
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchEmailContent} className="mt-4">
              Try Again
            </Button>
          </div>
        ) : emailData?.items_count === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Check className="h-8 w-8 text-green-500 mb-3" />
            <p className="text-sm text-gray-600">All specifications are addressed. No RFI needed!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1 overflow-hidden">
            {/* Items count badge */}
            {emailData && emailData.items_count > 0 && (
              <p className="text-sm text-gray-500">
                {emailData.items_count} clarification{emailData.items_count > 1 ? 's' : ''} needed
              </p>
            )}

            {/* Subject */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Subject</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard('subject')}
                  className="h-7 px-2 text-xs"
                >
                  {copied === 'subject' ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Email Body</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard('body')}
                  className="h-7 px-2 text-xs"
                >
                  {copied === 'body' ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="flex-1 min-h-[300px] text-sm font-mono resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2 border-t">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={() => copyToClipboard('all')}>
                {copied === 'all' ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
