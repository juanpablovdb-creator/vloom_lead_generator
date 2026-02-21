// =====================================================
// LEADFLOW - SendGrid Client
// =====================================================
import { supabase } from './supabase';
import type { Lead, EmailSent } from '@/types/database';

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3';

interface SendEmailOptions {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  replyTo?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

interface SendGridResponse {
  messageId: string;
  status: 'sent' | 'failed';
  error?: string;
}

export class SendGridClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendEmail(options: SendEmailOptions): Promise<SendGridResponse> {
    const {
      to,
      from,
      fromName,
      subject,
      body,
      replyTo,
      trackOpens = true,
      trackClicks = true,
    } = options;

    const payload = {
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
      from: {
        email: from,
        name: fromName,
      },
      reply_to: replyTo ? { email: replyTo } : undefined,
      subject,
      content: [
        {
          type: 'text/html',
          value: body.replace(/\n/g, '<br>'),
        },
      ],
      tracking_settings: {
        open_tracking: { enable: trackOpens },
        click_tracking: { enable: trackClicks },
      },
    };

    const response = await fetch(`${SENDGRID_API_URL}/mail/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        messageId: '',
        status: 'failed',
        error: `SendGrid error: ${error}`,
      };
    }

    // SendGrid devuelve el message ID en los headers
    const messageId = response.headers.get('X-Message-Id') || '';

    return {
      messageId,
      status: 'sent',
    };
  }

  // Verificar dominio/sender
  async verifySender(email: string): Promise<boolean> {
    const response = await fetch(`${SENDGRID_API_URL}/verified_senders`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) return false;

    const data = await response.json();
    return data.results?.some((sender: { from_email: string }) => 
      sender.from_email === email
    );
  }
}

// Factory function
export async function createSendGridClient(): Promise<SendGridClient> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id')
    .single();

  if (!profile?.team_id) {
    throw new Error('No team found');
  }

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('api_key_encrypted')
    .eq('team_id', profile.team_id)
    .eq('service', 'sendgrid')
    .eq('is_active', true)
    .single();

  if (!apiKey) {
    throw new Error('SendGrid API key not configured. Please add it in Settings.');
  }

  return new SendGridClient(apiKey.api_key_encrypted);
}

// Enviar email a un lead y guardar en historial
export async function sendEmailToLead(params: {
  lead: Lead;
  subject: string;
  body: string;
  templateId?: string;
  fromEmail: string;
  fromName?: string;
}): Promise<EmailSent> {
  const { lead, subject, body, templateId, fromEmail, fromName } = params;

  if (!lead.contact_email) {
    throw new Error('Lead does not have an email address');
  }

  const client = await createSendGridClient();
  
  const result = await client.sendEmail({
    to: lead.contact_email,
    from: fromEmail,
    fromName,
    subject,
    body,
  });

  // Obtener usuario actual
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Guardar en historial
  const emailRecord: Omit<EmailSent, 'id' | 'created_at' | 'updated_at'> = {
    user_id: user.id,
    lead_id: lead.id,
    template_id: templateId || null,
    subject,
    body,
    sendgrid_message_id: result.messageId || null,
    status: result.status === 'sent' ? 'sent' : 'failed',
    sent_at: result.status === 'sent' ? new Date().toISOString() : null,
    opened_at: null,
    clicked_at: null,
    metadata: result.error ? { error: result.error } : {},
  };

  const { data: savedEmail, error } = await supabase
    .from('emails_sent')
    .insert(emailRecord)
    .select()
    .single();

  if (error) throw error;

  // Actualizar status del lead
  if (result.status === 'sent') {
    await supabase
      .from('leads')
      .update({ status: 'invite_sent' })
      .eq('id', lead.id);
  }

  return savedEmail;
}

// Enviar emails en bulk
export async function sendBulkEmails(params: {
  leads: Lead[];
  subject: string;
  bodyTemplate: string;
  templateId?: string;
  fromEmail: string;
  fromName?: string;
  delayMs?: number;
}): Promise<{ sent: number; failed: number; errors: string[] }> {
  const { leads, subject, bodyTemplate, templateId, fromEmail, fromName, delayMs = 1000 } = params;
  
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const lead of leads) {
    if (!lead.contact_email) {
      results.failed++;
      results.errors.push(`Lead ${lead.id}: No email address`);
      continue;
    }

    try {
      // Personalizar body
      const personalizedBody = personalizeTemplate(bodyTemplate, lead);
      const personalizedSubject = personalizeTemplate(subject, lead);

      await sendEmailToLead({
        lead,
        subject: personalizedSubject,
        body: personalizedBody,
        templateId,
        fromEmail,
        fromName,
      });

      results.sent++;

      // Delay entre emails para evitar rate limiting
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Lead ${lead.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

// Personalizar template con datos del lead
function personalizeTemplate(template: string, lead: Lead): string {
  const replacements: Record<string, string> = {
    '{{contact_name}}': lead.contact_name || 'there',
    '{{contact_first_name}}': lead.contact_name?.split(' ')[0] || 'there',
    '{{contact_title}}': lead.contact_title || '',
    '{{company_name}}': lead.company_name || 'your company',
    '{{job_title}}': lead.job_title || '',
    '{{company_industry}}': lead.company_industry || '',
    '{{company_size}}': lead.company_size || '',
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(key, 'g'), value);
  }

  return result;
}
