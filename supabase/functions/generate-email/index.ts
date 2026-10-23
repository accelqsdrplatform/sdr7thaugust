import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================
// 6 - STAGE SPECS (verbatim from PROMPT-email-generation.md)
// ============================================================
const STAGE_SPEC: Record<string, string> = {
  Fresh: `First touch. Under 100 words, three short paragraphs.
  1. One specific observation about their environment.
  2. What ACCELQ changes, tied to a business outcome.
  3. A question.
CTA: a question answerable in one line. No meeting duration, no time, no link.`,
  F1: `Follow-up 1. Under 80 words.
A genuinely different angle from Fresh: different pain, different entry point.
Not a reminder. Do not reference the previous email in any way.
CTA: a question, different from the one already asked.`,
  F2: `Follow-up 2. Under 80 words.
Lead with proof: who (industry or profile, not a name unless the ledger gives
one) -> their problem -> what got automated -> the measured outcome. If
VERIFIED PROOF is empty, invent no case study: describe the failure pattern
common on this platform and what removes it.
CTA: a question.`,
  F3: `Follow-up 3. Under 60 words. ZERO PITCH.
Do not mention ACCELQ, its capabilities, or any outcome. One direct question
about a pain point not yet raised. Conversational, as if typed quickly.`,
  F4: `Follow-up 4. Under 50 words.
One useful observation about their platform, release model or testing
landscape. No pitch. NO CTA AT ALL - end on the observation. Must be worth
reading even if they never reply.`,
  F5: `Follow-up 5, final. Under 70 words.
Acknowledge the outreach gracefully, leave one parting insight, leave the door
open. Zero selling. Ask for nothing. No deadline, no guilt, no reference to
closing their file.`,
}

// Fixed rotation of 6 general pain axes, one assigned per stage so each email
// in the sequence works a different angle. Not account-specific yet - there is
// no per-account axis data model today. Swap AXES_BY_STAGE for a real
// account-level axis lookup if/when that data exists.
const AXES: { name: string; text: string }[] = [
  { name: 'Release risk', text: 'Undetected regressions shipping to production because testing cannot keep pace with the release cadence.' },
  { name: 'Team bandwidth', text: 'Automation and QA engineers spending more time maintaining tests than writing new coverage.' },
  { name: 'Maintenance cost', text: 'The ongoing cost of keeping an automation suite from breaking on every UI or workflow change.' },
  { name: 'Coverage gaps', text: 'Parts of the system that only get tested manually, if they get tested at all, because scripting them is not worth the effort.' },
  { name: 'Tooling fit', text: 'Whether the current testing approach actually fits how the team ships today, or has become something people work around.' },
  { name: 'Confidence at release', text: 'Whether the team can say with any confidence that a release is safe, rather than hoping nothing breaks.' },
]
const AXES_BY_STAGE: Record<string, { name: string; text: string }> = {
  Fresh: AXES[0], F1: AXES[1], F2: AXES[2], F3: AXES[3], F4: AXES[4], F5: AXES[5],
}

// ============================================================
// 7 - PLATFORM PROFILES (one per pitch_type)
// ============================================================
const PLATFORM_PROFILE: Record<string, { cadence: string; architecture: string; testingImplication: string }> = {
  Salesforce: {
    cadence: 'Three major platform releases a year (seasonal), plus continuous org-level config and Apex changes in between.',
    architecture: 'Declarative config (flows, validation rules) alongside custom Apex and Lightning Web Components, often layered with multiple AppExchange packages.',
    testingImplication: 'Every release and every admin-made config change can silently break flows, validation rules or integrations that nobody flagged as "a change".',
  },
  ServiceNow: {
    cadence: 'Two major platform upgrades a year, plus frequent incremental changes to workflows, forms and integrations between upgrades.',
    architecture: 'Low-code workflow engine with heavy customization across ITSM/ITOM/HR modules, usually wired into a web of upstream and downstream integrations.',
    testingImplication: 'Upgrades and workflow tweaks regularly break cross-module processes that only surface once a ticket fails to route correctly in production.',
  },
  SAP: {
    cadence: 'Long upgrade cycles for core ERP, but frequent transport-based changes moving through dev/QA/prod landscapes.',
    architecture: 'Deeply customized core modules (FI/CO, MM, SD) with custom ABAP code and tight coupling between modules.',
    testingImplication: 'A transport that looks isolated can ripple across modules, and regression testing the full landscape by hand is what eats QA headcount.',
  },
  Workday: {
    cadence: 'Two mandatory platform updates a year pushed by Workday itself, plus ongoing configuration changes to business processes.',
    architecture: 'Configuration-driven business processes (HR, payroll, finance) with extensive integrations to downstream systems.',
    testingImplication: 'Mandatory updates arrive on Workday\'s calendar, not the customer\'s, so regression testing has a hard deadline every time.',
  },
  Oracle: {
    cadence: 'Quarterly cloud updates (Fusion/Cloud ERP) or less frequent on-prem patch cycles, depending on deployment.',
    architecture: 'Modular ERP/EPM suite with heavy configuration and custom extensions, often integrated with legacy on-prem systems.',
    testingImplication: 'Quarterly updates are mandatory and often touch more of the system than the release notes suggest.',
  },
  'MS Dynamics': {
    cadence: 'Twice-yearly wave releases plus continuous updates to Power Platform customizations.',
    architecture: 'Model-driven apps and Power Automate flows layered over the core CRM/ERP modules, frequently extended by business users.',
    testingImplication: 'Business-user-built customizations multiply fast and rarely get regression tested the same way IT-built ones do.',
  },
  Pega: {
    cadence: 'Platform upgrades plus frequent case-management and rules changes shipped by the business process team.',
    architecture: 'Rules-driven case management with complex inheritance hierarchies that are easy to misconfigure.',
    testingImplication: 'A rule change meant for one case type can silently cascade through the inheritance hierarchy into others.',
  },
  nCino: {
    cadence: 'Quarterly nCino platform releases layered on top of the underlying Salesforce release cadence.',
    architecture: 'Banking/lending workflows built on Salesforce, so changes compound from both nCino and the underlying platform.',
    testingImplication: 'Two release cadences stacked on top of each other means double the surface area for something to break unnoticed.',
  },
  Coupa: {
    cadence: 'Quarterly Coupa platform releases plus ongoing changes to approval workflows and supplier integrations.',
    architecture: 'Procure-to-pay workflows with configurable approval chains and numerous ERP/supplier integrations.',
    testingImplication: 'Approval-chain changes are easy to misconfigure and usually surface only when an invoice gets stuck.',
  },
  Web: {
    cadence: 'Continuous deployment, often multiple releases a day.',
    architecture: 'Modern web stack with frequent UI and API changes shipped independently of each other.',
    testingImplication: 'The faster the release cadence, the less time there is to manually regression test before the next deploy goes out.',
  },
  Mobile: {
    cadence: 'App store release cycles plus OS-version fragmentation to track across releases.',
    architecture: 'Native or cross-platform mobile app with device- and OS-version-specific behavior.',
    testingImplication: 'The same build can pass on one device/OS combination and silently fail on another.',
  },
  API: {
    cadence: 'Independent service deploys, often many times a day across multiple teams.',
    architecture: 'Distributed services with contracts other teams and systems depend on.',
    testingImplication: 'A contract-breaking change in one service can fail silently downstream until a consumer\'s production traffic breaks.',
  },
}

// ============================================================
// 9 - PERSONA PROFILES
// ============================================================
const PERSONA_PROFILE: Record<string, { language: string; never: string; cta: string }> = {
  'Executive / Economic Buyer': {
    language: 'Business outcomes, risk, cost, time-to-market. Not tool names or technical mechanics.',
    never: 'Do not walk them through feature lists or technical implementation detail.',
    cta: 'A low-commitment ask tied to a business question - e.g. a short call to see if the economics make sense for their org.',
  },
  'QA / Quality Leader': {
    language: 'Team capacity, coverage, release confidence, how work actually gets distributed across the team.',
    never: 'Do not talk down to them about testing basics or imply their process is sloppy.',
    cta: 'A specific, practical ask: a look at how a similar team restructured their regression suite.',
  },
  'Engineering Leader': {
    language: 'Velocity, technical debt, how testing fits (or does not) into the engineering workflow.',
    never: 'Do not pitch anything that sounds like it adds process overhead for its own sake.',
    cta: 'An offer to see how the approach fits into their existing CI/CD pipeline, not a generic demo.',
  },
  'Automation / Technical Expert': {
    language: 'Specific and technical: locators, flakiness, framework maintenance, CI integration.',
    never: 'Do not be vague or marketing-speak with this persona - they disengage immediately.',
    cta: 'A concrete, technical ask: compare notes on how they are currently handling the pain point raised.',
  },
  'DevOps / Transformation / Architecture': {
    language: 'Pipeline integration, scalability across teams, standardization, reducing tool sprawl.',
    never: 'Do not pitch point solutions that add another siloed tool to their stack.',
    cta: 'An ask framed around fitting into their broader transformation roadmap, not a standalone tool eval.',
  },
  'Practitioner / End User': {
    language: 'Day-to-day workload, repetitive manual work, what would make their job less tedious.',
    never: 'Do not pitch strategic transformation language to someone focused on getting through today\'s test cycle.',
    cta: 'A low-pressure ask: a quick look at whether this would save them time on what they are doing right now.',
  },
}

// ============================================================
// 8 - CAMPAIGN base angles + combinators
// ============================================================
const CAMPAIGN_BASE: Record<string, string> = {
  Selenium: 'migrating off Selenium: the maintenance burden of a large, brittle, locator-based suite that breaks on every UI change.',
  Playwright: 'the build-vs-buy question on Playwright - a solid, modern framework, but one that still requires ongoing engineering investment to maintain.',
  Cypress: 'the build-vs-buy question on Cypress - a solid, modern framework, but one with real limits (cross-origin, no native mobile) and ongoing maintenance cost.',
  'Testing of AI/Agents': 'testing AI-driven features and autonomous agents - the hardest surface area to validate because the output is not deterministic.',
}

function campaignPlatformPain(campaign: string, pitchType: string | undefined): string {
  const base = CAMPAIGN_BASE[campaign]
  if (!base) return ''
  const platform = pitchType ? PLATFORM_PROFILE[pitchType] : null
  if (!platform) return `This round, lead with ${base}`
  return `This round, lead with ${base} On ${pitchType}, with its ${platform.architecture.toLowerCase()}, that is exactly where it bites hardest.`
}

function campaignPersonaFit(campaign: string, persona: string | undefined): string {
  const base = CAMPAIGN_BASE[campaign]
  if (!base) return ''
  const p = persona ? PERSONA_PROFILE[persona] : null
  if (!p) return `Tie it to ${base}`
  return `Speak to this in their terms (${p.language.toLowerCase()}) rather than as a tooling swap - the angle is still ${base}`
}

// ============================================================
// 10 - INDUSTRY STAKE (keyed by lowercase substring match)
// ============================================================
const INDUSTRY_STAKE: Record<string, string> = {
  health: 'A broken flow in a healthcare system is not just an inconvenience - it risks patient data exposure, compliance violations, or a care workflow failing at the point of use.',
  financ: 'A quality gap in financial services risks regulatory exposure, transaction errors affecting real money, and audit findings that take months to remediate.',
  insur: 'A broken claims or underwriting flow directly delays payouts or policy issuance, which shows up as customer complaints and regulatory scrutiny.',
  retail: 'A broken checkout or inventory flow shows up immediately as lost revenue and abandoned carts, often during the highest-traffic moments.',
  manufactur: 'A quality gap in manufacturing systems can delay production schedules, break supply chain visibility, or cause compliance issues with safety and quality standards.',
  logistic: 'A broken flow in logistics systems means shipments misroute, visibility gaps open up for customers, and SLAs get missed.',
  technolog: 'A quality gap in a technology company\'s own product testing undermines the product\'s core value proposition and shows up directly in churn and support volume.',
  software: 'A quality gap in a software company\'s own product testing undermines the product\'s core value proposition and shows up directly in churn and support volume.',
  telecom: 'A broken provisioning or billing flow affects service activation and billing accuracy at scale, generating support volume and churn.',
  government: 'A quality gap in government systems risks public-facing service failures and compliance/audit exposure that draws public scrutiny.',
  'public sector': 'A quality gap in public-sector systems risks public-facing service failures and compliance/audit exposure that draws public scrutiny.',
  energy: 'A broken flow in energy/utilities systems can affect billing accuracy, outage response, or regulatory compliance reporting.',
  utilit: 'A broken flow in utilities systems can affect billing accuracy, outage response, or regulatory compliance reporting.',
  education: 'A quality gap in education systems disrupts enrollment, grading, or financial aid processes at exactly the times students and families need them to work.',
}

function findIndustryStake(industry: string | undefined): string | null {
  if (!industry) return null
  const key = industry.toLowerCase()
  for (const k of Object.keys(INDUSTRY_STAKE)) {
    if (key.includes(k)) return INDUSTRY_STAKE[k]
  }
  return null
}

// ============================================================
// Small formatting helpers
// ============================================================
const fmtArr = (a: any) => Array.isArray(a) && a.length > 0 ? a.join(', ') : null

// Best-effort first name guessed from the local part of an email address
// (e.g. priya.sharma@acme.com -> Priya), used only as a last resort when the
// contact has no first_name and no parseable full_name, so the greeting
// always has something to address the person by.
function deriveNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const local = email.split('@')[0] || ''
  const cleaned = local.replace(/[0-9]+/g, '')
  const parts = cleaned.split(/[._+-]+/).filter(Boolean)
  if (!parts.length) return null
  const raw = parts[0]
  if (raw.length < 2) return null
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}
const fmtObj = (a: any) => {
  if (!a) return null
  if (Array.isArray(a)) return a.length > 0 ? a.map((x: any) => typeof x === 'object' ? JSON.stringify(x) : x).join(', ') : null
  if (typeof a === 'object') return Object.keys(a).length > 0 ? JSON.stringify(a) : null
  return String(a)
}
// Pulls a name field out of an array of objects (or plain strings), comma-joined.
const fmtNamed = (a: any, key: string) => {
  if (!Array.isArray(a) || a.length === 0) return null
  const vals = a.map((x: any) => (x && typeof x === 'object') ? x[key] : x).filter(Boolean)
  return vals.length > 0 ? vals.join(', ') : null
}
// Signals come as [{type,text,date}] - render as "Type: text".
const fmtSignals = (a: any) => {
  if (!Array.isArray(a) || a.length === 0) return null
  const vals = a.map((x: any) => (x && typeof x === 'object') ? `${x.type ? x.type + ': ' : ''}${x.text || ''}`.trim() : x).filter(Boolean)
  return vals.length > 0 ? vals.join('; ') : null
}
// Important-to-know / strategic priorities come as [{title, body|description}].
const fmtNotes = (a: any, bodyKey: string) => {
  if (!Array.isArray(a) || a.length === 0) return null
  const vals = a.map((x: any) => (x && typeof x === 'object') ? `${x.title ? x.title + ': ' : ''}${x[bodyKey] || ''}`.trim() : x).filter(Boolean)
  return vals.length > 0 ? vals.join('; ') : null
}
// Renders "Label: value\n" only if value is non-empty - omit, never placeholder.
const line = (label: string, value: any) => (value !== null && value !== undefined && String(value).trim() !== '')
  ? `${label}: ${value}\n`
  : ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { contact, stage, accountResearch, accountNote, priorEmails, customPrompt } = await req.json()
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const research = accountResearch || {}
    const stageKey = STAGE_SPEC[stage] ? stage : 'F1'
    const axis = AXES_BY_STAGE[stageKey]

    // ---- 1. System ----
    const systemBlock = `You write outbound email for ACCELQ, an AI-native quality engineering platform:
AI agents that design, execute, maintain and analyse testing across enterprise
applications.

You are not writing as a salesperson. You write as one senior technical person
who understands this prospect's environment, opening a conversation with
another.

ACCELQ is additive to the platforms a prospect already runs. Never position it
against their vendor's native tooling. Never attack an open-source framework.`

    // ---- 2. First-hand knowledge (omit entire block if empty) ----
    const contactNote = (contact.contact_note || '').trim()
    const companyNote = (accountNote || '').trim()
    const hasFirstHand = !!(contactNote || companyNote)
    let relationshipState = 'cold'
    if (contact.response && String(contact.response).trim() && !/no response/i.test(String(contact.response))) {
      relationshipState = String(contact.response).trim()
    }
    const firstHandFacts = [contactNote, companyNote].filter(Boolean).join(' | ') || '(none recorded)'
    const firstHandBlock = hasFirstHand ? `========================================
WHAT WE ACTUALLY KNOW - FIRST-HAND
========================================
From a colleague who has had contact with this account or person. These
outrank every other input below. Where they conflict with the account profile,
the pain axis or the platform notes, THESE WIN.

Known facts: ${firstHandFacts}

PAIN THEY HAVE EXPRESSED: (not separately tracked yet - see known facts above for anything stated)
  If present, the email is about this. Not the assigned axis, not what is
  typical of their platform. Use their phrasing where you can.

Relationship: ${relationshipState}
  If anything other than cold, do not write a cold email.

CONSTRAINTS - hard, not considerations to weigh:
(none recorded)

Best opening material: (none recorded separately - use known facts above)

` : ''

    // ---- 3. Fact ledger ----
    const industry = contact.industry || research.detectedIndustry
    // Always have something to greet the contact by: prefer their real first_name,
    // then fall back to splitting a combined full_name, then to a name guessed from
    // their email address -- in that order of confidence.
    const derivedFirstName = contact.first_name ||
      (contact.full_name ? contact.full_name.trim().split(/\s+/)[0] : null) ||
      deriveNameFromEmail(contact.email)
    const ledgerLines =
      line('Company', contact.company) +
      line('Industry', industry) +
      line('About', research.about || research.overview) +
      line('Employees', research.employees) +
      line('Revenue', research.revenue) +
      line('Testing tools in use', fmtNamed(research.testing_tools, 'tool') || fmtArr(research.testingTools) || research.techStack) +
      line('Enterprise apps in use', fmtNamed(research.enterprise_apps, 'app') || fmtArr(research.enterpriseApps)) +
      line('SaaS apps in use', fmtNamed(research.saas_apps, 'app') || fmtArr(research.saasApps)) +
      line('Recent signal', fmtSignals(research.ai_signals) || fmtArr(research.signals) || fmtArr(research.aiSignals) || research.recentNews) +
      line('Important to know', fmtNotes(research.important_to_know, 'body')) +
      line('Strategic priorities', fmtNotes(research.strategicPriorities, 'description')) +
      `First name (use this exact word in the greeting): ${derivedFirstName || 'unknown'}\n` +
      `Contact: ${[contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.full_name || derivedFirstName || 'the contact'}, ${contact.title || 'title unknown'}\n` +
      line('Stated pain', research.painPoints)

    const ledgerBlock = `========================================
FACT LEDGER - the complete set of things you know
========================================
${ledgerLines}
LEDGER RULES - these override every other instruction:
- This ledger plus the first-hand block above is everything you know. Nothing
  else is a fact.
- Never state a number, percentage, timeframe, customer name or outcome that
  does not appear in the ledger or in VERIFIED PROOF below. This includes
  numbers appearing anywhere in these instructions - those are illustrations,
  not facts about anyone.
- A field absent from the ledger is unknown. Do not infer it, do not hedge
  around it, do not raise the topic.
- You may state what is generally true of this platform, industry or role as a
  general observation ("teams running X usually..."). You may not convert that
  into a claim about THIS company.
- If the only way to write a strong email is to invent something, write the
  weaker honest email instead.
`

    // ---- 4. Verified proof ----
    // No verified_proof data source exists yet - always render the empty-state
    // block per spec (render, do not omit).
    const verifiedProofBlock = `========================================
VERIFIED PROOF
========================================
None available for this account.
Cite no customer result, number or outcome in this email. Make the case with a
mechanism instead: what changes about how the work gets done, stated without
quantification.
`

    // ---- 5. Account understanding ----
    // No structured account profile (operating model / quality-critical flows /
    // testing surface) exists in this app's data model yet - omit entirely.
    const accountUnderstandingBlock = ''

    // ---- 6. Stage ----
    const stageBlock = `========================================
THIS EMAIL: ${stageKey} - axis: ${axis.name}
========================================
${axis.text}

This email may only work this axis. The other five are reserved for the other
emails in the sequence. Do not touch them, even in passing. If this axis feels
less compelling than another, write it anyway.

${STAGE_SPEC[stageKey]}
`

    // ---- 7. Platform ----
    const platform = contact.pitch_type ? PLATFORM_PROFILE[contact.pitch_type] : null
    const platformBlock = platform ? `========================================
PLATFORM: ${contact.pitch_type}
========================================
Release pressure: ${platform.cadence}
Architecture: ${platform.architecture}
Testing implication: ${platform.testingImplication}
` : ''

    // ---- 8. Campaign (omit both blocks if blank or Generic) ----
    const campaignName = contact.campaign && contact.campaign !== 'Generic' ? contact.campaign : null
    let campaignBlock = ''
    if (campaignName && CAMPAIGN_BASE[campaignName]) {
      const pain = campaignPlatformPain(campaignName, contact.pitch_type)
      const fit = campaignPersonaFit(campaignName, contact.persona)
      campaignBlock = `========================================
CAMPAIGN: ${campaignName}${contact.pitch_type ? ' on ' + contact.pitch_type : ''}
========================================
${pain}

How this lands for ${contact.persona || 'this persona'}:
${fit}

Weave this into the pain point. Do not bolt it on as its own paragraph.
`
    }

    // ---- 9. Persona ----
    const personaProfile = contact.persona ? PERSONA_PROFILE[contact.persona] : null
    const personaBlock = personaProfile ? `========================================
PERSONA: ${contact.persona}
========================================
Their language: ${personaProfile.language}
Never say to them: ${personaProfile.never}
CTA they accept: ${personaProfile.cta}
` : ''

    // ---- 10. Industry stake ----
    const stake = findIndustryStake(industry)
    const industryStakeBlock = stake ? `========================================
WHAT THIS BREAKS FOR THEM
========================================
${stake}

Use this to give the pain a consequence. Describe it as generally true of
${industry} companies running ${contact.pitch_type || 'their platform'}, never as a claim about
${contact.company} unless the ledger supports it.
` : ''

    // ---- 11. Prior emails (omit for Fresh, or if none) ----
    const priorList: Array<{ stage?: string; subject?: string; body?: string }> = Array.isArray(priorEmails) ? priorEmails.slice(0, 5) : []
    let priorEmailsBlock = ''
    if (stageKey !== 'Fresh' && priorList.length > 0) {
      const rendered = priorList.map(e => `--- ${e.stage || 'unknown stage'} | subject: "${e.subject || ''}" ---\n${e.body || ''}`).join('\n\n')
      priorEmailsBlock = `========================================
ALREADY SENT TO THIS PERSON - do not repeat any of it
========================================
${rendered}

Hard constraints:
- Your subject must differ from every subject above in wording and in angle.
- Reuse no opening pattern, no pain point, no proof point, no CTA from above.
- Do not reference, allude to, or apologise for previous emails.
- If the remaining angle feels thin, change the pain point rather than
  restating the last one more forcefully.
`
    }

    // ---- 12. Writing rules ----
    const writingRulesBlock = `========================================
WRITING RULES
========================================
GREETING:
- Start with "Hi " followed by the exact value of "First name" from the FACT
  LEDGER, then a comma, on its own opening line - e.g. "Hi Priya,". Never
  "Hi there", never the full name, never the company name, never omit the
  greeting. If First name is "unknown", open with "Hi," instead (no name).

OPENING LINE:
- About their world, not yours. Never open with I, We, My name, I hope, or the
  company name.
- Specific enough that it could not be sent to another company on the same
  platform. If it could, it is not finished.
- Do not reuse any opening sentence that appears in these instructions.

LANGUAGE:
- Plain text. No bullets, no bold, no markdown, no em dashes or en dashes.
- Never: "I hope this finds you well", "just following up", "circling back",
  "touching base", "reaching out because", "I wanted to", "quick question",
  "at your earliest convenience", "I'd love to".
- Never: revolutionary, cutting-edge, seamless, game-changing, leverage,
  synergy, unlock, empower, robust, holistic, best-in-class, world-class.
- Never describe ACCELQ as a no-code testing tool. Never say it replaces or
  beats the platform they run.
- No sign-off, no sender name, no signature. End on the last sentence the
  stage spec calls for.

SUBJECT LINE:
- Under 50 characters. Natural, like internal mail -- not a marketing headline.
- Capitalize the first letter of the subject.
- Keep product names, platform names and acronyms in their correct case exactly
  as written elsewhere in this prompt -- never lowercase them. For example:
  API (not api), SAP (not sap), QA (not qa), ACCELQ (not accelq), ServiceNow,
  Salesforce, nCino. The rest of the subject can stay in natural sentence case.
- No ALL CAPS, no spam words, no colon used as a marketing device.
`

    // ---- custom instructions (SDR override, if provided) ----
    const customInstructions = customPrompt?.trim()
      ? `========================================
SDR CUSTOM INSTRUCTIONS - follow these exactly, they override everything else
========================================
${customPrompt.trim()}
`
      : ''

    // ---- 13. Self-check + output ----
    const selfCheckBlock = `========================================
BEFORE YOU OUTPUT
========================================
Check each; fix the draft until all pass.
1. Every number, percentage, timeframe and named outcome traces to the FACT
   LEDGER or VERIFIED PROOF. If not, cut it.
2. Nothing is stated as fact about this company that is absent from the ledger
   or the first-hand block.
3. Word count is within the stage spec.
4. The CTA matches the stage spec exactly. F4 has none. F5 asks for nothing.
5. Nothing repeats from ALREADY SENT.
6. Swapping in another company of the same profile would make the email
   obviously wrong. If it would still read fine, the opening is too generic.

Return ONLY valid JSON:
{
  "subject": "...",
  "body": "greeting, then body, ending where the stage spec says",
  "hook_used": "the one pain point or angle this email leads on",
  "facts_asserted": ["each external fact stated, as a short phrase"],
  "unverified": ["anything you were tempted to claim but left out"]
}`

    const prompt = [
      systemBlock,
      firstHandBlock,
      ledgerBlock,
      verifiedProofBlock,
      accountUnderstandingBlock,
      stageBlock,
      platformBlock,
      campaignBlock,
      personaBlock,
      industryStakeBlock,
      priorEmailsBlock,
      customInstructions,
      writingRulesBlock,
      selfCheckBlock,
    ].filter(Boolean).join('\n')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
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

    const fixBrand = (s: string) => (s || '').replace(/\bA+C*ELQ\b/gi, 'ACCELQ')

    const clean = (s: string) => fixBrand(s || '')
      .replace(/\s*[—–]\s*/g, ', ')
      .replace(/  +/g, ' ')
      .trim()

    // Keywords whose casing must stay fixed no matter how the model wrote them --
    // applied word-by-word so 'api' -> 'API', 'sap' -> 'SAP', etc. in subject lines.
    const KEYWORD_CASING: Record<string, string> = {
      api: 'API', sap: 'SAP', qa: 'QA', crm: 'CRM', erp: 'ERP', roi: 'ROI',
      ai: 'AI', ml: 'ML', sso: 'SSO', saas: 'SaaS', ui: 'UI', ux: 'UX',
      ci: 'CI', cd: 'CD', poc: 'POC', rfp: 'RFP', kpi: 'KPI', sdr: 'SDR',
      url: 'URL',
      salesforce: 'Salesforce', oracle: 'Oracle', servicenow: 'ServiceNow',
      workday: 'Workday', pega: 'Pega', ncino: 'nCino', coupa: 'Coupa',
      accelq: 'ACCELQ',
    }
    const fixKeywordCasing = (s: string) => (s || '').replace(/[A-Za-z]+/g, (word) => {
      const fixed = KEYWORD_CASING[word.toLowerCase()]
      return fixed || word
    })
    const capitalizeFirst = (s: string) => {
      const t = (s || '').trim()
      return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
    }
    const cleanSubject = (s: string) => capitalizeFirst(fixKeywordCasing(clean(s)))

    const stripSignoff = (s: string) => s
      .replace(/\n{1,2}(thanks|best|regards|best regards|warm regards|cheers|sincerely)[,!.]?\s*\n[^\n]{0,60}$/i, '')
      .replace(/\n{1,2}(thanks|best|regards|best regards|warm regards|cheers|sincerely)[,!.]?\s*$/i, '')
      .trim()

    return new Response(JSON.stringify({
      subject: cleanSubject(parsed.subject),
      body: stripSignoff(clean(parsed.body)),
      hook_used: parsed.hook_used || null,
      facts_asserted: Array.isArray(parsed.facts_asserted) ? parsed.facts_asserted : [],
      unverified: Array.isArray(parsed.unverified) ? parsed.unverified : [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
