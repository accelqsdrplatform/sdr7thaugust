import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STAGE_CONTEXT: Record<string, { label: string; intent: string; tone: string }> = {
  Fresh: {
    label: 'Initial cold email (Fresh)',
    intent: 'Very first outreach. Build the email around the pitch angle and persona. Open with something hyper-specific to their world that makes them think "this person gets my situation." One pain point. One proof point. One CTA.',
    tone: 'Sharp, direct, confident. Every sentence earns its place.',
  },
  F1: {
    label: 'Initial outreach (F1)',
    intent: 'First cold email. Lead with the pitch angle and persona context. Open with something specific that proves you understand their world.',
    tone: 'Confident but not pushy. Lead with their world, not yours.',
  },
  F2: {
    label: 'First follow-up (F2)',
    intent: 'No reply. Use a completely different angle than the prior email - but still rooted in the pitch and persona. Add genuine new value. NEVER say "just following up" or "circling back".',
    tone: 'Warmer, more direct. One fresh hook, one proof point, one CTA.',
  },
  F3: {
    label: 'Second follow-up (F3)',
    intent: 'Still no reply. Lead with a specific result from a similar company or persona type. Make it concrete - name the outcome, timeframe, before/after. Tie it back to their pitch angle.',
    tone: 'Concise. Let the proof point do the talking.',
  },
  F4: {
    label: 'Third follow-up (F4)',
    intent: 'Ask a direct, genuine question about how they currently handle the problem the pitch angle addresses. No pitch yet - just curiosity.',
    tone: 'Short and human. 3-4 sentences max.',
  },
  F5: {
    label: 'Break-up email (F5)',
    intent: 'Final touch. Leave them with one useful insight tied to their persona and pitch angle. Close gracefully and leave the door open.',
    tone: 'Human, gracious, brief. No hard sell.',
  },
}

const CAMPAIGN_ANGLE: Record<string, string> = {
  Selenium: 'This round, lead with migrating off Selenium. Speak directly to the pain of brittle, code-heavy Selenium suites: high maintenance cost, slow test runs, constant breakage whenever the UI changes, and the engineering hours spent babysitting locators. Position ACCELQ as the self-healing, codeless alternative that cuts framework maintenance overhead and lets QA move faster without a dedicated automation engineering team.',
  Playwright: 'This round, lead with the build-vs-buy decision around Playwright. Acknowledge Playwright is a solid, modern framework - do not trash it. Position ACCELQ as the layer that removes the ongoing engineering investment of maintaining a custom framework: self-healing locators, no-code authoring for non-engineers, and built-in reporting/analytics out of the box instead of stitched-together tooling.',
  Cypress: 'This round, lead with the build-vs-buy decision around Cypress. Acknowledge Cypress is a solid, modern framework - do not trash it. Speak to its known limits (cross-origin restrictions, no native mobile support, engineer-only authoring) and position ACCELQ as the codeless, cross-platform layer that covers web, mobile, and API from one suite without the framework upkeep.',
  'Testing of AI/Agents': 'This round, lead with testing AI-driven features and autonomous agents - the hardest-to-test surface area most QA teams have not solved for yet. Speak to the challenge of validating non-deterministic, AI-driven behavior where traditional scripted assertions fall apart. Position ACCELQ as the platform built to validate AI/agent-driven flows, not just deterministic UI steps.',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { contact, stage, accountResearch, senderName, priorEmailBodies, customPrompt } = await req.json()
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const ctx = STAGE_CONTEXT[stage] || STAGE_CONTEXT.F1
    const research = accountResearch || {}

    const priorEmails = Array.isArray(priorEmailBodies) && priorEmailBodies.length > 0
      ? `\nPRIOR EMAILS SENT - use a COMPLETELY DIFFERENT angle (different hook, different pain, different proof):\n${priorEmailBodies.map((b: string, i: number) => `--- Email ${i + 1} ---\n${b}`).join('\n\n')}\n`
      : ''

    const customInstructions = customPrompt?.trim()
      ? `\nSDR CUSTOM INSTRUCTIONS - follow these exactly, they override everything else:\n${customPrompt.trim()}\n`
      : ''

    const campaignAngle = CAMPAIGN_ANGLE[contact.campaign] || null
    const campaignBlock = campaignAngle
      ? `\n========================================\nCAMPAIGN ANGLE FOR THIS EMAIL\n========================================\n${campaignAngle}\nWeave this angle into the pain point and proof point - do not just bolt it on as a separate paragraph.\n`
      : ''

    const pitchTypeBlock = contact.pitch_type
      ? `\nPlatform / environment they run today: ${contact.pitch_type}\n`
      : ''

    const fmtArr = (a: any) => Array.isArray(a) && a.length > 0 ? a.join(', ') : null;
    const fmtObj = (a: any) => {
      if (!a) return null;
      if (Array.isArray(a)) return a.length > 0 ? a.map((x:any) => typeof x === 'object' ? JSON.stringify(x) : x).join(', ') : null;
      if (typeof a === 'object') return JSON.stringify(a);
      return String(a);
    };

    const prompt = `You are an elite SDR at ACCELQ, an AI-powered test automation platform. ACCELQ helps QA teams eliminate manual testing and fragile scripts with self-healing, codeless automation. Real results: teams cut test maintenance by 60-90% and shrink release cycles from weeks to days.

Write a cold email for stage: ${ctx.label}

========================================
PRIMARY INPUTS - BUILD THE EMAIL AROUND THESE FIRST
========================================
Pitch angle (the core message to lead with): ${contact.pitch || 'ACCELQ self-healing automation reduces test maintenance and speeds up releases'}
Persona / who this person is: ${contact.persona || 'QA leader or engineering manager responsible for testing quality and release speed'}
${pitchTypeBlock}
These two fields are the MOST IMPORTANT inputs. The email must directly address the pitch angle and speak to the persona's specific challenges, goals, and language. Everything else below supports and personalizes these.
${campaignBlock}
========================================
ACCOUNT OVERVIEW (use to understand their business and personalize)
========================================
Company: ${contact.company}
Industry: ${contact.industry || research.detectedIndustry || 'unknown'}
Overview / About: ${research.overview || 'not available'}
Products & Services: ${fmtObj(research.productsServices) || 'unknown'}
Employees: ${research.employees || 'unknown'}
Revenue: ${research.revenue || 'unknown'}
Funding: ${fmtObj(research.funding) || 'unknown'}

========================================
TECH STACK (critical for personalizing the pitch)
========================================
Testing tools: ${fmtArr(research.testingTools) || research.techStack || 'unknown'}
Enterprise apps: ${fmtArr(research.enterpriseApps) || 'unknown'}
SaaS apps: ${fmtArr(research.saasApps) || 'unknown'}

========================================
SIGNALS & INTELLIGENCE
========================================
Recent signals / triggers: ${fmtArr(research.signals) || fmtArr(research.aiSignals) || research.recentNews || 'none'}
ICP notes: ${research.icpNotes || 'none'}
Important to know: ${fmtObj(research.importantToKnow) || 'none'}
Account notes: ${research.notes || 'none'}

========================================
CONTACT CONTEXT
========================================
Name: ${contact.full_name}
Title: ${contact.title || 'unknown'}
Response so far: ${contact.response || 'no response yet'}
Pain points: ${research.painPoints || 'manual testing overhead, slow release cycles, fragile scripts'}
Why target them: ${research.whyTarget || 'strong fit for ACCELQ'}
${priorEmails}${customInstructions}
========================================
STAGE GOAL: ${ctx.intent}
TONE: ${ctx.tone}
========================================

OPENING LINE - most important:
- Must be about THEM specifically - their role, their industry challenge, or a pain point the persona feels every day
- Must connect directly to the pitch angle
- Never open with "I", "My name is", "I hope", "We at ACCELQ"
- Never be generic - must feel written for this specific person
- Good: "Most QA leads at [industry] companies I speak with are spending more time fixing broken scripts than shipping new coverage."
- Good: "When [company] ships weekly, every flaky test in the regression suite costs real sprint time."
- Bad: "I came across your profile and thought ACCELQ might be a fit."

BODY RULES:
- One pain point rooted in the pitch angle and persona context
- One proof point: specific result, number, timeframe (e.g. "one similar team cut regression time from 3 weeks to 4 days")
- One CTA: a low-friction question like "Worth a quick 15-min call?" - never a Calendly link
- 80-120 words total
- Plain text only - no bullets, no bold, no markdown

ABSOLUTE RULES:
- Never use em dashes or en dashes - use commas or plain hyphens
- Never say: "I hope this finds you well", "just following up", "circling back", "touching base", "reaching out because", "I wanted to"
- Subject line: under 50 characters, specific, no spam words, no ALL CAPS
- NEVER include a closing/sign-off line (no "Thanks", "Best", "Regards", "Best regards", etc.) and NEVER include a sender name anywhere in the body. The email must end immediately after the CTA question - no name, no signature block.

Return ONLY a valid JSON object:
{"subject": "subject line here", "body": "full email body with greeting only - end right after the CTA question, no sign-off, no sender name"}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const aiData = await response.json()
    const rawText = aiData.content?.[0]?.text || '{}'

    let parsed: any = {}
    try {
      const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return new Response(JSON.stringify({ error: 'AI returned invalid JSON', raw: rawText }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const clean = (s: string) => (s || '')
      .replace(/[—–]/g, '')
      .replace(/  +/g, ' ')
      .trim()

    const stripSignoff = (s: string) => s
      .replace(/\n{1,2}(thanks|best|regards|best regards|warm regards|cheers|sincerely)[,!.]?\s*\n[^\n]{0,60}$/i, '')
      .replace(/\n{1,2}(thanks|best|regards|best regards|warm regards|cheers|sincerely)[,!.]?\s*$/i, '')
      .trim()

    return new Response(JSON.stringify({ subject: clean(parsed.subject), body: stripSignoff(clean(parsed.body)) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
