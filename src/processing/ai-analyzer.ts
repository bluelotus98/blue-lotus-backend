/**
 * AI Analyzer using OpenAI GPT-4o
 *
 * Analyzes call transcripts to extract:
 * - Sentiment (positive/negative/neutral)
 * - Products mentioned
 * - Issues identified
 * - Opportunity value
 */

import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface CallAnalysis {
  sentiment_score: number; // -1.0 (very negative) to 1.0 (very positive)
  sentiment_label: 'positive' | 'neutral' | 'negative';
  products_mentioned: string[]; // Array of product names
  issues_identified: string[]; // Array of issues
  opportunity_value: number; // 0 (low) to 100 (high)
  summary: string; // Brief call summary
}

/**
 * Analyze call transcript using GPT-4o
 *
 * @param transcript - Call transcript text
 * @param businessType - Type of business (e.g., 'tax', 'dental', 'restaurant')
 * @returns Structured analysis of the call
 */
export async function analyzeCallWithGPT(
  transcript: string,
  businessType: string = 'general'
): Promise<CallAnalysis> {
  try {
    const prompt = buildAnalysisPrompt(transcript, businessType);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // GPT-4o model
      messages: [
        {
          role: 'system',
          content:
            'You are an expert business analyst specializing in customer call analysis. ' +
            'Analyze call transcripts and provide structured insights about sentiment, products, issues, and opportunity value. ' +
            'Always respond with valid JSON only, no additional text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent output
      response_format: { type: 'json_object' }, // Force JSON response
    });

    const responseText = completion.choices[0].message.content;
    if (!responseText) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON response
    const analysis = JSON.parse(responseText);

    // Validate and normalize the response
    return normalizeAnalysis(analysis);
  } catch (error) {
    console.error('[AI Analyzer] Error analyzing call:', error);
    throw error;
  }
}

/**
 * Build analysis prompt based on business type
 */
function buildAnalysisPrompt(transcript: string, businessType: string): string {
  const businessContext = getBusinessContext(businessType);

  return `
Analyze this customer call transcript and extract the following information:

**Business Type**: ${businessType}
**Business Context**: ${businessContext}

**Transcript**:
${transcript}

**Instructions**:
1. **Sentiment**: Determine overall sentiment on a scale from -1.0 (very negative) to 1.0 (very positive)
2. **Products/Services**: List specific products or services mentioned by name
3. **Issues**: Identify any problems, concerns, or pain points the customer mentioned
4. **Opportunity Value**: Rate lead quality from 0-100 based on buying intent, urgency, budget signals
5. **Summary**: Write a 1-2 sentence summary of the call

**Output Format** (JSON):
{
  "sentiment_score": <number between -1.0 and 1.0>,
  "sentiment_label": "<positive|neutral|negative>",
  "products_mentioned": ["product1", "product2"],
  "issues_identified": ["issue1", "issue2"],
  "opportunity_value": <number between 0 and 100>,
  "summary": "<brief call summary>"
}

**Important**:
- Return ONLY valid JSON, no markdown code blocks
- Use empty arrays [] if no products/issues found
- sentiment_label must be one of: positive, neutral, negative
- sentiment_score: positive (0.3 to 1.0), neutral (-0.3 to 0.3), negative (-1.0 to -0.3)
`;
}

/**
 * Get business-specific context for better analysis
 */
function getBusinessContext(businessType: string): string {
  const contexts: Record<string, string> = {
    tax: 'Tax preparation and accounting services. Common services: Individual Tax Return, Business Tax Return, ITIN Application, Tax Consultation, Bookkeeping. Common issues: Missing documents, pricing questions, deadline concerns.',
    dental: 'Dental practice. Common services: Cleaning, Exam, X-rays, Fillings, Crowns, Root Canal, Whitening. Common issues: Insurance coverage, pricing, pain/urgency, appointment availability.',
    restaurant: 'Restaurant. Common needs: Reservations, catering, menu questions, dietary restrictions. Common issues: Wait times, food quality, allergies.',
    legal: 'Legal services. Common services: Consultation, Document review, Representation, Contract drafting. Common issues: Cost concerns, case complexity, urgency.',
    medical: 'Medical practice. Common services: Checkup, Sick visit, Lab tests, Prescriptions. Common issues: Insurance, symptoms, appointment availability, follow-up.',
    general: 'General business services. Identify products/services mentioned and customer concerns.',
  };

  return contexts[businessType] || contexts.general;
}

/**
 * Normalize and validate AI response
 */
function normalizeAnalysis(raw: any): CallAnalysis {
  // Ensure sentiment_score is in range
  let sentimentScore = parseFloat(raw.sentiment_score) || 0;
  sentimentScore = Math.max(-1.0, Math.min(1.0, sentimentScore));

  // Derive sentiment_label from score if not provided
  let sentimentLabel = raw.sentiment_label;
  if (!sentimentLabel || !['positive', 'neutral', 'negative'].includes(sentimentLabel)) {
    if (sentimentScore > 0.3) sentimentLabel = 'positive';
    else if (sentimentScore < -0.3) sentimentLabel = 'negative';
    else sentimentLabel = 'neutral';
  }

  // Ensure arrays
  const productsMentioned = Array.isArray(raw.products_mentioned)
    ? raw.products_mentioned.filter((p: any) => typeof p === 'string')
    : [];

  const issuesIdentified = Array.isArray(raw.issues_identified)
    ? raw.issues_identified.filter((i: any) => typeof i === 'string')
    : [];

  // Ensure opportunity_value is in range
  let opportunityValue = parseInt(raw.opportunity_value) || 0;
  opportunityValue = Math.max(0, Math.min(100, opportunityValue));

  return {
    sentiment_score: sentimentScore,
    sentiment_label: sentimentLabel as 'positive' | 'neutral' | 'negative',
    products_mentioned: productsMentioned,
    issues_identified: issuesIdentified,
    opportunity_value: opportunityValue,
    summary: raw.summary || 'Call analysis completed',
  };
}

/**
 * Batch analyze multiple calls (for backfilling)
 *
 * @param calls - Array of { id, transcript, businessType }
 * @param concurrency - Number of concurrent API calls (default: 5)
 * @returns Array of { id, analysis }
 */
export async function batchAnalyzeCalls(
  calls: Array<{ id: string; transcript: string; businessType?: string }>,
  concurrency: number = 5
): Promise<Array<{ id: string; analysis: CallAnalysis; error?: string }>> {
  const results: Array<{ id: string; analysis: CallAnalysis; error?: string }> = [];

  // Process in batches
  for (let i = 0; i < calls.length; i += concurrency) {
    const batch = calls.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (call) => {
        try {
          const analysis = await analyzeCallWithGPT(call.transcript, call.businessType);
          return { id: call.id, analysis };
        } catch (error: any) {
          console.error(`[AI Analyzer] Error analyzing call ${call.id}:`, error.message);
          return {
            id: call.id,
            analysis: getDefaultAnalysis(),
            error: error.message,
          };
        }
      })
    );

    results.push(...batchResults);

    // Rate limiting: wait 1 second between batches
    if (i + concurrency < calls.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Get default analysis for failed calls
 */
function getDefaultAnalysis(): CallAnalysis {
  return {
    sentiment_score: 0,
    sentiment_label: 'neutral',
    products_mentioned: [],
    issues_identified: [],
    opportunity_value: 50,
    summary: 'Analysis unavailable',
  };
}
