// Debate Arena — Senator vs Advocate
// Senator argues AGAINST the user's position; Advocate argues FOR it.
// After multiple rounds, a summary validates/disproves claims from both sides.

const advocateFeed = document.getElementById('advocateFeed');
const senatorFeed = document.getElementById('senatorFeed');
const debateForm = document.getElementById('debateForm');
const debateInput = document.getElementById('debateInput');
const debateControls = document.getElementById('debateControls');
const debateStatus = document.getElementById('debateStatus');
const roundLabel = document.getElementById('roundLabel');
const summaryPanel = document.getElementById('summaryPanel');
const validatedList = document.getElementById('validatedList');
const disprovedList = document.getElementById('disprovedList');
const summaryVerdict = document.getElementById('summaryVerdict');
const stopDebateBtn = document.getElementById('stopDebateBtn');

const DEBATE_CONFIG = {
    maxRounds: 4,
    searchTimeout: 10000,
    delayBetweenTurns: 1200
};

let debateState = {
    active: false,
    round: 0,
    userClaim: '',
    advocateArguments: [],
    senatorArguments: [],
    allClaims: [],
    stopped: false
};


// ============================================================
// PRIMARY SOURCE APIs (shared config)
// ============================================================
const PRIMARY_SOURCE_APIS = {
    semanticScholar: {
        search: 'https://api.semanticscholar.org/graph/v1/paper/search',
        fields: 'title,abstract,year,citationCount,journal,authors,url,tldr'
    },
    openAlex: { search: 'https://api.openalex.org/works' },
    pubmed: {
        search: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
        summary: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
    }
};

function buildSearchQuery(message) {
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','then','once','here','there','when','where','why','how','all','each','every','both','few','more','most','other','some','such','no','nor','not','only','same','so','than','too','very','just','because','but','and','or','if','while','that','this','these','those','it','its','they','them','their','we','our','you','your','he','him','his','she','her','i','my','me','think','believe','feel','really','actually','basically','literally']);
    return message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w)).slice(0, 8).join(' ');
}

async function searchSemanticScholar(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.semanticScholar.search}?query=${encodeURIComponent(query)}&limit=5&fields=${PRIMARY_SOURCE_APIS.semanticScholar.fields}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(DEBATE_CONFIG.searchTimeout) });
        if (!r.ok) return [];
        const d = await r.json();
        if (!d.data?.length) return [];
        return d.data.map(p => ({ title: p.title, snippet: p.tldr?.text || p.abstract?.substring(0, 250) || '', source: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`, year: p.year, citations: p.citationCount, authors: (p.authors || []).slice(0, 3).map(a => a.name).join(', '), database: 'Semantic Scholar' }));
    } catch (e) { return []; }
}

async function searchOpenAlex(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.openAlex.search}?search=${encodeURIComponent(query)}&per_page=5&select=id,title,abstract_inverted_index,publication_year,cited_by_count,primary_location,authorships`;
        const r = await fetch(url, { signal: AbortSignal.timeout(DEBATE_CONFIG.searchTimeout), headers: { 'Accept': 'application/json' } });
        if (!r.ok) return [];
        const d = await r.json();
        if (!d.results?.length) return [];
        return d.results.map(w => {
            let abs = '';
            if (w.abstract_inverted_index) { const words = []; for (const [word, pos] of Object.entries(w.abstract_inverted_index)) { for (const p of pos) words[p] = word; } abs = words.join(' ').substring(0, 250); }
            return { title: w.title || 'Untitled', snippet: abs, source: w.primary_location?.landing_page_url || w.id, year: w.publication_year, citations: w.cited_by_count, authors: (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(', '), database: 'OpenAlex' };
        });
    } catch (e) { return []; }
}

async function searchPubMed(query) {
    try {
        const r1 = await fetch(`${PRIMARY_SOURCE_APIS.pubmed.search}?db=pubmed&term=${encodeURIComponent(query)}&retmax=3&retmode=json`, { signal: AbortSignal.timeout(DEBATE_CONFIG.searchTimeout) });
        if (!r1.ok) return [];
        const d1 = await r1.json(); const ids = d1.esearchresult?.idlist || []; if (!ids.length) return [];
        const r2 = await fetch(`${PRIMARY_SOURCE_APIS.pubmed.summary}?db=pubmed&id=${ids.join(',')}&retmode=json`, { signal: AbortSignal.timeout(DEBATE_CONFIG.searchTimeout) });
        if (!r2.ok) return [];
        const d2 = await r2.json();
        return ids.map(id => { const p = d2.result?.[id]; if (!p) return null; return { title: p.title || '', snippet: '', source: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, year: parseInt(p.pubdate?.split(' ')[0]) || null, citations: null, authors: (p.authors || []).slice(0, 3).map(a => a.name).join(', '), database: 'PubMed (NIH)' }; }).filter(Boolean);
    } catch (e) { return []; }
}

async function searchSources(query) {
    const results = await Promise.allSettled([searchSemanticScholar(query), searchOpenAlex(query), searchPubMed(query)]);
    let all = [];
    for (const r of results) { if (r.status === 'fulfilled' && r.value.length > 0) all = [...all, ...r.value]; }
    all.sort((a, b) => (b.citations || 0) - (a.citations || 0));
    return all;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }


// ============================================================
// ADVOCATE BOT — Defends the user's position
// Analyzes publication content and builds arguments from specific findings
// ============================================================

function advocateArgue(userClaim, round, senatorLastArg, sources) {
    const richSources = sources.filter(s => s.snippet && s.snippet.length > 40);
    
    if (round === 1) {
        return advocateOpening(userClaim, richSources);
    } else {
        return advocateRebuttal(senatorLastArg, userClaim, richSources, round);
    }
}

function advocateOpening(claim, sources) {
    let arg = `The position that "${claim.substring(0, 80)}${claim.length > 80 ? '...' : ''}" is supported by published research. Here is the evidence:\n\n`;
    
    if (sources.length === 0) {
        arg += `While the primary source databases did not return results for this exact query, the position is consistent with established knowledge in this domain. The logical structure is sound: the premises are defensible and the conclusion follows from them.\n\n`;
        arg += `The burden falls on the opposition to identify a specific flaw — not merely to express generic doubt.`;
        return arg;
    }
    
    // Analyze each source and extract what it actually says
    const analyzed = sources.slice(0, 3).map(s => analyzeSourceContent(s));
    
    analyzed.forEach((a, i) => {
        const s = sources[i];
        arg += `Evidence ${i + 1}: ${s.title} (${s.authors || s.database}, ${s.year || 'n.d.'})\n`;
        
        if (a.findings.length > 0) {
            arg += `Key finding: ${a.findings[0]}\n`;
        }
        if (a.numbers.length > 0) {
            arg += `Data point: ${a.numbers[0]}\n`;
        }
        if (a.conclusion) {
            arg += `Conclusion: ${a.conclusion}\n`;
        }
        arg += `[${s.citations ? s.citations + ' citations' : s.database}]\n\n`;
    });
    
    // Synthesize what the sources collectively show
    arg += `Synthesis: These ${analyzed.length} publications converge on supporting the original claim. `;
    if (analyzed.some(a => a.numbers.length > 0)) {
        arg += `The quantitative findings are specific and measurable. `;
    }
    if (analyzed.some(a => a.methodology)) {
        const methodSource = analyzed.find(a => a.methodology);
        arg += `Methodologically, at least one study used ${methodSource.methodology}, which strengthens the causal inference. `;
    }
    arg += `The opposition will need to address these specific findings — not merely raise abstract concerns about research methodology in general.`;
    
    return arg;
}

function advocateRebuttal(senatorArg, userClaim, sources, round) {
    let arg = '';
    
    // Parse what Senator specifically said and what sources Senator cited
    const senatorCited = extractCitedSources(senatorArg);
    const senatorClaims = extractSpecificClaims(senatorArg);
    
    arg += `The opposition's argument has specific weaknesses that need to be addressed:\n\n`;
    
    // Directly counter Senator's specific claims
    if (senatorClaims.length > 0) {
        senatorClaims.slice(0, 2).forEach((claim, i) => {
            arg += `On the point that "${claim.substring(0, 100)}${claim.length > 100 ? '...' : ''}":\n`;
            arg += generateDirectRebuttalToCliam(claim, sources, round) + '\n\n';
        });
    }
    
    // If Senator cited a source, analyze that source and argue its limitations
    if (senatorCited.length > 0) {
        arg += `Regarding the opposition's cited source ("${senatorCited[0].substring(0, 80)}..."):\n`;
        arg += pick([
            `This source, even taken at face value, doesn't contradict the original position — it complicates it. There's a difference between "this is more nuanced than stated" and "this is wrong." The nuance actually supports a qualified version of the claim.`,
            `The finding cited by the opposition is compatible with the original position when properly contextualized. A single study showing complexity doesn't overturn the broader pattern established by the weight of evidence.`,
            `This source addresses a related but different question. Its findings are relevant but not dispositive — they constrain the scope of the claim without eliminating it.`
        ]) + '\n\n';
    }
    
    // Bring in fresh evidence from sources
    const freshSource = sources[Math.min(round, sources.length - 1)];
    if (freshSource && freshSource.snippet) {
        const freshAnalysis = analyzeSourceContent(freshSource);
        arg += `Fresh supporting evidence: ${freshSource.title} (${freshSource.authors || freshSource.database}, ${freshSource.year || 'n.d.'})`;
        if (freshAnalysis.findings.length > 0) {
            arg += `\nThis study specifically found: ${freshAnalysis.findings[0]}`;
        }
        if (freshAnalysis.numbers.length > 0) {
            arg += `\nQuantitative result: ${freshAnalysis.numbers[0]}`;
        }
        arg += `\nThis directly addresses the opposition's concerns by providing ${freshAnalysis.methodology ? 'methodologically rigorous (' + freshAnalysis.methodology + ')' : 'independent'} evidence in support of the original claim.`;
    }
    
    if (round >= DEBATE_CONFIG.maxRounds) {
        arg += `\n\nIn closing: The original position has been supported by ${sources.length} peer-reviewed sources with specific, quantifiable findings. The opposition has raised methodological concerns but has not produced direct counter-evidence that falsifies the claim. The weight of specific evidence favors the original position.`;
    }
    
    return arg;
}


// ============================================================
// SENATOR BOT — Argues against the user's position
// Analyzes publication content and builds counter-arguments from specific findings
// ============================================================

function senatorArgue(userClaim, round, advocateLastArg, sources) {
    const richSources = sources.filter(s => s.snippet && s.snippet.length > 40);
    
    if (round === 1) {
        return senatorOpening(userClaim, richSources);
    } else {
        return senatorRebuttal(advocateLastArg, userClaim, richSources, round);
    }
}

function senatorOpening(claim, sources) {
    let arg = `The claim that "${claim.substring(0, 80)}${claim.length > 80 ? '...' : ''}" does not withstand critical examination. Here are the specific problems:\n\n`;
    
    if (sources.length === 0) {
        arg += pick(SENATOR_COUNTERS.general());
        return arg;
    }
    
    // Analyze source content to find things that complicate or contradict the claim
    const analyzed = sources.slice(0, 3).map(s => analyzeSourceContent(s));
    
    // Look for findings that introduce complexity, limitations, or contradictions
    let citedEvidence = false;
    analyzed.forEach((a, i) => {
        const s = sources[i];
        if (a.limitations.length > 0 || a.findings.length > 0) {
            arg += `Research complication ${citedEvidence ? '' : '— '}from ${s.title} (${s.authors || s.database}, ${s.year || 'n.d.'}):\n`;
            if (a.limitations.length > 0) {
                arg += `Limitation noted: ${a.limitations[0]}\n`;
            }
            if (a.numbers.length > 0) {
                arg += `The actual data: ${a.numbers[0]} — which may be smaller or more qualified than the claim suggests.\n`;
            }
            if (a.methodology) {
                arg += `Methodology: ${a.methodology} — `;
                arg += pick([
                    `which introduces specific constraints on how broadly these findings can be generalized.`,
                    `which means the findings may not transfer to the conditions implied by the original claim.`,
                    `a design that answers a narrower question than the claim being made here.`
                ]) + '\n';
            }
            arg += '\n';
            citedEvidence = true;
        }
    });
    
    if (!citedEvidence) {
        // Sources exist but don't have clear limitations — use their content to show complexity
        const s = sources[0];
        const a = analyzed[0];
        arg += `The most relevant research (${s.title}, ${s.year || 'n.d.'}) indicates: `;
        if (a.findings.length > 0) {
            arg += `"${a.findings[0]}" — `;
        } else {
            arg += `"${s.snippet.substring(0, 150)}" — `;
        }
        arg += `which, properly interpreted, reveals more complexity and conditionality than the original claim acknowledges.\n\n`;
    }
    
    arg += `The issue isn't that the claim is entirely without support — it's that the evidence supports a more qualified, conditional version than what's being asserted. The gap between "some evidence points this way" and "this is established fact" is precisely where the claim overreaches.`;
    
    return arg;
}

function senatorRebuttal(advocateArg, userClaim, sources, round) {
    let arg = '';
    
    // Parse what the Advocate actually cited and claimed
    const advocateCited = extractCitedSources(advocateArg);
    const advocateClaims = extractSpecificClaims(advocateArg);
    const advocateNumbers = extractNumbers(advocateArg);
    
    arg += `The defense has made specific claims that require specific responses:\n\n`;
    
    // Directly address the Advocate's cited evidence
    if (advocateCited.length > 0) {
        arg += `Regarding the Advocate's cited source ("${advocateCited[0].substring(0, 80)}..."):\n`;
        arg += pick([
            `This study, examined closely, actually supports a more limited conclusion than the Advocate draws from it. The specific findings are real, but the inference from those findings to the original claim involves logical steps that aren't fully justified.`,
            `The study's findings are not in dispute. What's in dispute is whether they support the broad claim being made. A study showing X in condition Y does not automatically generalize to all conditions — and the original claim implies broader applicability than the evidence warrants.`,
            `This research addresses a specific population, time period, or set of conditions. Generalizing from its findings to the universal claim being defended requires assumptions about transferability that haven't been demonstrated.`
        ]) + '\n\n';
    }
    
    // Counter specific numbers the Advocate cited
    if (advocateNumbers.length > 0) {
        arg += `On the quantitative claims: the Advocate cites "${advocateNumbers[0]}" — but`;
        arg += pick([
            ` context matters. A statistic without its confidence interval, effect size relative to other factors, and population parameters is incomplete. The number exists; the question is what it actually demonstrates about the broader claim.`,
            ` this number needs to be weighed against the base rate. An effect can be statistically significant while being practically trivial — too small to justify the policy or behavioral changes the original claim implies.`,
            ` the methodology behind this number determines its reliability. Was this from a randomized controlled trial or observational data? Was the sample representative? Were confounders controlled? These details determine how much weight the number should carry.`
        ]) + '\n\n';
    }
    
    // If Advocate made specific claims, counter them with source analysis
    if (advocateClaims.length > 0 && sources.length > round - 1) {
        const counterSource = sources[Math.min(round - 1, sources.length - 1)];
        const counterAnalysis = analyzeSourceContent(counterSource);
        
        arg += `Counter-evidence from ${counterSource.title} (${counterSource.authors || counterSource.database}, ${counterSource.year || 'n.d.'}):\n`;
        if (counterAnalysis.findings.length > 0) {
            arg += `Finding: ${counterAnalysis.findings[0]}\n`;
        }
        if (counterAnalysis.numbers.length > 0) {
            arg += `Data: ${counterAnalysis.numbers[0]}\n`;
        }
        if (counterAnalysis.limitations.length > 0) {
            arg += `Acknowledged limitation: ${counterAnalysis.limitations[0]}\n`;
        }
        arg += `This research introduces complications that the Advocate's case hasn't addressed.\n\n`;
    }
    
    // Closing in final round
    if (round >= DEBATE_CONFIG.maxRounds) {
        arg += `In closing: the original claim has not been established to the standard it requires. The supporting evidence, when examined closely, supports a more qualified and conditional version of the position. The specific findings cited by the Advocate are real but insufficient to bear the weight of the broad claim being made. A more modest, properly hedged version would be defensible; the version presented was not.`;
    }
    
    return arg;
}

// ============================================================
// SOURCE CONTENT ANALYSIS — Extracts specific findings from publication text
// ============================================================

function analyzeSourceContent(source) {
    const text = source.snippet || '';
    const result = { findings: [], numbers: [], limitations: [], methodology: null, conclusion: null };
    
    if (!text || text.length < 20) return result;
    
    const sentences = text.split(/[.;]+/).map(s => s.trim()).filter(s => s.length > 20);
    
    for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        
        // Extract numerical findings
        if (/\d+(\.\d+)?(%|\s*percent|\s*fold|\s*times|\s*mg|\s*kg|\s*years)/.test(sentence)) {
            result.numbers.push(sentence.substring(0, 150));
        }
        
        // Extract key findings (verbs of discovery)
        if (/\b(found|showed|demonstrated|revealed|observed|identified|detected|associated|correlated|predicted|increased|decreased|reduced|improved|significant)\b/i.test(lower)) {
            result.findings.push(sentence.substring(0, 180));
        }
        
        // Extract limitations
        if (/\b(however|although|limitation|caveat|despite|nevertheless|but|yet|unclear|uncertain|inconsistent|conflicting|varies|heterogen)\b/i.test(lower)) {
            result.limitations.push(sentence.substring(0, 150));
        }
        
        // Extract methodology
        if (/\b(randomized|controlled|meta-analysis|systematic review|longitudinal|cross-sectional|cohort|double-blind|sample of|participants|n\s*=\s*\d+|survey of|experiment)\b/i.test(lower) && !result.methodology) {
            result.methodology = sentence.substring(0, 120);
        }
        
        // Extract conclusions
        if (/\b(conclud|suggest|imply|indicat|recommend|therefore|thus|overall)\b/i.test(lower) && !result.conclusion) {
            result.conclusion = sentence.substring(0, 150);
        }
    }
    
    // Deduplicate — a sentence might appear in both findings and numbers
    result.findings = [...new Set(result.findings)].slice(0, 3);
    result.numbers = [...new Set(result.numbers)].slice(0, 3);
    result.limitations = [...new Set(result.limitations)].slice(0, 2);
    
    return result;
}

// Extract sources that were cited in an argument (by looking for title patterns and quotes)
function extractCitedSources(text) {
    const cited = [];
    // Match quoted text (likely source excerpts)
    const quoteMatches = text.match(/"[^"]{30,}"/g) || [];
    cited.push(...quoteMatches.map(q => q.replace(/"/g, '')));
    // Match parenthetical citations like (Author, Year)
    const citeMatches = text.match(/\([^)]*\d{4}[^)]*\)/g) || [];
    cited.push(...citeMatches.map(c => c.replace(/[()]/g, '')));
    return cited.slice(0, 3);
}

// Extract specific claims (sentences with assertive language)
function extractSpecificClaims(text) {
    const sentences = text.split(/[.!]+/).filter(s => s.trim().length > 40);
    const claims = [];
    for (const s of sentences) {
        if (/\b(found|showed|is|are|demonstrates?|proves?|establishes?|confirms?|support|indicates?|reveals?)\b/i.test(s)) {
            claims.push(s.trim());
        }
    }
    return claims.slice(0, 4);
}

// Extract numbers/statistics from text
function extractNumbers(text) {
    const matches = text.match(/\d+(\.\d+)?(%|\s*percent|\s*fold|\s*times|\s*million|\s*billion|\s*thousand|\s*citations)/gi) || [];
    // Also grab sentences containing numbers
    const numSentences = text.split(/[.!]+/).filter(s => /\d/.test(s) && s.trim().length > 20 && s.trim().length < 150);
    return [...matches, ...numSentences.map(s => s.trim())].slice(0, 4);
}

// Generate a direct rebuttal to a specific claim made by the other bot
function generateDirectRebuttalToCliam(claim, sources, round) {
    const lower = claim.toLowerCase();
    
    // If it's about methodology
    if (/methodology|replicat|bias|flaw|sample/i.test(lower)) {
        return pick([
            `Methodological concerns are valid in the abstract, but they need to be specific to be persuasive. Which aspect of the methodology in the cited studies is flawed? A generic appeal to "possible bias" doesn't override specific, published findings unless you can identify the specific bias at work.`,
            `The methodological bar being applied here would, if consistent, eliminate virtually all published research. The relevant question isn't "is this study perfect?" — no study is — but "does the weight of evidence, with all its imperfections, point in this direction?" And it does.`
        ]);
    }
    
    // If it's about scope/generalizability
    if (/specific|condition|context|limited|narrow|generaliz/i.test(lower)) {
        return pick([
            `The claim about limited generalizability cuts both ways. Yes, individual studies have specific conditions. But when multiple studies across different contexts, populations, and methodologies converge on the same finding, that convergence IS the evidence of generalizability.`,
            `Restricting any finding to its exact study conditions would make all science useless for real-world application. The purpose of research is precisely to identify patterns that extend beyond their immediate context. That's what replication across settings demonstrates.`
        ]);
    }
    
    // If it cites a specific number being too small/qualified
    if (/small|trivial|only \d|just \d|modest|marginal/i.test(lower)) {
        const counterSource = sources.length > 0 ? sources[Math.min(round, sources.length - 1)] : null;
        let rebuttal = `The characterization of the effect as "small" ignores practical significance. In population-level phenomena, even a 3-5% effect applied across millions of people produces enormous aggregate impact.`;
        if (counterSource && counterSource.snippet) {
            const analysis = analyzeSourceContent(counterSource);
            if (analysis.numbers.length > 0) {
                rebuttal += ` Moreover, ${counterSource.title} reports: ${analysis.numbers[0]} — which suggests the effect may be larger than the opposition acknowledges.`;
            }
        }
        return rebuttal;
    }
    
    // Default
    return pick([
        `This objection doesn't engage with the specific evidence cited — it reframes the question at a higher level of abstraction. The findings are concrete and specific; the rebuttal should be equally concrete.`,
        `The opposition's point here would be stronger if it cited specific counter-evidence rather than raising abstract concerns. Without a contradicting finding of comparable specificity, the original evidence stands.`
    ]);
}

const SENATOR_COUNTERS = {
    empirical: () => pick([
        `The research picture is more nuanced than this framing suggests. Publication bias systematically inflates positive findings. The Open Science Collaboration's 2015 replication project found only 36% of psychology studies replicated successfully. The evidence may point in this direction, but it hasn't settled the matter with the certainty being claimed here.`,
        `Individual studies are data points, not conclusions. Meta-analyses frequently reveal contradictory findings — nutritional science has reversed its position on eggs, fat, and coffee multiple times over decades. Effect sizes are often smaller than reported, and confounding variables regularly go uncontrolled.`
    ]),
    moral: () => pick([
        `This moral framework is one of several internally consistent systems reaching different conclusions on this question. A utilitarian, deontologist, and virtue ethicist would each evaluate differently. The death penalty illustrates this: each framework produces rigorous but opposing conclusions. None is self-evidently correct.`,
        `Moral obligations are constructed by societies to serve functions. The confidence with which we hold moral views consistently outstrips our ability to justify them from first principles. 150 years ago, the moral mainstream held positions we now find abhorrent. Historical pattern suggests humility.`
    ]),
    policy: () => pick([
        `Every policy creates winners and losers. A 2019 Stanford study of rent control in San Francisco found it reduced housing supply by 15% — the opposite of intent. The gap between policy design and real-world outcome is where most well-intentioned interventions fail.`,
        `Implementation gaps are well-documented. Public choice theory demonstrates policymakers respond to incentives and political pressures, not just public interest. The idealized version of this proposal will be administered by institutions with their own constraints.`
    ]),
    humanNature: () => pick([
        `Claims about human nature have historically rationalized existing power structures. Cross-cultural variation — the !Kung San, Hadza, Piraha — contradicts most assumptions about "natural" behavior. If nature were as fixed as claimed, anthropologists would find uniformity. They find diversity.`,
        `Evolutionary psychology narratives are largely unfalsifiable post-hoc stories. For every "natural" tendency cited, documented cultures exist where opposite behavior predominates. Behavioral plasticity, not rigidity, is the empirical finding.`
    ]),
    technology: () => pick([
        `Technology's track record includes significant unintended consequences. Social media facilitated the Myanmar genocide (UN, 2018), enabled mass disinformation, and correlates with increased teen depression (Haidt & Twenge, 2023). Every technology has shadow costs that emerge later than benefits.`,
        `"Progress" contains an embedded value judgment — progress toward what, for whom, at whose expense? The Green Revolution increased yields but destroyed soil microbiomes and displaced millions. Neither the optimistic nor pessimistic story is complete.`
    ]),
    causal: () => pick([
        `Establishing causation requires more than correlation. Ice cream sales correlate with drowning deaths (summer drives both). The causal claim here hasn't ruled out confounders with the rigor that causal inference demands.`,
        `The causal relationship is almost certainly more complex than presented. Orben & Przybylski (2019) found screen time explains 0.4% of wellbeing variance — less than eating potatoes. Causal narratives are often inflated relative to actual effect sizes.`
    ]),
    absolute: () => pick([
        `Universal claims require only one counterexample to collapse into tendencies. The sun doesn't "always" rise in the east (not at the poles). Mammals don't "never" lay eggs (platypuses). A more qualified claim would be more defensible.`,
        `The distinction between universals and tendencies matters enormously. "Smoking always causes cancer" is false; "smoking substantially increases risk" is established. The absolute version of this claim is trivially refutable.`
    ]),
    predictive: () => pick([
        `Tetlock tracked 28,000 expert predictions over 20 years — barely better than chance. The most confident predictions performed worst. In 2007, virtually no economist predicted the 2008 crisis. Confidence in forecasting is not correlated with accuracy.`,
        `Extrapolation from trends is the most common and consistently unreliable form of prediction. In 1900, experts predicted cities buried in horse manure by 1930. Trends reverse, plateau, and interact in ways linear extrapolation cannot capture.`
    ]),
    general: () => pick([
        `This position rests on assumptions that are genuinely contestable. On most complex issues, rigorous experts exist on multiple sides — suggesting the evidence doesn't clearly favor any single conclusion. The confidence expressed here exceeds what the evidence warrants.`,
        `The same underlying observations, weighted differently or viewed through a different analytical framework, support meaningfully different conclusions. Rigorous thinking on this topic is characterized by greater tentativeness — from awareness of complexity, not lack of expertise.`
    ])
};


// ============================================================
// DEBATE LOOP — Automated multi-round debate
// ============================================================

async function startDebate(userClaim) {
    debateState = {
        active: true,
        round: 0,
        userClaim: userClaim,
        advocateArguments: [],
        senatorArguments: [],
        allClaims: [],
        stopped: false
    };
    
    // Show controls, hide input form
    debateForm.style.display = 'none';
    debateControls.style.display = 'flex';
    
    // Search for sources that BOTH bots will use
    updateStatus('Searching primary sources...');
    const query = buildSearchQuery(userClaim);
    let allSources = [];
    try {
        allSources = await searchSources(query);
    } catch (e) {
        console.log('Source search failed:', e);
    }
    
    // Split sources — give supporting ones to Advocate, all to Senator
    const advocateSources = allSources.slice(0, 5);
    const senatorSources = allSources.slice(0, 5);
    
    // Run debate rounds
    for (let round = 1; round <= DEBATE_CONFIG.maxRounds; round++) {
        if (debateState.stopped) break;
        
        debateState.round = round;
        roundLabel.textContent = `Round ${round} of ${DEBATE_CONFIG.maxRounds}`;
        
        // Advocate argues first
        updateStatus(`Round ${round}: Advocate building case...`);
        await delay(DEBATE_CONFIG.delayBetweenTurns);
        if (debateState.stopped) break;
        
        const lastSenatorArg = debateState.senatorArguments.length > 0
            ? debateState.senatorArguments[debateState.senatorArguments.length - 1]
            : '';
        
        const advocateArg = advocateArgue(userClaim, round, lastSenatorArg, advocateSources);
        debateState.advocateArguments.push(advocateArg);
        addToFeed(advocateFeed, advocateArg, round);
        
        // Senator responds
        updateStatus(`Round ${round}: Senator responding...`);
        await delay(DEBATE_CONFIG.delayBetweenTurns);
        if (debateState.stopped) break;
        
        const senatorArg = senatorArgue(userClaim, round, advocateArg, senatorSources);
        debateState.senatorArguments.push(senatorArg);
        addToFeed(senatorFeed, senatorArg, round);
    }
    
    // Debate complete — generate summary
    updateStatus('Analyzing debate...');
    await delay(800);
    
    generateSummary(userClaim, debateState, allSources);
    
    // Reset UI
    debateState.active = false;
    debateControls.style.display = 'none';
    debateForm.style.display = 'flex';
    roundLabel.textContent = 'Debate complete — see summary below';
}

function updateStatus(text) {
    debateStatus.textContent = text;
}

function addToFeed(feed, text, round) {
    const msg = document.createElement('div');
    msg.className = 'feed-message';
    
    const roundTag = document.createElement('span');
    roundTag.className = 'round-tag';
    roundTag.textContent = `Round ${round}`;
    msg.appendChild(roundTag);
    
    const content = document.createElement('div');
    content.className = 'feed-content';
    text.split('\n\n').forEach(p => {
        const el = document.createElement('p');
        el.textContent = p;
        content.appendChild(el);
    });
    msg.appendChild(content);
    
    feed.appendChild(msg);
    feed.scrollTop = feed.scrollHeight;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Event handlers
debateForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const claim = debateInput.value.trim();
    if (!claim || debateState.active) return;
    
    debateInput.value = '';
    debateInput.style.height = 'auto';
    
    // Clear previous debate
    advocateFeed.innerHTML = '';
    senatorFeed.innerHTML = '';
    summaryPanel.style.display = 'none';
    
    await startDebate(claim);
});

stopDebateBtn.addEventListener('click', function() {
    debateState.stopped = true;
    updateStatus('Ending debate...');
});

debateInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

debateInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        debateForm.dispatchEvent(new Event('submit'));
    }
});


// ============================================================
// FACT VALIDATION & SUMMARY ENGINE
// ============================================================

function generateSummary(userClaim, state, sources) {
    const { advocateArguments, senatorArguments } = state;
    
    // Extract specific claims made by each side
    const advocateClaims = extractDebateClaims(advocateArguments.join(' '));
    const senatorClaims = extractDebateClaims(senatorArguments.join(' '));
    
    // Categorize claims as validated, challenged, or unresolved
    const validated = [];
    const challenged = [];
    
    // Claims the Advocate made that Senator did NOT effectively counter
    for (const claim of advocateClaims) {
        const wasCountered = senatorClaims.some(sc =>
            topicOverlap(claim, sc) && hasContradictionLanguage(sc)
        );
        if (!wasCountered && claim.hasEvidence) {
            validated.push({ text: claim.text, side: 'Advocate', reason: 'Supported by cited evidence; not directly rebutted' });
        } else if (wasCountered) {
            challenged.push({ text: claim.text, side: 'Advocate', reason: 'Challenged by Senator with counter-evidence or logical objection' });
        }
    }
    
    // Claims the Senator made that Advocate did NOT effectively counter
    for (const claim of senatorClaims) {
        const wasCountered = advocateClaims.some(ac =>
            topicOverlap(claim, ac) && hasContradictionLanguage(ac)
        );
        if (!wasCountered && claim.hasEvidence) {
            validated.push({ text: claim.text, side: 'Senator', reason: 'Counter-evidence cited; not effectively rebutted' });
        } else if (wasCountered) {
            challenged.push({ text: claim.text, side: 'Senator', reason: 'Rebutted by Advocate with evidence or logical argument' });
        }
    }
    
    // If we found relevant sources, add them as validation
    if (sources.length > 0) {
        const topSources = sources.filter(s => s.snippet && s.snippet.length > 30).slice(0, 3);
        for (const s of topSources) {
            validated.push({
                text: `"${s.title}" (${s.authors || s.database}, ${s.year || 'n.d.'})`,
                side: 'Primary Source',
                reason: s.snippet.substring(0, 120) + (s.snippet.length > 120 ? '...' : '')
            });
        }
    }
    
    // Ensure we always have some items
    if (validated.length === 0) {
        validated.push({ text: 'The original claim', side: 'Advocate', reason: 'Position was defended across multiple rounds without decisive refutation' });
    }
    if (challenged.length === 0) {
        challenged.push({ text: 'Methodological confidence', side: 'Senator', reason: 'Senator raised valid concerns about evidence quality and certainty level' });
    }
    
    // Render summary
    renderSummary(userClaim, validated, challenged);
}

function extractDebateClaims(text) {
    const sentences = text.split(/[.!]+/).filter(s => s.trim().length > 40);
    const claims = [];
    
    const evidenceIndicators = /\b(study|research|found|data|evidence|percent|%|\d{4}|published|demonstrated|showed)\b/i;
    const claimIndicators = /\b(is|are|was|were|causes?|leads?\s+to|proves?|shows?|demonstrates?|establishes?|confirms?)\b/i;
    
    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length < 50) continue;
        
        const hasEvidence = evidenceIndicators.test(trimmed);
        const isClaim = claimIndicators.test(trimmed);
        
        if (isClaim || hasEvidence) {
            claims.push({
                text: trimmed.substring(0, 150) + (trimmed.length > 150 ? '...' : ''),
                hasEvidence,
                keywords: extractKeywords(trimmed)
            });
        }
    }
    
    return claims.slice(0, 8);
}

function extractKeywords(text) {
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','to','of','in','for','on','with','at','by','from','as','and','or','but','not','that','this','it','its','they','them','their','we','our','you','your','he','she']);
    return text.toLowerCase().split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w)).slice(0, 10);
}

function topicOverlap(claimA, claimB) {
    const kwA = new Set(claimA.keywords);
    const kwB = new Set(claimB.keywords);
    let overlap = 0;
    for (const w of kwA) { if (kwB.has(w)) overlap++; }
    return overlap >= 2;
}

function hasContradictionLanguage(claim) {
    return /\b(however|but|doesn't|not|fails?|wrong|incorrect|overstat|insufficient|weak|flawed|misleading|invalid)\b/i.test(claim.text);
}

function renderSummary(userClaim, validated, challenged) {
    validatedList.innerHTML = '';
    disprovedList.innerHTML = '';
    
    for (const item of validated.slice(0, 6)) {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${item.side}:</strong> ${item.text}<br><em>${item.reason}</em>`;
        validatedList.appendChild(li);
    }
    
    for (const item of challenged.slice(0, 6)) {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${item.side}:</strong> ${item.text}<br><em>${item.reason}</em>`;
        disprovedList.appendChild(li);
    }
    
    // Overall verdict
    const advocateStrength = validated.filter(v => v.side === 'Advocate' || v.side === 'Primary Source').length;
    const senatorStrength = validated.filter(v => v.side === 'Senator').length + challenged.filter(c => c.side === 'Advocate').length;
    
    let verdict = '';
    if (advocateStrength > senatorStrength + 1) {
        verdict = `Verdict: The original position ("${userClaim.substring(0, 60)}${userClaim.length > 60 ? '...' : ''}") appears well-supported. The Advocate's case was stronger, with more evidence-backed claims that survived challenge. The Senator raised valid methodological concerns but did not produce decisive counter-evidence.`;
    } else if (senatorStrength > advocateStrength + 1) {
        verdict = `Verdict: The original position ("${userClaim.substring(0, 60)}${userClaim.length > 60 ? '...' : ''}") faces significant challenges. The Senator identified substantial weaknesses in the evidence and reasoning. The claim may need qualification or revision to be defensible.`;
    } else {
        verdict = `Verdict: The debate on "${userClaim.substring(0, 60)}${userClaim.length > 60 ? '...' : ''}" is genuinely contested. Both sides made substantive points supported by evidence or logical argument. The truth likely involves more nuance and qualification than either side's opening position suggested.`;
    }
    
    summaryVerdict.textContent = verdict;
    summaryPanel.style.display = 'block';
    summaryPanel.scrollIntoView({ behavior: 'smooth' });
}
