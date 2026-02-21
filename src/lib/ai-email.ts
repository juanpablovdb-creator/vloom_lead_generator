// =====================================================
// LEADFLOW - AI Email Generator (Claude API)
// =====================================================
import { supabase } from './supabase';
import type { Lead, EmailTemplate } from '@/types/database';

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
      professional: 'formal pero cercano, directo y respetuoso del tiempo del destinatario',
      casual: 'relajado y conversacional, como si hablaras con un colega',
      friendly: 'cálido y entusiasta, mostrando genuino interés',
    };

    return `Eres un experto en outreach de ventas B2B. Tu trabajo es escribir emails de primer contacto que:
1. Sean personalizados y muestren que investigaste sobre la empresa/persona
2. Tengan un hook inicial que capture atención en los primeros 2 segundos
3. Sean concisos (máximo 150 palabras en el cuerpo)
4. Tengan un CTA claro y fácil de responder
5. NO suenen genéricos ni como spam

Tono: ${toneDescriptions[tone as keyof typeof toneDescriptions] || toneDescriptions.professional}

Información del remitente:
- Nombre: ${senderName}
${senderCompany ? `- Empresa: ${senderCompany}` : ''}
${senderRole ? `- Rol: ${senderRole}` : ''}

IMPORTANTE: Responde SOLO en el siguiente formato JSON:
{
  "subject": "Línea de asunto del email",
  "body": "Cuerpo del email con saltos de línea como \\n",
  "reasoning": "Breve explicación de por qué este approach funcionará"
}`;
  }

  private buildUserPrompt(
    lead: Lead,
    template?: EmailTemplate,
    customPrompt?: string
  ): string {
    const leadInfo = `
INFORMACIÓN DEL LEAD:
- Nombre del contacto: ${lead.contact_name || 'No disponible'}
- Título/Rol: ${lead.contact_title || 'No disponible'}
- Empresa: ${lead.company_name || 'No disponible'}
- Industria: ${lead.company_industry || 'No disponible'}
- Tamaño de empresa: ${lead.company_size || 'No disponible'}
- Descripción de la empresa: ${lead.company_description || 'No disponible'}

INFORMACIÓN DEL JOB POST QUE PUBLICARON:
- Título del puesto: ${lead.job_title || 'No disponible'}
- Descripción: ${lead.job_description?.slice(0, 500) || 'No disponible'}
- Ubicación: ${lead.job_location || 'No disponible'}
- Salario: ${lead.job_salary_range || 'No disponible'}
`;

    let prompt = leadInfo;

    if (template) {
      prompt += `
TEMPLATE BASE A USAR (personaliza y mejora):
Asunto: ${template.subject}
Cuerpo: ${template.body_template}

${template.ai_prompt ? `INSTRUCCIONES ADICIONALES: ${template.ai_prompt}` : ''}
`;
    }

    if (customPrompt) {
      prompt += `
INSTRUCCIONES ESPECÍFICAS DEL USUARIO:
${customPrompt}
`;
    }

    prompt += `
Genera un email de outreach personalizado basado en esta información. 
El email debe hacer referencia específica a algo del job post o la empresa para demostrar que no es un email masivo.
`;

    return prompt;
  }

  private parseEmailResponse(content: string): GeneratedEmail {
    try {
      // Intentar parsear como JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          subject: parsed.subject || 'Colaboración profesional',
          body: parsed.body || content,
          reasoning: parsed.reasoning,
        };
      }
    } catch {
      // Si falla el parsing, extraer manualmente
    }

    // Fallback: extraer subject y body del texto
    const subjectMatch = content.match(/(?:subject|asunto)[:\s]*([^\n]+)/i);
    const bodyMatch = content.match(/(?:body|cuerpo)[:\s]*([\s\S]+)/i);

    return {
      subject: subjectMatch?.[1]?.trim() || 'Colaboración profesional',
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
            content: `Mejora este email basándote en el feedback:

EMAIL ACTUAL:
Asunto: ${currentSubject}
Cuerpo: ${currentBody}

FEEDBACK: ${feedback}

Responde en formato JSON:
{
  "subject": "Nuevo asunto",
  "body": "Nuevo cuerpo",
  "reasoning": "Qué cambiaste y por qué"
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
    .eq('service', 'anthropic')
    .eq('is_active', true)
    .single();

  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Please add it in Settings.');
  }

  return new AIEmailGenerator(apiKey.api_key_encrypted);
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
