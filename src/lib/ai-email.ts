// =====================================================
// Leadflow Vloom - AI Email Generator (Claude API)
// =====================================================
import { supabase, getCurrentUser } from './supabase';
import type { ApiKey, Lead, EmailTemplate } from '@/types/database';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface GenerateEmailOptions {
  lead: Lead;
  template?: EmailTemplate;
  customPrompt?: string;
  tone?: 'professional' | 'casual' | 'friendly';
  senderName: string;
  senderCompany?: string;
  senderRole?: string;
}

interface GeneratedEmail {
  subject: string;
  body: string;
  reasoning?: string;
}

export class AIEmailGenerator {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateEmail(options: GenerateEmailOptions): Promise<GeneratedEmail> {
    const { lead, template, customPrompt, tone = 'professional', senderName, senderCompany, senderRole } = options;

    const systemPrompt = this.buildSystemPrompt(tone, senderName, senderCompany, senderRole);
    const userPrompt = this.buildUserPrompt(lead, template, customPrompt);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    const data = await response.json();
    const content = data.content[0]?.text || '';

    return this.parseEmailResponse(content);
  }

  private buildSystemPrompt(
    tone: string,
    senderName: string,
    senderCompany?: string,
    senderRole?: string
  ): string {
    const toneDescriptions = {
      professional: 'formal but approachable, direct and respectful of the recipient\'s time',
      casual: 'relaxed and conversational, as if talking to a colleague',
      friendly: 'warm and enthusiastic, showing genuine interest',
    };

    return `You are an expert in B2B sales outreach. Your job is to write first-touch emails that:
1. Are personalized and show you researched the company/person
2. Have an opening hook that captures attention in the first 2 seconds
3. Are concise (max 150 words in the body)
4. Have a clear, easy-to-answer CTA
5. Do NOT sound generic or like spam

Tone: ${toneDescriptions[tone as keyof typeof toneDescriptions] || toneDescriptions.professional}

Sender information:
- Name: ${senderName}
${senderCompany ? `- Company: ${senderCompany}` : ''}
${senderRole ? `- Role: ${senderRole}` : ''}

IMPORTANT: Respond ONLY in the following JSON format:
{
  "subject": "Email subject line",
  "body": "Email body with line breaks as \\n",
  "reasoning": "Brief explanation of why this approach will work"
}`;
  }

  private buildUserPrompt(
    lead: Lead,
    template?: EmailTemplate,
    customPrompt?: string
  ): string {
    const leadInfo = `
LEAD INFORMATION:
- Contact name: ${lead.contact_name || 'Not available'}
- Title/Role: ${lead.contact_title || 'Not available'}
- Company: ${lead.company_name || 'Not available'}
- Industry: ${lead.company_industry || 'Not available'}
- Company size: ${lead.company_size || 'Not available'}
- Company description: ${lead.company_description || 'Not available'}

JOB POST THEY PUBLISHED:
- Job title: ${lead.job_title || 'Not available'}
- Description: ${lead.job_description?.slice(0, 500) || 'Not available'}
- Location: ${lead.job_location || 'Not available'}
- Salary: ${lead.job_salary_range || 'Not available'}
`;

    let prompt = leadInfo;

    if (template) {
      prompt += `
BASE TEMPLATE TO USE (customize and improve):
Subject: ${template.subject}
Body: ${template.body_template}

${template.ai_prompt ? `ADDITIONAL INSTRUCTIONS: ${template.ai_prompt}` : ''}
`;
    }

    if (customPrompt) {
      prompt += `
USER-SPECIFIC INSTRUCTIONS:
${customPrompt}
`;
    }

    prompt += `
Generate a personalized outreach email based on this information.
The email must specifically reference something from the job post or the company to show it is not a mass email.
`;

    return prompt;
  }

  private parseEmailResponse(content: string): GeneratedEmail {
    try {
      // Try to parse as JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          subject: parsed.subject || 'Professional collaboration',
          body: parsed.body || content,
          reasoning: parsed.reasoning,
        };
      }
    } catch {
      // If parsing fails, extract manually
    }

    // Fallback: extract subject and body from text
    const subjectMatch = content.match(/(?:subject|asunto)[:\s]*([^\n]+)/i);
    const bodyMatch = content.match(/(?:body|cuerpo)[:\s]*([\s\S]+)/i);

    return {
      subject: subjectMatch?.[1]?.trim() || 'Professional collaboration',
      body: bodyMatch?.[1]?.trim() || content,
    };
  }

  // Generar variaciones de un email
  async generateVariations(
    options: GenerateEmailOptions,
    count: number = 3
  ): Promise<GeneratedEmail[]> {
    const variations: GeneratedEmail[] = [];

    for (let i = 0; i < count; i++) {
      const variation = await this.generateEmail({
        ...options,
        customPrompt: `${options.customPrompt || ''}\n\nEsta es la variación ${i + 1} de ${count}. Usa un approach diferente a las anteriores.`,
      });
      variations.push(variation);
    }

    return variations;
  }

  // Mejorar un email existente
  async improveEmail(
    currentSubject: string,
    currentBody: string,
    feedback: string
  ): Promise<GeneratedEmail> {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Improve this email based on the feedback:

CURRENT EMAIL:
Subject: ${currentSubject}
Body: ${currentBody}

FEEDBACK: ${feedback}

Respond in JSON format:
{
  "subject": "New subject",
  "body": "New body",
  "reasoning": "What you changed and why"
}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to improve email');
    }

    const data = await response.json();
    return this.parseEmailResponse(data.content[0]?.text || '');
  }
}

// Factory function
export async function createAIEmailGenerator(): Promise<AIEmailGenerator> {
  const user = await getCurrentUser();
  if (!user || !supabase) throw new Error('You must be logged in.');

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('api_key_encrypted')
    .eq('user_id', user.id)
    .eq('service', 'anthropic')
    .eq('is_active', true)
    .single();

  const row = apiKey as ApiKey | null;
  if (!row) {
    throw new Error('Anthropic API key not configured. Please add it in Settings.');
  }

  return new AIEmailGenerator(row.api_key_encrypted);
}

// Helper para generar email para un lead específico
export async function generateEmailForLead(
  lead: Lead,
  options: {
    templateId?: string;
    customPrompt?: string;
    tone?: 'professional' | 'casual' | 'friendly';
    senderName: string;
    senderCompany?: string;
    senderRole?: string;
  }
): Promise<GeneratedEmail> {
  const generator = await createAIEmailGenerator();

  if (!supabase) throw new Error('Supabase not configured.');
  let template: EmailTemplate | undefined;
  if (options.templateId) {
    const { data } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', options.templateId)
      .single();
    template = data || undefined;
  }

  return generator.generateEmail({
    lead,
    template,
    customPrompt: options.customPrompt,
    tone: options.tone,
    senderName: options.senderName,
    senderCompany: options.senderCompany,
    senderRole: options.senderRole,
  });
}
