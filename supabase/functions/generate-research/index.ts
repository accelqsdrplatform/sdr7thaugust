import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Claude responses can include multiple content blocks (e.g. thinking blocks
// before the final text on newer models) — grab all text blocks, not just [0].
function extractText(aiData: any): string {
  const blocks = aiData?.content || []
  return blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim()
}

// Models sometimes wrap JSON in markdown fences or add a short preamble even
// when told not to. Strip fences, then fall back to extracting the first
// balanced {...} or [...] substring if a direct parse fails.
function parseJsonLoose(raw: string): any {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {}
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)
  let candidate: string | null = null
  if (objMatch && arrMatch) {
    candidate = (objMatch.index as number) <= (arrMatch.index as number) ? objMatch[0] : arrMatch[0]
  } else {
    candidate = objMatch ? objMatch[0] : (arrMatch ? arrMatch[0] : null)
  }
  if (candidate) return JSON.parse(candidate)
  throw new Error('No valid JSON found in response')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { account, sectionKey, sectionLabel, mode } = body
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── FULL RESEARCH MODE ──────────────────────────────────────────────────
    if (mode === 'full') {
      const contactsText = (account.contacts || [])
        .slice(0, 5)
        .map((c: any) => `${c.full_name} (${c.title || 'unknown title'})`)
        .join(', ')

      const existingTools = (account.testing_tools || []).map((t: any) => t.tool).join(', ')
      const notes = account.notes || ''

      // ── PHASE 1: Fast structured data (Haiku) ──────────────────────────
      const structuredPrompt = `You are an expert B2B sales researcher for ACCELQ, an AI-powered test automation platform.

Research this company for a sales intelligence brief:
Company: ${account.name}
Industry: ${account.industry || 'Unknown'}
Country: ${account.country || 'Unknown'}
Revenue: ${account.revenue_millions ? `$${account.revenue_millions}M` : 'Unknown'}
Known Contacts: ${contactsText || 'None'}
Existing Tools Recorded: ${existingTools || 'None'}
SDR Notes: ${notes || 'None'}

Return ONLY a valid JSON object (no markdown, no explanation) with exactly these fields:

{
  "why": "2-3 sentences on why this company is a strong ACCELQ target",
  "tech": "2-3 sentences on likely tech stack, CI/CD, cloud platform, test frameworks",
  "qaHiring": "1-2 sentences: Low/Medium/High likelihood of hiring QA/automation engineers with reason",
  "news": "1 relevant recent news item or digital transformation initiative",
  "pain": "Top 2 QA/testing pain points ACCELQ solves for this company",
  "tools": ["list", "of", "testing", "tools", "they", "likely", "use"],
  "funding": false,
  "hiringQA": false,
  "launch": false,
  "leadership": false,
  "outage": false,
  "cicd": false,
  "enterpriseApps": ["list", "of", "enterprise", "apps", "they", "use"],
  "detectedIndustry": "one of: Insurance|Banking|Healthcare|Retail|Manufacturing|Telecom|Technology|Other",
  "saasApps": ["list", "of", "industry-specific", "saas", "apps"],
  "about": "3-4 sentence overview of what this company does, who it serves, and its market position",
  "businessModel": "2-3 sentences on how this company generates revenue and its primary business model",
  "strategicPriorities": [{"title": "Priority 1 short name", "description": "2 sentence explanation"}, {"title": "Priority 2 short name", "description": "2 sentence explanation"}, {"title": "Priority 3 short name", "description": "2 sentence explanation"}],
  "hq_country": "country name",
  "website": "website URL if known",
  "headquarters": "city, country",
  "employee_count_range": "e.g. 1,000-5,000",
  "founded_year": null,
  "ticker": null,
  "parent_company": null,
  "is_public": false,
  "industries": ["primary industry", "secondary if relevant"],
  "products_services": ["core product or service 1", "core product or service 2", "core product or service 3"],
  "signals": [],
  "similar_companies": [
    {"name": "Company Name", "domain": "company.com", "reason": "One sentence why similar"},
    {"name": "Company Name", "domain": "company.com", "reason": "One sentence why similar"}
  ]
}

Rules for similar_companies:
- MUST be in the same country/region as the account being researched
- MUST be in the same industry or closely adjacent
- 5-8 real named companies with accurate domains
- Do NOT include the company itself
- Do NOT include subsidiaries or parent companies of the researched company
- Order by relevance (most similar first)
- Keep reasons to 1 sentence focused on QA/testing similarity

Rules for tools array: ONLY include dedicated QA/test automation tools (e.g. Selenium, Cypress, Playwright, UFT, Tosca, JUnit, TestNG, Postman, k6, Appium, Robot Framework, Katalon, LoadRunner, JMeter, NUnit, PyTest). Do NOT include programming languages, build tools, CI/CD platforms, infrastructure tools, or cloud providers.

Rules for boolean signals:
- funding: true if company recently raised funding or had IPO
- hiringQA: true if company is likely actively hiring QA/automation engineers
- launch: true if company recently launched a major product
- leadership: true if company had recent leadership changes (new CTO/CIO/VP Eng)
- outage: true if company had quality incidents or outages
- cicd: true if company has active CI/CD pipeline culture

Rules for enterpriseApps: List major enterprise apps (SAP, Oracle, Salesforce, Workday, ServiceNow, etc.)
Rules for saasApps — use detected industry:
- Insurance: Guidewire, Duck Creek, Majesco, Sapiens, Fineos
- Banking/Financial Services: Temenos, Finastra, Murex, Flexcube, FIS, Fiserv
- Healthcare: Epic, Cerner, Meditech, Allscripts, NextGen
- Retail: Shopify, SAP Commerce, Salesforce Commerce, Manhattan Associates
- Manufacturing: PTC, Siemens PLM, Infor, AVEVA
- Telecom: Amdocs, CSG, Netcracker, Oracle Communications
- Technology: Jira, Confluence, GitHub, Okta, Snowflake

Keep all arrays to 3-6 items max. Be specific and realistic for this company's size and industry.`

      const [structuredResp] = await Promise.all([
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 4000, messages: [{ role: 'user', content: structuredPrompt }] })
        })
      ])

      // ── PHASE 2: Deep Intel (Sonnet) — Important to Know ───────────────
      const intelPrompt = `You are an elite sales intelligence analyst for ACCELQ, an AI-powered codeless test automation platform. ACCELQ's value: QA teams eliminate fragile manual scripts and Selenium/Cypress maintenance using self-healing, codeless automation — teams cut test maintenance by 60-90% and shrink release cycles from weeks to days.

Company to research: ${account.name}
Industry: ${account.industry || 'Unknown'}
Country: ${account.country || 'Unknown'}
Revenue: ${account.revenue_millions ? `$${account.revenue_millions}M` : 'Unknown'}
Known contacts: ${contactsText || 'None'}
SDR notes: ${notes || 'None'}

Generate 3-5 "Important to Know" intelligence items. Each must follow this exact pattern:

1. **Signal title** — A specific, concrete trigger or business event (NOT generic like "digital transformation")
2. **Signal body** — 3-4 sentences structured as:
   - What is actually happening (specific data, numbers, dates where known — e.g. layoffs count, hiring volume, product launch name, acquisition target)
   - Why this creates an urgent testing infrastructure need (the business pressure it puts on QA/engineering)
   - How this maps to the specific persona's pain (use language like "QA teams at ${account.industry || 'this type of'} companies face..." or reference their likely tech stack)
   - One concrete ACCELQ capability that addresses it (self-healing automation, codeless scripts, protocol support, parallel test execution, CI/CD integration, etc.)

Examples of strong signal titles:
- "Workforce reduction forces QA efficiency over headcount"
- "Active hiring in Finance signals major system modernisation"
- "Legacy billing platform migration creates regression testing pressure"
- "Recent product launch demands accelerated release cycles"
- "Compliance mandate drives automated audit trail requirements"

Rules:
- Be specific to ${account.name} — use what you know about this actual company
- Include real numbers, timeframes, or named initiatives where you know them
- Never be generic — each item must be unique to this company's actual situation
- Connect every signal back to a concrete testing/QA implication
- 150-250 words per item body

Return ONLY a valid JSON array (no markdown):
[
  { "title": "Signal title here", "body": "Full paragraph body here" },
  { "title": "Signal title here", "body": "Full paragraph body here" }
]`

      const intelRespPromise = fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 3500, messages: [{ role: 'user', content: intelPrompt }] })
      })

      // Await both
      const [structuredData, intelResp] = await Promise.all([structuredResp.json(), intelRespPromise])

      const rawStructured = extractText(structuredData) || '{}'
      let parsed: any = {}
      try {
        parsed = parseJsonLoose(rawStructured)
      } catch {
        return new Response(JSON.stringify({ error: 'AI returned invalid JSON for structured data', raw: rawStructured }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Parse intel
      const intelData = await intelResp.json()
      const rawIntel = extractText(intelData) || '[]'
      let importantToKnow: any[] = []
      try {
        importantToKnow = parseJsonLoose(rawIntel)
        if (!Array.isArray(importantToKnow)) importantToKnow = []
      } catch {
        importantToKnow = []
      }

      parsed.important_to_know = importantToKnow

      return new Response(JSON.stringify({ full: parsed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── SINGLE SECTION MODE ─────────────────────────────────────────────────
    const sectionPrompts: Record<string, string> = {
      whyTarget: `Why is ${account.name} a strong target for ACCELQ (AI-powered test automation)? Consider their size, industry, and likely QA maturity. Be specific and actionable in 2-3 sentences.`,
      techStack: `What is the likely tech stack, CI/CD tools, cloud platform, and testing frameworks at ${account.name} (${account.industry || 'tech company'}, ${account.country || 'unknown country'})? Be specific about technologies that indicate test automation opportunities.`,
      qaHiring: `Based on typical hiring patterns for a ${account.industry || 'technology'} company like ${account.name}, assess their QA hiring signals. Are they likely to be growing their QA/automation team? Rate as Low/Medium/High with 1-2 reasons.`,
      recentNews: `What is a likely recent news item, initiative, or development at ${account.name} (${account.industry || 'tech'} company in ${account.country || 'unknown region'}) relevant to digital transformation or software quality? Focus on items that create test automation urgency.`,
      painPoints: `What are the top 2 QA/testing pain points that ${account.name} (${account.industry || 'technology'} company) likely faces? Focus on problems ACCELQ's AI test automation directly solves — such as manual testing overhead, legacy tool limitations, slow release cycles, or compliance testing needs.`,
    }

    const prompt = sectionPrompts[sectionKey] ||
      `Research the "${sectionLabel}" for ${account.name}, a ${account.industry || 'technology'} company in ${account.country || 'unknown location'}. Keep it relevant to test automation and QA. 2-3 sentences.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    })

    const aiData = await response.json()
    const text = extractText(aiData) || ''

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
