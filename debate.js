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
    if (sources.length > 0) {
        const freshSource = sources[Math.min(round, sources.length - 1)];
        if (freshSource && freshSource.snippet) {
            const freshAnalysis = analyzeSourceContent(freshSource);
            arg += `\n\nFresh supporting evidence: ${freshSource.title} (${freshSource.authors || freshSource.database}, ${freshSource.year || 'n.d.'})`;
            if (freshAnalysis.findings.length > 0) {
                arg += `\nThis study specifically found: ${freshAnalysis.findings[0]}`;
            }
            if (freshAnalysis.numbers.length > 0) {
                arg += `\nQuantitative result: ${freshAnalysis.numbers[0]}`;
            }
            arg += `\nThis directly addresses the opposition's concerns by providing ${freshAnalysis.methodology ? 'methodologically rigorous (' + freshAnalysis.methodology + ')' : 'independent'} evidence in support of the original claim.`;
        }
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
    if (advocateClaims.length > 0 && sources.length > 0) {
        const counterSource = sources[Math.min(round - 1, sources.length - 1)];
        if (counterSource && counterSource.snippet) {
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
        active: true, round: 0, userClaim: userClaim,
        advocateArguments: [], senatorArguments: [], allClaims: [], stopped: false
    };
    
    debateForm.style.display = 'none';
    debateControls.style.display = 'flex';
    
    try {
    
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
    
    try {
        generateSummary(userClaim, debateState, allSources);
    } catch (e) {
        console.error('Summary generation failed:', e);
        // Fallback: show a basic summary
        const content = document.getElementById('summaryContent');
        const status = document.getElementById('summaryStatus');
        status.textContent = 'Complete';
        content.innerHTML = '<div class="summary-verdict">The debate has concluded. Both sides presented arguments across ' + debateState.round + ' rounds. Review the arguments in the panels to the left.</div>';
    }
    
    // Reset UI
    debateState.active = false;
    debateControls.style.display = 'none';
    debateForm.style.display = 'flex';
    roundLabel.textContent = 'Debate complete — see Fact Check panel';
    
    } catch (err) {
        console.error('Debate error:', err);
        updateStatus('Error occurred');
        const content = document.getElementById('summaryContent');
        const status = document.getElementById('summaryStatus');
        if (status) status.textContent = 'Error';
        if (content) content.innerHTML = '<div class="summary-verdict">An error occurred during the debate: ' + (err.message || 'Unknown error') + '. Check browser console for details.</div>';
        debateState.active = false;
        debateControls.style.display = 'none';
        debateForm.style.display = 'flex';
    }
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
    document.getElementById('summaryContent').innerHTML = '<div class="summary-empty"><p>Analyzing claims as debate progresses...</p></div>';
    document.getElementById('summaryStatus').textContent = 'In progress...';
    
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
// Tracks specific claims from articles, determines what was validated/refuted,
// and shows which article supports or contradicts each point.
// ============================================================

function extractKeywords(text) {
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','to','of','in','for','on','with','at','by','from','as','and','or','but','not','that','this','it','its','they','them','their','we','our','you','your','he','she','which','been','being','into','more','most','also','than','very','just','about','these','those','would','could','should']);
    return text.toLowerCase().split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w)).slice(0, 10);
}

function topicOverlap(claimA, claimB) {
    const kwA = new Set(claimA.keywords || extractKeywords(claimA.text || claimA.finding || ''));
    const kwB = new Set(claimB.keywords || extractKeywords(claimB.text || claimB.finding || ''));
    let overlap = 0;
    for (const w of kwA) { if (kwB.has(w)) overlap++; }
    // Also count partial word matches (e.g. "depressive" matches "depression")
    if (overlap < 2) {
        const stemA = [...kwA].map(w => w.substring(0, 5));
        const stemB = [...kwB].map(w => w.substring(0, 5));
        for (const s of stemA) { if (stemB.includes(s)) overlap++; }
    }
    return overlap >= 2;
}

function generateSummary(userClaim, state, sources) {
    const { advocateArguments, senatorArguments } = state;
    
    // Analyze all sources that were actually used in the debate
    const analyzedSources = sources.filter(s => s.snippet && s.snippet.length > 30).slice(0, 8).map(s => ({
        ...s,
        analysis: analyzeSourceContent(s)
    }));
    
    // Extract specific evidence-backed claims from both sides
    const advocateEvidence = extractEvidenceBasedClaims(advocateArguments.join('\n\n'), analyzedSources);
    const senatorEvidence = extractEvidenceBasedClaims(senatorArguments.join('\n\n'), analyzedSources);
    
    // Cross-reference: which claims from Advocate were effectively countered by Senator?
    const results = [];
    
    // Process Advocate's claims
    for (const claim of advocateEvidence) {
        const wasRefuted = senatorEvidence.some(sc => topicOverlap(claim, sc));
        const refutedBy = wasRefuted ? senatorEvidence.find(sc => topicOverlap(claim, sc)) : null;
        
        results.push({
            text: claim.text,
            sourceContent: claim.sourceContent,
            status: wasRefuted ? 'refuted' : 'validated',
            side: 'Advocate',
            sourceTitle: claim.sourceTitle,
            sourceAuthors: claim.sourceAuthors,
            sourceYear: claim.sourceYear,
            sourceUrl: claim.sourceUrl,
            refutedByText: refutedBy ? refutedBy.text : null,
            refutedByContent: refutedBy ? refutedBy.sourceContent : null,
            refutedBySource: refutedBy ? refutedBy.sourceTitle : null,
            refutedByAuthors: refutedBy ? refutedBy.sourceAuthors : null,
            refutedByYear: refutedBy ? refutedBy.sourceYear : null,
            refutedByUrl: refutedBy ? refutedBy.sourceUrl : null
        });
    }
    
    // Process Senator's claims
    for (const claim of senatorEvidence) {
        const wasRefuted = advocateEvidence.some(ac => topicOverlap(claim, ac));
        const refutedBy = wasRefuted ? advocateEvidence.find(ac => topicOverlap(claim, ac)) : null;
        
        const isDuplicate = results.some(r => r.sourceTitle === claim.sourceTitle && topicOverlap({ keywords: extractKeywords(r.text) }, claim));
        if (isDuplicate) continue;
        
        results.push({
            text: claim.text,
            sourceContent: claim.sourceContent,
            status: wasRefuted ? 'refuted' : 'validated',
            side: 'Senator',
            sourceTitle: claim.sourceTitle,
            sourceAuthors: claim.sourceAuthors,
            sourceYear: claim.sourceYear,
            sourceUrl: claim.sourceUrl,
            refutedByText: refutedBy ? refutedBy.text : null,
            refutedByContent: refutedBy ? refutedBy.sourceContent : null,
            refutedBySource: refutedBy ? refutedBy.sourceTitle : null,
            refutedByAuthors: refutedBy ? refutedBy.sourceAuthors : null,
            refutedByYear: refutedBy ? refutedBy.sourceYear : null,
            refutedByUrl: refutedBy ? refutedBy.sourceUrl : null
        });
    }
    
    // If no specific evidence was extracted, create entries from the debate arguments themselves
    if (results.length === 0) {
        // Extract claims directly from what the bots said
        const advocateSentences = state.advocateArguments.join(' ').split(/[.!]+/).filter(s => s.trim().length > 50 && /\b(found|show|demonstrate|evidence|significant|increase|decrease|cause|effect|percent|study|research)\b/i.test(s));
        const senatorSentences = state.senatorArguments.join(' ').split(/[.!]+/).filter(s => s.trim().length > 50 && /\b(however|but|only|small|weak|flaw|limit|fail|not|unlikely|overstat|insufficient)\b/i.test(s));
        
        advocateSentences.slice(0, 3).forEach(s => {
            const refutation = senatorSentences.length > 0 ? senatorSentences[0].trim() : null;
            results.push({
                text: s.trim().substring(0, 180),
                sourceContent: null,
                status: senatorSentences.length > 0 ? 'refuted' : 'validated',
                side: 'Advocate',
                sourceTitle: 'Debate argument',
                sourceAuthors: '',
                sourceYear: null,
                sourceUrl: '',
                refutedByText: refutation ? refutation.substring(0, 180) : null,
                refutedByContent: refutation ? refutation.substring(0, 180) : null,
                refutedBySource: refutation ? 'Senator' : null,
                refutedByAuthors: null,
                refutedByYear: null,
                refutedByUrl: ''
            });
        });
        
        senatorSentences.slice(0, 3).forEach(s => {
            const refutation = advocateSentences.length > 0 ? advocateSentences[0].trim() : null;
            results.push({
                text: s.trim().substring(0, 180),
                sourceContent: null,
                status: advocateSentences.length > 0 ? 'refuted' : 'validated',
                side: 'Senator',
                sourceTitle: 'Debate argument',
                sourceAuthors: '',
                sourceYear: null,
                sourceUrl: '',
                refutedByText: refutation ? refutation.substring(0, 180) : null,
                refutedByContent: refutation ? refutation.substring(0, 180) : null,
                refutedBySource: refutation ? 'Advocate' : null,
                refutedByAuthors: null,
                refutedByYear: null,
                refutedByUrl: ''
            });
        });
    }
    
    renderSummary(userClaim, results);
}

// Extract claims that reference specific source findings
function extractEvidenceBasedClaims(text, analyzedSources) {
    const claims = [];
    const sentences = text.split(/[.!]+/).filter(s => s.trim().length > 40);
    
    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        
        // Match sentence to a source it likely references
        let matchedSource = null;
        for (const s of analyzedSources) {
            if (s.title && trimmed.includes(s.title.substring(0, 30))) { matchedSource = s; break; }
            if (s.authors && s.authors.length > 3 && trimmed.includes(s.authors.split(',')[0].trim())) { matchedSource = s; break; }
            if (s.year && trimmed.includes(String(s.year))) { matchedSource = s; break; }
        }
        
        // Also check for sentences with evidence indicators
        const hasEvidence = /\b(found|showed|demonstrated|reported|percent|%|\d{4}|study|research|data|evidence|significant|increase|decrease|reduce|associated)\b/i.test(trimmed);
        
        if (hasEvidence && trimmed.length > 50) {
            if (!matchedSource && analyzedSources.length > 0) {
                matchedSource = findBestMatchingSource(trimmed, analyzedSources);
            }
            
            // Get the ACTUAL content from the source (not just the debate sentence)
            let sourceContent = '';
            if (matchedSource) {
                // Use the source's actual snippet/abstract — this is what the article says
                sourceContent = matchedSource.snippet || '';
                // If the analysis found specific findings, use those
                if (matchedSource.analysis && matchedSource.analysis.findings.length > 0) {
                    sourceContent = matchedSource.analysis.findings[0];
                }
                // If numbers were found, append them
                if (matchedSource.analysis && matchedSource.analysis.numbers.length > 0) {
                    sourceContent += (sourceContent ? ' — ' : '') + matchedSource.analysis.numbers[0];
                }
            }
            
            claims.push({
                text: trimmed.substring(0, 200),
                sourceContent: sourceContent.substring(0, 250),
                sourceTitle: matchedSource?.title || 'Debate argument',
                sourceAuthors: matchedSource?.authors || '',
                sourceYear: matchedSource?.year || null,
                sourceUrl: matchedSource?.source || '',
                sourceSnippet: matchedSource?.snippet || '',
                keywords: extractKeywords(trimmed)
            });
        }
    }
    
    // Deduplicate by keywords
    const seen = new Set();
    return claims.filter(c => {
        const key = c.keywords.slice(0, 3).join('_');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 6);
}

function findBestMatchingSource(sentence, sources) {
    const sentenceWords = new Set(sentence.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    let bestMatch = null;
    let bestScore = 0;
    
    for (const s of sources) {
        const sourceWords = (s.snippet || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
        let score = 0;
        for (const w of sourceWords) { if (sentenceWords.has(w)) score++; }
        if (score > bestScore) { bestScore = score; bestMatch = s; }
    }
    
    return bestScore >= 3 ? bestMatch : null;
}

function renderSummary(userClaim, results) {
    const content = document.getElementById('summaryContent');
    const status = document.getElementById('summaryStatus');
    
    status.textContent = `${results.length} claims analyzed`;
    content.innerHTML = '';
    
    const validated = results.filter(r => r.status === 'validated');
    const refuted = results.filter(r => r.status === 'refuted');
    
    // Render validated claims
    if (validated.length > 0) {
        const section = document.createElement('div');
        section.innerHTML = `<h3 style="font-size:0.625rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--green);margin-bottom:0.5rem;">Validated Claims (${validated.length})</h3>`;
        validated.forEach(c => section.appendChild(createClaimCard(c)));
        content.appendChild(section);
    }
    
    // Render refuted claims
    if (refuted.length > 0) {
        const section = document.createElement('div');
        section.style.marginTop = '1rem';
        section.innerHTML = `<h3 style="font-size:0.625rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--red);margin-bottom:0.5rem;">Refuted Claims (${refuted.length})</h3>`;
        refuted.forEach(c => section.appendChild(createClaimCard(c)));
        content.appendChild(section);
    }
    
    // Verdict
    const verdict = document.createElement('div');
    verdict.className = 'summary-verdict';
    const validatedCount = validated.length;
    const refutedCount = refuted.length;
    
    if (validatedCount > refutedCount + 1) {
        verdict.textContent = `Verdict: The original position is well-supported. ${validatedCount} claims stood up to challenge; ${refutedCount} were effectively countered.`;
    } else if (refutedCount > validatedCount + 1) {
        verdict.textContent = `Verdict: The original position faces significant challenges. ${refutedCount} claims were effectively countered; only ${validatedCount} survived scrutiny.`;
    } else {
        verdict.textContent = `Verdict: The debate is genuinely contested. ${validatedCount} claims validated, ${refutedCount} challenged. The truth likely requires more nuance than either opening position.`;
    }
    content.appendChild(verdict);
}

function createClaimCard(claim) {
    const card = document.createElement('div');
    card.className = `claim-card ${claim.status}`;
    
    let html = `<div class="claim-card-header">`;
    html += `<span class="claim-badge ${claim.status}">${claim.status === 'validated' ? 'Supported' : 'Challenged'}</span>`;
    html += `<span class="claim-source-tag">${claim.side}</span>`;
    html += `</div>`;
    
    // The claim made during the debate
    html += `<div class="claim-text">${escapeHtml(claim.text)}</div>`;
    
    // What the supporting source ACTUALLY says (the content from the article)
    if (claim.sourceContent && claim.sourceContent !== claim.text) {
        html += `<div class="claim-detail">`;
        html += `<span class="detail-label">What the source says:</span>`;
        html += `"${escapeHtml(claim.sourceContent)}"`;
        html += `</div>`;
    }
    
    // What specifically refutes it — show the CONTENT from the refuting source
    if (claim.status === 'refuted') {
        html += `<div class="claim-detail" style="margin-top:0.375rem;">`;
        html += `<span class="detail-label">Challenged by:</span>`;
        if (claim.refutedByContent) {
            html += `"${escapeHtml(claim.refutedByContent)}"`;
        } else if (claim.refutedByText) {
            html += escapeHtml(claim.refutedByText);
        }
        if (claim.refutedBySource && claim.refutedBySource !== 'Debate argument') {
            html += `<br><em style="font-size:0.5625rem;color:var(--text-3);">— ${escapeHtml(claim.refutedBySource)}`;
            if (claim.refutedByAuthors) html += `, ${escapeHtml(claim.refutedByAuthors)}`;
            if (claim.refutedByYear) html += ` (${claim.refutedByYear})`;
            html += `</em>`;
        }
        html += `</div>`;
    }
    
    // Citing source (where the supporting claim comes from)
    if (claim.sourceTitle && claim.sourceTitle !== 'Debate argument') {
        html += `<div class="claim-article">`;
        html += `Cited: ${escapeHtml(claim.sourceTitle)}`;
        if (claim.sourceAuthors) html += ` — ${escapeHtml(claim.sourceAuthors)}`;
        if (claim.sourceYear) html += ` (${claim.sourceYear})`;
        if (claim.sourceUrl) html += `<br><a href="${escapeHtml(claim.sourceUrl)}" target="_blank" rel="noopener">View source</a>`;
        html += `</div>`;
    }
    
    card.innerHTML = html;
    return card;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
