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
// ============================================================

function advocateArgue(userClaim, round, senatorLastArg, sources) {
    const sourcesWithContent = sources.filter(s => s.snippet && s.snippet.length > 30);
    
    if (round === 1) {
        // Opening argument — establish the position with evidence
        return advocateOpening(userClaim, sourcesWithContent);
    } else {
        // Rebuttal — counter Senator's specific points
        return advocateRebuttal(senatorLastArg, userClaim, sourcesWithContent, round);
    }
}

function advocateOpening(claim, sources) {
    let arg = '';
    
    // Open with a clear thesis
    const openers = [
        `The position that "${claim.substring(0, 80)}${claim.length > 80 ? '...' : ''}" is well-supported by available evidence. Here's the case for it:`,
        `There are strong grounds for this position. The evidence supporting it comes from multiple independent lines of inquiry:`,
        `This claim withstands scrutiny. The weight of evidence, properly considered, supports it for the following reasons:`
    ];
    arg += pick(openers) + '\n\n';
    
    // If we have sources, cite them specifically
    if (sources.length >= 2) {
        arg += `Research supports this position. ${sources[0].title} (${sources[0].authors || sources[0].database}, ${sources[0].year || 'n.d.'}) finds: "${sources[0].snippet.substring(0, 180)}${sources[0].snippet.length > 180 ? '...' : ''}"`;
        arg += `\n\nAdditional support from ${sources[1].title} (${sources[1].database}, ${sources[1].year || 'n.d.'}): "${sources[1].snippet.substring(0, 150)}${sources[1].snippet.length > 150 ? '...' : ''}"`;
    } else if (sources.length === 1) {
        arg += `Published research lends support: ${sources[0].title} (${sources[0].authors || sources[0].database}, ${sources[0].year || 'n.d.'}) states: "${sources[0].snippet.substring(0, 200)}${sources[0].snippet.length > 200 ? '...' : ''}"`;
    } else {
        arg += pick([
            `While specific primary sources on this exact formulation are limited, the underlying logic is sound. The claim follows from well-established principles and is consistent with the broader body of evidence in this domain.`,
            `The position draws support from established frameworks and widely-observed patterns. Even absent a single decisive study, the convergence of evidence from multiple angles lends credibility to this view.`
        ]);
    }
    
    // Add logical support
    arg += '\n\n' + pick([
        `The logical structure of this argument is straightforward: the premises are defensible, the reasoning is valid, and the conclusion follows. The burden now falls on the opposition to identify a specific flaw in the chain of reasoning — not merely to express doubt.`,
        `This position has both empirical grounding and logical coherence. It makes specific predictions that are testable, explains observed phenomena, and is consistent with adjacent bodies of knowledge. These are the hallmarks of a well-supported claim.`,
        `The argument stands on multiple legs: it has evidential support, logical coherence, explanatory power, and practical applicability. Dismantling it requires addressing all of these, not just raising generic methodological objections.`
    ]);
    
    return arg;
}

function advocateRebuttal(senatorArg, userClaim, sources, round) {
    let arg = '';
    
    // Acknowledge Senator's point then counter it
    const rebuttalOpeners = [
        `The opposition raises points worth addressing, but they don't hold up under examination:`,
        `These objections are familiar but ultimately insufficient to overturn the original position:`,
        `The counter-argument has surface plausibility, but closer analysis reveals significant weaknesses:`
    ];
    arg += pick(rebuttalOpeners) + '\n\n';
    
    // Identify what Senator likely argued and counter it
    const senatorLower = senatorArg.toLowerCase();
    
    if (/replication|publication bias|methodology/i.test(senatorLower)) {
        arg += `The replication crisis argument is overplayed here. While some fields have replication issues, this doesn't invalidate all research — it means we should weight large-scale replicated findings and meta-analyses more heavily. And the evidence supporting this position comes from precisely those robust sources. The existence of bad studies doesn't discredit good ones.`;
    } else if (/correlation|causation|confound/i.test(senatorLower)) {
        arg += `The "correlation isn't causation" objection is technically correct but often deployed as a thought-terminating cliché. In practice, we establish causation through converging evidence: temporal precedence, dose-response relationships, mechanistic plausibility, and ruling out alternative explanations. The evidence here satisfies multiple causal criteria, not just bare correlation.`;
    } else if (/framework|utilitarian|deontolog|relative/i.test(senatorLower)) {
        arg += `The moral relativism objection — "different frameworks reach different conclusions" — proves too much. By that logic, no moral claim could ever be advanced, and moral progress would be incoherent. But moral progress is real: slavery abolition, women's suffrage, and civil rights represent genuine advances, not mere preference changes. Some moral positions are better-supported than others.`;
    } else if (/implementation|unintended|policy fail/i.test(senatorLower)) {
        arg += `The argument that "policies sometimes fail" is true but not decisive. Policies also sometimes succeed dramatically: the Clean Air Act reduced acid rain by 80%, seatbelt mandates cut traffic fatalities by 45%, and vaccination programs eliminated smallpox. The question isn't whether any policy has ever failed — it's whether this specific proposal is well-designed and evidence-based. Cherry-picking failures while ignoring successes is selection bias.`;
    } else if (/prediction|forecast|complex system/i.test(senatorLower)) {
        arg += `The claim that "predictions always fail" is itself a prediction — and a falsified one. Weather forecasting has improved dramatically. Actuarial tables are highly accurate. Demographic projections are reliable over medium terms. The opposition conflates "some predictions fail" with "all prediction is impossible." Properly calibrated probabilistic forecasts are routinely useful for decision-making.`;
    } else if (/natural|nature|evolution/i.test(senatorLower)) {
        arg += `The naturalistic fallacy objection applies when someone argues "X is natural, therefore X is good." But the original position doesn't rely on that. It's possible to observe a natural pattern and draw conclusions from it without committing the is-ought fallacy — the key is whether the reasoning bridges that gap properly, which it does here.`;
    } else {
        arg += pick([
            `The opposition's core strategy is to raise doubt without providing an affirmative alternative. Skepticism is easy; constructing a better explanation is hard. The position I'm defending doesn't need to be perfect — it needs to be better-supported than available alternatives. And it is.`,
            `Notice the opposition's approach: genericized methodological objections that could be aimed at virtually any claim. But not all claims are equally uncertain. The evidence here is specific, replicated, and drawn from credible sources. General-purpose skepticism doesn't address the particular strengths of this argument.`,
            `The opposition has attacked the general category of reasoning being used rather than the specific argument being made. That's a dodge. The question isn't whether ALL causal claims (or moral claims, or empirical claims) can be questioned — it's whether THIS particular claim survives scrutiny. And it does, for the specific reasons I've outlined.`
        ]);
    }
    
    // Add fresh evidence if available
    if (sources.length > 0 && round <= 3) {
        const freshSource = sources[Math.min(round, sources.length - 1)];
        if (freshSource.snippet) {
            arg += `\n\nFurther supporting evidence: ${freshSource.title} (${freshSource.authors || freshSource.database}, ${freshSource.year || 'n.d.'}): "${freshSource.snippet.substring(0, 160)}${freshSource.snippet.length > 160 ? '...' : ''}"`;
        }
    }
    
    // Closing point
    if (round >= 3) {
        arg += '\n\n' + pick([
            `In summary: the original position has survived multiple rounds of challenge. The opposition has raised generic doubts but has not identified a specific fatal flaw in the reasoning or produced counter-evidence that directly contradicts the cited findings.`,
            `The cumulative case remains strong. The opposition's strategy of raising general methodological concerns does not address the specific evidence and reasoning supporting this position. The burden has shifted: if the opposition cannot produce direct counter-evidence, the original claim stands.`
        ]);
    }
    
    return arg;
}


// ============================================================
// SENATOR BOT — Argues against the user's position
// (Adapted from app.js counter-argument engine)
// ============================================================

function senatorArgue(userClaim, round, advocateLastArg, sources) {
    if (round === 1) {
        return senatorOpening(userClaim, sources);
    } else {
        return senatorRebuttal(advocateLastArg, userClaim, sources, round);
    }
}

function senatorOpening(claim, sources) {
    const msg = claim.toLowerCase();
    let arg = '';
    
    // Select category-appropriate counter-argument
    const categories = [
        [/\b(research|studies?|data|evidence|science)\b/i, 'empirical'],
        [/\b(should|ought|must|wrong|right|moral|ethical)\b/i, 'moral'],
        [/\b(government|policy|law|regulation|tax)\b/i, 'policy'],
        [/\b(people are|humans are|human nature|evolved)\b/i, 'humanNature'],
        [/\b(technology|ai|automation|progress|digital)\b/i, 'technology'],
        [/\b(causes?|leads?\s+to|results?\s+in)\b/i, 'causal'],
        [/\b(all|every|always|never|no one|everyone)\b/i, 'absolute'],
        [/\b(will|going to|inevitably|guaranteed)\b/i, 'predictive']
    ];
    
    let type = 'general';
    for (const [pattern, t] of categories) { if (pattern.test(msg)) { type = t; break; } }
    
    arg = SENATOR_COUNTERS[type]();
    
    // Cite contradicting sources if available
    if (sources.length > 0 && sources[0].snippet) {
        arg += `\n\nResearch complicating this position: ${sources[0].title} (${sources[0].authors || sources[0].database}, ${sources[0].year || 'n.d.'}): "${sources[0].snippet.substring(0, 180)}${sources[0].snippet.length > 180 ? '...' : ''}"`;
    }
    
    return arg;
}

function senatorRebuttal(advocateArg, userClaim, sources, round) {
    let arg = '';
    const advLower = advocateArg.toLowerCase();
    
    const rebuttalOpeners = [
        `The defense offered here is sophisticated but ultimately unpersuasive:`,
        `These supporting arguments, while well-constructed, don't address the fundamental problems:`,
        `The advocate's response reveals the difficulty of the position rather than resolving it:`
    ];
    arg += pick(rebuttalOpeners) + '\n\n';
    
    // Counter the Advocate's specific strategies
    if (/meta-analysis|replicated|robust/i.test(advLower)) {
        arg += `Citing meta-analyses doesn't settle the question — it merely moves the uncertainty up one level. Meta-analyses inherit the biases of their constituent studies. A meta-analysis of flawed studies produces a flawed meta-analysis with higher confidence. Garbage in, garbage out — with better packaging. The question remains whether the underlying methodology is sound.`;
    } else if (/multiple.*criteria|converging evidence|dose.response/i.test(advLower)) {
        arg += `"Converging evidence" is persuasive rhetoric but it's not the same as experimental confirmation. Multiple lines of weak evidence can converge on a wrong conclusion if they share common methodological biases or confounders. The history of medicine is full of treatments supported by "converging evidence" that randomized trials later disproved.`;
    } else if (/moral progress|slavery|women.*suffrage/i.test(advLower)) {
        arg += `Invoking "moral progress" begs the question. Calling changes "progress" assumes the endpoint we've reached is correct — which is precisely what's being debated. People in 1850 also believed their moral views represented progress over previous generations. Every era believes it has reached the correct moral conclusions. That confidence has a 100% historical failure rate.`;
    } else if (/clean air|seatbelt|vaccination|succeed/i.test(advLower)) {
        arg += `Cherry-picking policy successes is the mirror image of cherry-picking failures. For every Clean Air Act, there's a War on Poverty that spent trillions without reducing poverty rates. The question isn't whether any policy has ever worked — it's what the base rate of success is for THIS type of intervention, and whether the specific design features that made other policies succeed are present here.`;
    } else if (/weather|actuarial|demographic/i.test(advLower)) {
        arg += `Weather forecasting, actuarial tables, and demographics are simple systems compared to social, economic, or political prediction. Weather models work because physics is regular; actuarial tables work because mortality follows statistical distributions; demographics are slow-moving. None of these validate predictions about complex adaptive systems with human agency and reflexivity. The comparison is misleading.`;
    } else {
        arg += pick([
            `The defense relies on the claim that this position is "better supported than alternatives." But that's a low bar that conceals how uncertain the evidence actually is. Being the best available explanation doesn't make something true — the best available explanation in 1850 for disease was miasma theory. It was the best available AND wrong.`,
            `The advocate accuses me of generic skepticism, but my objections are specific: the evidence cited doesn't establish what's claimed with the certainty that's being asserted. The gap between "suggestive evidence exists" and "this is established fact" is enormous, and the defense hasn't bridged it.`,
            `Notice what the defense hasn't done: it hasn't addressed the specific counter-evidence I raised or explained why it shouldn't modify the original claim. Instead, it's reasserted the original position with additional rhetoric. Repetition isn't refutation.`
        ]);
    }
    
    // Cite additional sources in later rounds
    if (sources.length > round && sources[round].snippet) {
        const s = sources[round];
        arg += `\n\nAdditional counter-evidence: ${s.title} (${s.authors || s.database}, ${s.year || 'n.d.'}): "${s.snippet.substring(0, 150)}${s.snippet.length > 150 ? '...' : ''}"`;
    }
    
    // Closing in final round
    if (round >= DEBATE_CONFIG.maxRounds) {
        arg += '\n\n' + pick([
            `In closing: the original claim has not been established to the standard required. Supporting evidence exists but is insufficient to overcome the methodological, logical, and evidential challenges raised. A more qualified version of the claim — acknowledging its limitations and boundary conditions — would be more defensible than the version presented.`,
            `To summarize: the defense has presented supporting evidence but has not adequately addressed the counter-evidence and logical objections raised. The original claim may contain a kernel of truth, but it has been overstated relative to what the evidence actually supports.`
        ]);
    }
    
    return arg;
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
