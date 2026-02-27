// =====================================================
// Leadflow Vloom - EmailComposer Component
// =====================================================
import { useState } from 'react';
import {
  X,
  Sparkles,
  Send,
  RefreshCw,
  Loader2,
  Mail,
  User,
  Building2,
  Wand2,
  Copy,
  Check,
} from 'lucide-react';
import type { Lead, EmailTemplate } from '@/types/database';

interface EmailComposerProps {
  lead: Lead;
  templates: EmailTemplate[];
  senderInfo: {
    name: string;
    email: string;
    company?: string;
    role?: string;
  };
  onGenerate: (params: {
    leadId: string;
    templateId?: string;
    customPrompt?: string;
    tone?: 'professional' | 'casual' | 'friendly';
  }) => Promise<{ subject: string; body: string }>;
  onSend: (params: {
    leadId: string;
    subject: string;
    body: string;
    templateId?: string;
  }) => Promise<void>;
  onClose: () => void;
}

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional', emoji: '💼' },
  { value: 'casual', label: 'Casual', emoji: '😊' },
  { value: 'friendly', label: 'Friendly', emoji: '🤝' },
];

export function EmailComposer({
  lead,
  templates,
  senderInfo,
  onGenerate,
  onSend,
  onClose,
}: EmailComposerProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [customPrompt, setCustomPrompt] = useState('');
  const [tone, setTone] = useState<'professional' | 'casual' | 'friendly'>('professional');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);

  const canSend = subject.trim() && body.trim() && lead.contact_email;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await onGenerate({
        leadId: lead.id,
        templateId: selectedTemplateId,
        customPrompt: customPrompt || undefined,
        tone,
      });
      setSubject(result.subject);
      setBody(result.body);
    } catch (error) {
      console.error('Failed to generate email:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    
    setIsSending(true);
    try {
      await onSend({
        leadId: lead.id,
        subject,
        body,
        templateId: selectedTemplateId,
      });
      onClose();
    } catch (error) {
      console.error('Failed to send email:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Compose Email</h2>
              <p className="text-sm text-gray-500">
                To: {lead.contact_name || 'Unknown'} at {lead.company_name || 'Unknown Company'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lead info card */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-lg font-medium text-gray-600">
              {(lead.company_name || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{lead.contact_name || 'No contact name'}</span>
                {lead.contact_email && (
                  <span className="text-sm text-gray-500">&lt;{lead.contact_email}&gt;</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  {lead.company_name || 'Unknown'}
                </span>
                {lead.contact_title && (
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {lead.contact_title}
                  </span>
                )}
              </div>
              {lead.job_title && (
                <p className="mt-1 text-sm text-blue-600">
                  Hiring for: {lead.job_title}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Generation controls */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-3">
            {/* Template selector */}
            <select
              value={selectedTemplateId || ''}
              onChange={(e) => setSelectedTemplateId(e.target.value || undefined)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">No template (AI generates from scratch)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            {/* Tone selector */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTone(opt.value as typeof tone)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tone === opt.value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>

            {/* Custom prompt toggle */}
            <button
              onClick={() => setShowPromptInput(!showPromptInput)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                showPromptInput
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Wand2 className="w-4 h-4" />
              Custom instructions
            </button>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate with AI
                </>
              )}
            </button>
          </div>

          {/* Custom prompt input */}
          {showPromptInput && (
            <div className="mt-3">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Add specific instructions for the AI, e.g., 'Mention our video editing services' or 'Focus on their recent product launch'"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                rows={2}
              />
            </div>
          )}
        </div>

        {/* Email content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Subject */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Message
              </label>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={12}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="text-sm text-gray-500">
            Sending from: <span className="font-medium text-gray-700">{senderInfo.email}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              Regenerate
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend || isSending}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Email
                </>
              )}
            </button>
          </div>
        </div>

        {/* No email warning */}
        {!lead.contact_email && (
          <div className="absolute bottom-20 left-6 right-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            ⚠️ This lead doesn't have an email address. Enrich the lead first or add the email manually.
          </div>
        )}
      </div>
    </div>
  );
}
