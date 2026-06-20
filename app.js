// Counter-Argument Engine — Makes direct counter-arguments backed by primary sources
// No questions. No Socratic method. Just opposing positions with evidence.

const chatContainer = document.getElementById('chatContainer');
const inputForm = document.getElementById('inputForm');
const userInput = document.getElementById('userInput');

let conversationHistory = [];
let debateContext = {
    userPositions: [],
    contradictions: [],
    weaknessesExploited: []
};

// ============================================================
// SEARCH CONFIGURATION & PRIMARY SOURCE APIs
// ============================================================
const SEARCH_CONFIG = {
    enabled: true,
    timeout: 10000
};

const PRIMARY_SOURCE_APIS = {
    semanticScholar: {
        search: 'https://api.semanticscholar.org/graph/v1/paper/search',
        fields: 'title,abstract,year,citationCount,journal,authors,url,tldr',
        name: 'Semantic Scholar',
        type: 'peer-reviewed research'
    },
    openAlex: {
        search: 'https://api.openalex.org/works',
        name: 'OpenAlex',
        type: 'scholarly works'
    },
    pubmed: {
        search: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
        summary: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
        name: 'PubMed (NIH/NCBI)',
        type: 'biomedical research'
    },
    usGov: {
        search: 'https://catalog.data.gov/api/3/action/package_search',
        name: 'US Government (data.gov)',
        type: 'government publication'
    },
    ukGov: {
        search: 'https://www.gov.uk/api/search.json',
        name: 'UK Government (gov.uk)',
        type: 'government publication'
    },
    euPublications: {
        searchAlt: 'https://data.europa.eu/api/hub/search/search',
        name: 'EU Publications Office',
        type: 'government publication'
    }
};


// ============================================================
// PRIMARY SOURCE SEARCH FUNCTIONS
// ============================================================

async function searchSemanticScholar(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.semanticScholar.search}?query=${encodeURIComponent(query)}&limit=5&fields=${PRIMARY_SOURCE_APIS.semanticScholar.fields}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!response.ok) return [];
        const data = await response.json();
        if (!data.data || data.data.length === 0) return [];
        return data.data.map(paper => ({
            title: paper.title,
            snippet: paper.tldr?.text || paper.abstract?.substring(0, 300) || '',
            source: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
            year: paper.year,
            citations: paper.citationCount,
            journal: paper.journal?.name || 'Unknown journal',
            authors: (paper.authors || []).slice(0, 3).map(a => a.name).join(', '),
            type: 'peer-reviewed paper',
            database: 'Semantic Scholar'
        }));
    } catch (e) { return []; }
}

async function searchOpenAlex(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.openAlex.search}?search=${encodeURIComponent(query)}&per_page=5&select=id,title,abstract_inverted_index,publication_year,cited_by_count,primary_location,authorships`;
        const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout), headers: { 'Accept': 'application/json' } });
        if (!response.ok) return [];
        const data = await response.json();
        if (!data.results || data.results.length === 0) return [];
        return data.results.map(work => {
            let abstract = '';
            if (work.abstract_inverted_index) {
                const words = [];
                for (const [word, positions] of Object.entries(work.abstract_inverted_index)) {
                    for (const pos of positions) { words[pos] = word; }
                }
                abstract = words.join(' ').substring(0, 300);
            }
            return {
                title: work.title || 'Untitled',
                snippet: abstract,
                source: work.primary_location?.landing_page_url || work.id,
                year: work.publication_year,
                citations: work.cited_by_count,
                journal: work.primary_location?.source?.display_name || 'Unknown source',
                authors: (work.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(', '),
                type: 'scholarly work',
                database: 'OpenAlex'
            };
        });
    } catch (e) { return []; }
}

async function searchPubMed(query) {
    try {
        const searchUrl = `${PRIMARY_SOURCE_APIS.pubmed.search}?db=pubmed&term=${encodeURIComponent(query)}&retmax=3&retmode=json`;
        const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!searchResponse.ok) return [];
        const searchData = await searchResponse.json();
        const ids = searchData.esearchresult?.idlist || [];
        if (ids.length === 0) return [];
        const summaryUrl = `${PRIMARY_SOURCE_APIS.pubmed.summary}?db=pubmed&id=${ids.join(',')}&retmode=json`;
        const summaryResponse = await fetch(summaryUrl, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!summaryResponse.ok) return [];
        const summaryData = await summaryResponse.json();
        return ids.map(id => {
            const paper = summaryData.result?.[id];
            if (!paper) return null;
            return {
                title: paper.title || 'Untitled',
                snippet: paper.sorttitle || paper.title || '',
                source: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                year: parseInt(paper.pubdate?.split(' ')[0]) || null,
                citations: null,
                journal: paper.fulljournalname || paper.source || 'Unknown journal',
                authors: (paper.authors || []).slice(0, 3).map(a => a.name).join(', '),
                type: 'biomedical research',
                database: 'PubMed (NIH)'
            };
        }).filter(Boolean);
    } catch (e) { return []; }
}

async function searchUSGov(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.usGov.search}?q=${encodeURIComponent(query)}&rows=3`;
        const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!response.ok) return [];
        const data = await response.json();
        if (!data.result?.results?.length) return [];
        return data.result.results.map(d => ({
            title: d.title || 'Untitled',
            snippet: (d.notes || '').substring(0, 300),
            source: d.url || `https://catalog.data.gov/dataset/${d.name}`,
            year: d.metadata_created ? new Date(d.metadata_created).getFullYear() : null,
            citations: null,
            journal: d.organization?.title || 'US Government',
            authors: d.organization?.title || 'US Government',
            type: 'US government publication',
            database: 'US Government (data.gov)'
        }));
    } catch (e) { return []; }
}

async function searchUKGov(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.ukGov.search}?q=${encodeURIComponent(query)}&count=3&filter_format=research-and-statistics,policy-paper,guidance,statistical-data-set`;
        const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!response.ok) return [];
        const data = await response.json();
        if (!data.results?.length) return [];
        return data.results.map(r => ({
            title: r.title || 'Untitled',
            snippet: r.description || '',
            source: `https://www.gov.uk${r.link}`,
            year: r.public_timestamp ? new Date(r.public_timestamp).getFullYear() : null,
            citations: null,
            journal: r.organisations?.[0]?.title || 'UK Government',
            authors: r.organisations?.[0]?.title || 'UK Government',
            type: 'UK government publication',
            database: 'UK Government (gov.uk)'
        }));
    } catch (e) { return []; }
}

async function searchEUPublications(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.euPublications.searchAlt}?q=${encodeURIComponent(query)}&limit=3`;
        const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout), headers: { 'Accept': 'application/json' } });
        if (!response.ok) return [];
        const data = await response.json();
        const results = data.result?.results || data.results || [];
        return results.slice(0, 3).map(r => {
            const title = r.title?.en || r.title || (typeof r.title === 'object' ? Object.values(r.title)[0] : 'EU Publication');
            const desc = r.description?.en || r.description || (typeof r.description === 'object' ? Object.values(r.description)[0] : '');
            const pub = r.catalog?.publisher?.name || r.publisher?.name || 'European Union';
            return {
                title: typeof title === 'string' ? title : 'EU Publication',
                snippet: (typeof desc === 'string' ? desc : '').substring(0, 300),
                source: r.access_url || r.landing_page || r.id || 'https://data.europa.eu',
                year: r.issued ? new Date(r.issued).getFullYear() : null,
                citations: null,
                journal: typeof pub === 'string' ? pub : 'European Union',
                authors: typeof pub === 'string' ? pub : 'European Union',
                type: 'EU government publication',
                database: 'EU Publications Office'
            };
        });
    } catch (e) { return []; }
}

async function searchAllPrimarySources(query) {
    const results = await Promise.allSettled([
        searchSemanticScholar(query),
        searchOpenAlex(query),
        searchPubMed(query),
        searchUSGov(query),
        searchUKGov(query),
        searchEUPublications(query)
    ]);
    let all = [];
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value.length > 0) all = [...all, ...r.value];
    }
    all.sort((a, b) => (b.citations || 0) - (a.citations || 0));
    return all;
}


// ============================================================
// COUNTER-ARGUMENT ENGINE — No questions, only opposing positions
// ============================================================

// Detect the user's core claim and build a DIRECT counter-argument (no questions)
function buildDirectCounterArgument(message, sources) {
    const msg = message.toLowerCase();
    
    // Try specific counter-argument builders in priority order
    const builders = [
        { trigger: /\b(research\s+shows|studies?\s+(show|prove)|data\s+(shows?|proves?)|statistics?|evidence\s+(shows?|proves?))\b/i, build: counterBuilders.empirical },
        { trigger: /\b(should|ought|must|wrong\s+to|right\s+to|duty|obligation|immoral|unethical)\b/i, build: counterBuilders.moral },
        { trigger: /\b(government|policy|law|regulation|tax|ban|mandate|legislation)\b/i, build: counterBuilders.policy },
        { trigger: /\b(people\s+are|humans?\s+are|human\s+nature|we\s+are\s+(all|naturally)|innate|hardwired|evolved\s+to)\b/i, build: counterBuilders.humanNature },
        { trigger: /\b(technology|ai|automation|progress|innovation|digital|internet|algorithm)\b/i, build: counterBuilders.technology },
        { trigger: /\b(i\s+am|we\s+are|my\s+(generation|group)|our\s+(values?|culture))\b/i, build: counterBuilders.identity },
        { trigger: /\b(causes?|leads?\s+to|results?\s+in|creates?|produces?)\b/i, build: counterBuilders.causal },
        { trigger: /\b(all|every|always|never|no one|everyone|nobody)\b/i, build: counterBuilders.absolute },
        { trigger: /\b(natural|unnatural|nature\s+intended|meant\s+to\s+be)\b/i, build: counterBuilders.nature },
        { trigger: /\b(better|worse|superior|inferior|the best|the worst)\b/i, build: counterBuilders.comparative },
        { trigger: /\b(will|going\s+to|bound\s+to|inevitably|guaranteed)\b/i, build: counterBuilders.predictive }
    ];
    
    for (const { trigger, build } of builders) {
        if (trigger.test(msg)) {
            return build(message, sources);
        }
    }
    
    // Default: general counter-argument
    return counterBuilders.general(message, sources);
}

// All counter-argument builders — make ASSERTIONS, not questions
const counterBuilders = {
    empirical: (message, sources) => {
        const counters = [
            `The research landscape is more complicated than you're presenting. Publication bias systematically inflates positive findings — studies that fail to confirm hypotheses rarely get published. The replication crisis has shown that up to 50% of published findings in some fields cannot be reproduced. Your confidence in "what the research shows" should be tempered by the systemic flaws in how research gets published and reported.`,
            `"Studies show" is not the conversation-ender you think it is. Individual studies are data points, not verdicts. Meta-analyses frequently reveal contradictory findings across the literature. The effect sizes are often smaller than headlines suggest, sample sizes inadequate, and confounding variables uncontrolled. The honest summary of most research topics is "it's complicated" — not the clean narrative you're presenting.`,
            `Your appeal to research conflates "a study found X" with "X is established fact." But the distance between those two claims is enormous. A single study (or even several) establishes a hypothesis worth investigating, not a settled conclusion. The history of science is littered with "well-established" findings that were later overturned when better methodology was applied.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    moral: (message, sources) => {
        const counters = [
            `Your moral framework isn't universal — it's one of many competing ethical systems, each internally consistent but reaching different conclusions. A utilitarian, a deontologist, a virtue ethicist, and a care ethicist would each evaluate this differently. You're presenting one framework's conclusion as though it were self-evident truth. It isn't. The competing frameworks have equally rigorous philosophical defenses.`,
            `Moral obligations don't exist in nature — they're constructed by societies to serve specific functions. The "should" you're invoking reflects the values of a particular time, place, and culture. Many moral certainties of previous generations (divine right of kings, the propriety of slavery, rigid gender roles) have been abandoned. Your moral claim may look equally parochial to future generations.`,
            `You're making a prescriptive claim ("this is what ought to be") but treating it as though it were descriptive ("this is how things are"). The gap between "is" and "ought" — Hume's guillotine — cannot be crossed by logic alone. No amount of factual observation can generate a moral obligation. Your moral conclusion requires moral premises that themselves need justification, and that justification is precisely what's being contested.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    policy: (message, sources) => {
        const counters = [
            `Every policy creates winners and losers — you've identified the winners and ignored the losers. Implementation gaps between policy intent and policy outcomes are massive and well-documented. Regulatory capture, perverse incentives, unintended consequences, and administrative incompetence reliably transform good-on-paper policies into real-world failures. The question isn't whether your policy sounds good in theory — it's whether it survives contact with institutional reality.`,
            `You're proposing a solution, but you haven't established that the problem requires THIS solution, that the cure isn't worse than the disease, or that implementation is feasible. Public choice theory demonstrates that policymakers operate with their own incentives, information asymmetries, and institutional constraints. The idealized policy you're describing will be administered by imperfect humans in imperfect institutions — and the gap between ideal and actual execution is where most policies fail.`,
            `History provides abundant evidence that policies with your stated goals have produced opposite outcomes when implemented. Rent control reduces housing supply. Prohibition increased organized crime. The War on Drugs increased incarceration without reducing drug use. Good intentions are not predictive of good outcomes. The empirical track record of similar interventions should give you significant pause.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    humanNature: (message, sources) => {
        const counters = [
            `Claims about "human nature" have historically served as post-hoc rationalizations for whatever social arrangements currently exist. Every oppressive system in history — slavery, feudalism, patriarchy — was defended as "natural." The enormous cross-cultural variation in human behavior demonstrates that what feels like immutable nature is often deep cultural conditioning. If human nature were as fixed as you claim, anthropologists would find uniformity — instead they find staggering diversity.`,
            `Evolutionary psychology narratives about human nature are largely unfalsifiable just-so stories. They explain everything after the fact and predict nothing in advance. For every "natural" tendency you cite, I can identify cultures where the opposite behavior predominates. The flexibility and plasticity of human behavior is the actual finding of behavioral science — not the rigidity you're claiming.`,
            `Even granting that humans have biological tendencies, tendencies are not destinies. Civilization is precisely the project of overriding natural impulses — we suppress aggression, delay gratification, cooperate with strangers, and follow abstract rules. If "it's natural" were a valid argument, medicine, agriculture, and every human institution would be indefensible. The naturalistic fallacy remains a fallacy regardless of how intuitively it feels correct.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    technology: (message, sources) => {
        const counters = [
            `Technology is never neutral — it embeds the values, biases, and blind spots of its creators while redistributing power in ways that are rarely transparent. Every technological revolution has produced catastrophes alongside its benefits: the printing press enabled propaganda, industrialization created ecological destruction, social media enabled mass manipulation. The shadow side of what you're celebrating is real, documented, and being experienced by people you're not seeing.`,
            `"Progress" is a value judgment disguised as a description. Progress toward what? Measured by whom? At whose expense? The assumption that newer technology is better technology is itself an ideological position, not a neutral observation. Indigenous knowledge systems, local practices, and analog solutions often outperform technological interventions for specific populations — but they're invisible to a framework that equates novelty with improvement.`,
            `The track record of technological optimism is poor. Predictions about technology's benefits routinely ignore distributional effects (who benefits vs. who is harmed), displacement effects (what is destroyed to make room), and dependency effects (what autonomy is surrendered). The honest accounting of any technology must include its full cost structure — not just the benefits to early adopters.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    identity: (message, sources) => {
        const counters = [
            `Identity claims are rhetorically powerful but logically empty. "As an X, I believe Y" doesn't make Y more true — it establishes your perspective, not your correctness. The conflation of identity with argument makes beliefs unfalsifiable: challenging the claim becomes an attack on the person. But intellectual progress requires separating what we believe from who we are, so beliefs can be evaluated on their merits alone.`,
            `The identity you're invoking is itself a construction — shaped by specific historical, cultural, and institutional forces. It feels natural because it's deeply internalized, but it was assembled from available materials by social processes you didn't choose and may not fully understand. This doesn't make it invalid, but it does mean "this is who I am" cannot be the final word in a rational discussion.`,
            `Group identities are statistical abstractions that obscure individual variation. Within any group you name, the internal diversity of belief, experience, and value is enormous. Speaking "as" a member of a group flattens that diversity and claims representative authority that may not be warranted. Your experience as a member of this group is real; it does not generalize to universal claims about what the group is or what it believes.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    causal: (message, sources) => {
        const counters = [
            `Correlation is not causation — and the causal claim you're making has not survived the scrutiny required to establish it. Causal inference requires controlling for confounding variables, establishing temporal precedence, eliminating reverse causation, and demonstrating mechanism. Observational claims about what "causes" what almost always reflect selective attention to confirming cases while ignoring disconfirming ones.`,
            `The causal relationship you're asserting is almost certainly more complex than a simple A→B model. Real-world causation involves feedback loops, mediating variables, moderating conditions, and threshold effects. Simple causal narratives are psychologically satisfying but empirically inadequate. The actual research on this topic (when it exists) invariably reveals a web of interacting factors — not the clean causal arrow you're drawing.`,
            `Even if the causal relationship exists, its magnitude matters enormously. A factor can "cause" something while explaining only 2% of the variance — technically true but practically meaningless. Effect sizes, not mere statistical significance, determine whether a causal claim should influence anyone's thinking or behavior. Most popularized causal claims have effect sizes too small to be actionable.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    absolute: (message, sources) => {
        const counters = [
            `Absolute claims are empirically indefensible. "Always," "never," "all," and "none" are the vocabulary of ideology, not evidence. Reality operates in distributions, not binaries. The moment a single counterexample exists — and one always does — your universal claim collapses into a tendency claim that requires entirely different justification and carries much weaker implications.`,
            `You're stating a universal where the evidence supports only a tendency. This isn't a minor distinction — it's the difference between a law and a pattern, between a certainty and a probability. Universal claims demand universal evidence; tendency claims only need statistical evidence. By overstating your case, you've made it trivially easy to refute. The more precise (and defensible) version of your claim is more interesting but less rhetorically satisfying.`,
            `Absolutism in argument is a tell — it signals that emotional conviction has outrun evidential support. The world is characterized by exceptions, edge cases, and context-dependency. Anyone claiming that something is "always" or "never" the case is either ignorant of the counterexamples or choosing to ignore them. Neither is a good epistemic position.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    nature: (message, sources) => {
        const counters = [
            `The naturalistic fallacy: inferring what ought to be from what is (or what was). Nature is amoral — it produces both cooperation and predation, both nurturing and infanticide, both symbiosis and parasitism. Selecting "natural" phenomena that support your preferred conclusion while ignoring those that don't is cherry-picking dressed in evolutionary clothing. Nature provides no moral guidance because it contains every possible moral lesson simultaneously.`,
            `"Natural" is an empty category for moral reasoning. Diseases are natural. Earthquakes are natural. Infant mortality is natural. The entire project of civilization is the systematic overriding of natural conditions in favor of intentionally constructed ones. If you wouldn't apply "but it's natural" to defend tuberculosis, you can't selectively apply it to defend your preferred social arrangements.`,
            `Appeals to nature commit a basic logical error: confusing the descriptive (what exists in nature) with the normative (what should exist in society). Evolution by natural selection is descriptive biology, not prescriptive ethics. We don't derive our legal systems, moral codes, or social institutions from nature — we construct them deliberately. "It's natural" has never been a valid argument for or against anything.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    comparative: (message, sources) => {
        const counters = [
            `Every comparative claim ("better," "worse," "superior") conceals unstated criteria. Better by what measure? For whom? Over what time horizon? Under what conditions? There is no view from nowhere — every ranking reflects a value system. Your claim that X is "better" than Y is only as strong as your justification for the criteria you're using, and that justification is precisely what's absent from your argument.`,
            `Comparative judgments depend entirely on what you choose to measure. By selectively choosing metrics, you can make almost anything appear superior to anything else. The question isn't whether X outperforms Y on your chosen dimension — it's whether your chosen dimension is the right one, and why we should privilege it over the dimensions where Y outperforms X.`,
            `You're comparing across incommensurable values. The things you're ranking may not exist on a single scale — they may involve genuine tradeoffs between competing goods. Calling one "better" flattens the tradeoff into a false hierarchy. The more honest claim is: "X is better than Y along dimension D, at the cost of being worse along dimensions E, F, and G." That's a harder claim to make compellingly.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    predictive: (message, sources) => {
        const counters = [
            `Predictions about complex systems have a dismal track record. Philip Tetlock's research demonstrates that expert predictions about social, political, and economic outcomes are barely better than chance — and confident predictions are often worse than tentative ones. The future is not a knowable object; it's an emergent property of countless interacting systems, each capable of producing surprises. Your prediction reflects confidence, not knowledge.`,
            `You're extrapolating from current trends, but trends reverse, plateau, interact, and produce emergent outcomes that no linear projection can capture. The history of futurism is a graveyard of confident predictions: flying cars by 2000, paperless offices by 1990, nuclear power "too cheap to meter." Base rates for prediction accuracy should make anyone expressing certainty about the future deeply humble.`,
            `Predicting outcomes in complex adaptive systems is fundamentally different from predicting outcomes in simple mechanical systems. The systems you're making predictions about involve human agency, reflexivity (predictions change behavior which changes outcomes), and sensitivity to initial conditions. Confident prediction in such systems isn't bold — it's epistemically reckless.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    },
    
    general: (message, sources) => {
        const counters = [
            `Here's the case against you: your claim rests on assumptions that are contestable, evidence that is incomplete, and reasoning that skips steps. The strongest version of the opposing position holds that what you're asserting is at best partially true, applies only under specific conditions you haven't specified, and carries implications you haven't acknowledged. The world is more complicated than your claim allows for.`,
            `I'll argue the opposite position directly: the confidence with which you've stated this is inversely proportional to the evidence supporting it. Complex claims about complex systems require epistemic humility — the acknowledgment that you might be wrong, that your sources might be biased, that your framing might be one of many valid framings, and that the full picture is more ambiguous than your statement suggests.`,
            `Counter-position: you're treating a contested claim as settled, a perspective as a fact, or an interpretation as the only possible reading. The most rigorous thinkers on this topic disagree with each other — which means your certainty is unwarranted. The honest position acknowledges that intelligent, well-informed people can examine the same evidence and reach different conclusions. Your claim hasn't earned the certainty you've given it.`
        ];
        return counters[Math.floor(Math.random() * counters.length)];
    }
};


// ============================================================
// PRIMARY SOURCE SEARCH FUNCTIONS
// ============================================================

function buildSearchQuery(message) {
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','then','once','here','there','when','where','why','how','all','each','every','both','few','more','most','other','some','such','no','nor','not','only','same','so','than','too','very','just','because','but','and','or','if','while','that','this','these','those','it','its','they','them','their','we','our','you','your','he','him','his','she','her','i','my','me','think','believe','feel','really','actually','basically','literally']);
    const words = message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    return words.slice(0, 8).join(' ');
}

async function searchSemanticScholar(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.semanticScholar.search}?query=${encodeURIComponent(query)}&limit=5&fields=${PRIMARY_SOURCE_APIS.semanticScholar.fields}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!response.ok) return [];
        const data = await response.json();
        if (!data.data?.length) return [];
        return data.data.map(p => ({
            title: p.title, snippet: p.tldr?.text || p.abstract?.substring(0, 300) || '',
            source: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
            year: p.year, citations: p.citationCount,
            journal: p.journal?.name || '', authors: (p.authors || []).slice(0, 3).map(a => a.name).join(', '),
            database: 'Semantic Scholar'
        }));
    } catch (e) { return []; }
}

async function searchOpenAlex(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.openAlex.search}?search=${encodeURIComponent(query)}&per_page=5&select=id,title,abstract_inverted_index,publication_year,cited_by_count,primary_location,authorships`;
        const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout), headers: { 'Accept': 'application/json' } });
        if (!response.ok) return [];
        const data = await response.json();
        if (!data.results?.length) return [];
        return data.results.map(w => {
            let abs = '';
            if (w.abstract_inverted_index) { const words = []; for (const [word, pos] of Object.entries(w.abstract_inverted_index)) { for (const p of pos) words[p] = word; } abs = words.join(' ').substring(0, 300); }
            return { title: w.title || 'Untitled', snippet: abs, source: w.primary_location?.landing_page_url || w.id, year: w.publication_year, citations: w.cited_by_count, journal: w.primary_location?.source?.display_name || '', authors: (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(', '), database: 'OpenAlex' };
        });
    } catch (e) { return []; }
}

async function searchPubMed(query) {
    try {
        const r1 = await fetch(`${PRIMARY_SOURCE_APIS.pubmed.search}?db=pubmed&term=${encodeURIComponent(query)}&retmax=3&retmode=json`, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!r1.ok) return [];
        const d1 = await r1.json(); const ids = d1.esearchresult?.idlist || []; if (!ids.length) return [];
        const r2 = await fetch(`${PRIMARY_SOURCE_APIS.pubmed.summary}?db=pubmed&id=${ids.join(',')}&retmode=json`, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!r2.ok) return [];
        const d2 = await r2.json();
        return ids.map(id => { const p = d2.result?.[id]; if (!p) return null; return { title: p.title || '', snippet: '', source: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, year: parseInt(p.pubdate?.split(' ')[0]) || null, citations: null, journal: p.fulljournalname || p.source || '', authors: (p.authors || []).slice(0, 3).map(a => a.name).join(', '), database: 'PubMed (NIH)' }; }).filter(Boolean);
    } catch (e) { return []; }
}

async function searchUSGov(query) {
    try {
        const r = await fetch(`${PRIMARY_SOURCE_APIS.usGov.search}?q=${encodeURIComponent(query)}&rows=3`, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!r.ok) return []; const d = await r.json(); if (!d.result?.results?.length) return [];
        return d.result.results.map(x => ({ title: x.title || '', snippet: (x.notes || '').substring(0, 200), source: x.url || `https://catalog.data.gov/dataset/${x.name}`, year: x.metadata_created ? new Date(x.metadata_created).getFullYear() : null, citations: null, journal: x.organization?.title || 'US Government', authors: x.organization?.title || 'US Government', database: 'US Government (data.gov)' }));
    } catch (e) { return []; }
}

async function searchUKGov(query) {
    try {
        const r = await fetch(`${PRIMARY_SOURCE_APIS.ukGov.search}?q=${encodeURIComponent(query)}&count=3&filter_format=research-and-statistics,policy-paper`, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout) });
        if (!r.ok) return []; const d = await r.json(); if (!d.results?.length) return [];
        return d.results.map(x => ({ title: x.title || '', snippet: x.description || '', source: `https://www.gov.uk${x.link}`, year: x.public_timestamp ? new Date(x.public_timestamp).getFullYear() : null, citations: null, journal: x.organisations?.[0]?.title || 'UK Government', authors: x.organisations?.[0]?.title || 'UK Government', database: 'UK Government (gov.uk)' }));
    } catch (e) { return []; }
}

async function searchEUPublications(query) {
    try {
        const r = await fetch(`${PRIMARY_SOURCE_APIS.euPublications.searchAlt}?q=${encodeURIComponent(query)}&limit=3`, { signal: AbortSignal.timeout(SEARCH_CONFIG.timeout), headers: { 'Accept': 'application/json' } });
        if (!r.ok) return []; const d = await r.json(); const res = d.result?.results || d.results || []; if (!res.length) return [];
        return res.slice(0, 3).map(x => { const t = x.title?.en || x.title || ''; const desc = x.description?.en || x.description || ''; const pub = x.catalog?.publisher?.name || 'EU'; return { title: typeof t === 'string' ? t : 'EU Publication', snippet: (typeof desc === 'string' ? desc : '').substring(0, 200), source: x.access_url || x.landing_page || x.id || 'https://data.europa.eu', year: x.issued ? new Date(x.issued).getFullYear() : null, citations: null, journal: typeof pub === 'string' ? pub : 'EU', authors: typeof pub === 'string' ? pub : 'EU', database: 'EU Publications Office' }; });
    } catch (e) { return []; }
}

async function searchAllPrimarySources(query) {
    const results = await Promise.allSettled([searchSemanticScholar(query), searchOpenAlex(query), searchPubMed(query), searchUSGov(query), searchUKGov(query), searchEUPublications(query)]);
    let all = [];
    for (const r of results) { if (r.status === 'fulfilled' && r.value.length > 0) all = [...all, ...r.value]; }
    all.sort((a, b) => (b.citations || 0) - (a.citations || 0));
    return all;
}


// ============================================================
// COUNTER-ARGUMENT BUILDERS — Direct assertions, NO questions
// ============================================================

function buildDirectCounter(message, sources) {
    const msg = message.toLowerCase();
    const builders = [
        [/\b(research\s+shows|studies?\s+(show|prove)|data\s+(shows?|proves?)|evidence\s+(shows?|proves?))\b/i, 'empirical'],
        [/\b(should|ought|must|wrong\s+to|right\s+to|duty|obligation|immoral|unethical)\b/i, 'moral'],
        [/\b(government|policy|law|regulation|tax|ban|mandate|legislation)\b/i, 'policy'],
        [/\b(people\s+are|humans?\s+are|human\s+nature|we\s+are\s+(all|naturally)|innate|hardwired|evolved\s+to)\b/i, 'humanNature'],
        [/\b(technology|ai|automation|progress|innovation|digital|internet|algorithm)\b/i, 'technology'],
        [/\b(causes?|leads?\s+to|results?\s+in|creates?|produces?)\b/i, 'causal'],
        [/\b(all|every|always|never|no one|everyone|nobody)\b/i, 'absolute'],
        [/\b(natural|unnatural|nature\s+intended|meant\s+to\s+be)\b/i, 'nature'],
        [/\b(better|worse|superior|inferior|the best|the worst)\b/i, 'comparative'],
        [/\b(will|going\s+to|bound\s+to|inevitably|guaranteed)\b/i, 'predictive']
    ];
    for (const [pattern, type] of builders) {
        if (pattern.test(msg)) return COUNTERS[type]();
    }
    return COUNTERS.general();
}

    empirical: () => pick([
        `The research picture here is more nuanced than that framing suggests. Publication bias systematically inflates positive findings — studies that fail to confirm hypotheses rarely get published. The Open Science Collaboration's 2015 attempt to replicate 100 psychology studies found only 36% replicated successfully. The replication crisis applies unevenly across fields, but it should temper confidence in any single line of research. The evidence may point in this direction, but it hasn't settled the matter definitively.`,
        `It's worth noting that individual studies are data points, not conclusions. Meta-analyses frequently reveal contradictory findings across the literature — nutritional science, for instance, has reversed its position on eggs, dietary fat, and coffee multiple times over decades as different studies reached different results. Effect sizes are often smaller than headlines suggest, and confounding variables regularly go uncontrolled. The honest summary of most research areas is "it's complicated."`,
        `There's an important distinction between "a study found X" and "X is established fact" that often gets lost. Consider that the Lancet published Andrew Wakefield's vaccine-autism paper in 1998 — a peer-reviewed study that took 12 years to retract and caused enormous public health damage. A single study, or even a small body of literature, establishes a hypothesis worth investigating. It doesn't constitute settled science.`
    ]),
    moral: () => pick([
        `That's a reasonable ethical position, but it's worth recognizing that it operates within one of several internally consistent moral frameworks that reach different conclusions on this exact question. A utilitarian would evaluate this based on aggregate welfare outcomes, a deontologist on universal duties, and a virtue ethicist on character development. The death penalty illustrates this clearly: utilitarian arguments focus on deterrence data, deontological arguments on the right to life, and virtue ethics on what execution does to a society's character. Each framework is rigorous; none is self-evidently correct.`,
        `This moral claim deserves serious engagement, but it's also worth acknowledging its historical contingency. Consider that 150 years ago, the moral consensus in most Western nations held that women shouldn't vote and homosexuality was criminal. Those weren't fringe positions — they were the mainstream moral view of educated, thoughtful people. Your position may well be correct, but the confidence with which we hold moral views often outstrips our ability to justify them from first principles.`,
        `This is a prescriptive claim — a statement about what ought to be — but it's being presented with the certainty of a descriptive one. The challenge is that Hume's is-ought gap still applies: no amount of factual observation generates a moral obligation without moral premises. Both pro-choice and pro-life advocates, for instance, often agree on the biology of fetal development but reach opposite conclusions because they weight different values. The facts alone don't determine the conclusion.`
    ]),
    policy: () => pick([
        `The appeal of this policy is understandable, but every policy creates winners and losers — and the losers are typically less visible. Consider rent control: it's intuitively compassionate, yet economists across the political spectrum agree it reduces housing supply long-term. A 2019 Stanford study of San Francisco's rent control found it reduced rental housing supply by 15%. The gap between what a policy intends and what it actually produces is where most well-designed interventions fail.`,
        `This is a reasonable proposal, but implementation is consistently where policies encounter difficulty. Public choice theory (Buchanan & Tullock, 1962) demonstrates that policymakers respond to incentives, lobbying, and electoral pressures rather than acting as benevolent planners. The ACA's healthcare exchanges, for example, were designed to increase competition but ended up with a single insurer in many counties. The idealized version of any policy will be administered by institutions with their own constraints and agendas.`,
        `The reasoning here is sound in principle, but history offers specific cautionary examples. Prohibition (1920-1933) was designed to improve public health and reduce crime — it increased organized crime significantly instead. The War on Drugs aimed to reduce drug use — it produced mass incarceration without meaningfully reducing consumption. DARE programs seemed intuitively sensible — rigorous evaluation showed they had zero or negative effects. Intentions and outcomes frequently diverge.`
    ]),
    humanNature: () => pick([
        `That's an intuitive claim about human nature, but it's worth testing against the anthropological record. The !Kung San of the Kalahari, the Hadza of Tanzania, and the Piraha of the Amazon organize their societies in ways that contradict many Western assumptions about "natural" human behavior. If human nature were as fixed as this suggests, we wouldn't observe such significant cross-cultural variation. What feels innate is often what's been deeply conditioned over a lifetime.`,
        `This framing of human nature is common, but evolutionary psychology narratives often function as post-hoc explanations rather than predictive science. The claim that men are "naturally" more promiscuous, for instance, was treated as settled until researchers like Sarah Hrdy demonstrated equally strong evidence for female promiscuity across primate species. For most "natural" tendencies, there exist documented cultures where the opposite behavior predominates — suggesting plasticity rather than fixity.`,
        `Even accepting biological tendencies as real, the distinction between tendency and destiny is important. Humans override natural impulses routinely — that's essentially what civilization is. Homicide rates have declined approximately 95% over centuries (Pinker, 2011). We have evolutionary sugar cravings yet many people maintain healthy diets indefinitely. The existence of a biological tendency doesn't determine its inevitability or justify its expression.`
    ]),
    technology: () => pick([
        `The potential here is real, but technology's track record includes significant unintended consequences alongside its benefits. Social media was positioned as democratizing information — it also facilitated the Myanmar genocide (UN report, 2018), enabled mass disinformation campaigns, and correlates with measurable increases in teen depression (Haidt & Twenge, 2023). Every technology has costs that tend to emerge later than the benefits. Those costs deserve honest accounting.`,
        `This is a compelling narrative, but "progress" contains an embedded value judgment. Progress toward what, and measured by whom? The Green Revolution dramatically increased crop yields — and also destroyed soil microbiomes, created pesticide dependency, and displaced millions of small farmers. AI is increasing productivity — and concentrating wealth, eliminating middle-skill jobs, and enabling unprecedented surveillance. Neither framing captures the full picture.`,
        `The optimism here is understandable, but predictions about technology's benefits consistently undercount second-order effects. Uber was projected to reduce car ownership — it increased vehicle miles traveled by 84% in cities (UC Davis, 2020). Remote work technology was expected to improve work-life balance — it blurred boundaries and increased average working hours. The first-order benefits are typically real; the second and third-order effects frequently move in the opposite direction.`
    ]),
    causal: () => pick([
        `The connection you're drawing is plausible, but establishing causation requires more than correlation. Ice cream sales and drowning deaths are highly correlated because summer drives both. Countries with more televisions have lower birth rates — not because TVs prevent pregnancy, but because economic development drives both. Ruling out confounding variables is harder than it appears, and most observational claims haven't done that work rigorously.`,
        `This causal claim is reasonable on its face, but the actual research (where it exists) tends to reveal more complexity. The widely-cited claim that "social media causes teen depression," for instance, was investigated by Orben & Przybylski (2019), who found screen time explains approximately 0.4% of the variance in wellbeing — less than wearing glasses or eating potatoes. Causal narratives are often inflated relative to their actual measured effect sizes.`,
        `Even granting the causal link, the question of magnitude deserves attention. A factor can technically "cause" something while explaining only a tiny fraction of the total variance. Living near power lines is statistically associated with childhood leukemia — but the absolute risk increase is approximately 0.002%. Whether a causal relationship matters practically depends not just on its existence but on its size.`
    ]),
    absolute: () => pick([
        `Universal claims invite counterexamples, and counterexamples tend to be available. The assertion that something is "always" or "never" the case requires only one exception to collapse from a law into a tendency. People once claimed the sun always rises in the east (it doesn't at the poles), that mammals never lay eggs (platypuses do), and that democracies never fight each other (the War of 1812). A more qualified version of this claim would be both more accurate and more defensible.`,
        `There's a meaningful distinction between universals and tendencies. "Smoking always causes cancer" is false — many lifelong smokers never develop it. But "smoking substantially increases cancer risk" is well-established. The precise version of a claim is typically more defensible and more useful for decision-making than the absolute version. What would a more nuanced formulation look like here?`,
        `Even in physics, seemingly ironclad laws have boundary conditions — Newtonian mechanics breaks down at quantum scales, general relativity at singularities. Claims about human behavior, social systems, or policy are considerably less likely to hold universally than physical laws. The strongest version of this argument acknowledges its limitations rather than asserting universality.`
    ]),
    nature: () => pick([
        `The naturalistic framing has intuitive appeal, but it runs into specific counterexamples. Arsenic is natural. Smallpox is natural. Tsunamis are natural. Meanwhile, eyeglasses are unnatural, antibiotics are unnatural, and wheelchair ramps are unnatural. "Natural" doesn't map consistently onto "good" — which means naturalness can't be the basis for the argument. The real question is about outcomes: what produces wellbeing, reduces suffering, or serves human flourishing.`,
        `It's worth considering that the "natural" state of humanity involved approximately 50% child mortality, average lifespans around 35 years, and death from routine infections. Every significant improvement in human welfare — sanitation, medicine, agriculture, shelter — came from deliberately overriding natural conditions. If naturalness were the standard of value, we'd need to oppose virtually everything that makes modern life possible.`,
        `This argument conflates what exists in nature (a descriptive claim) with what should exist in society (a normative claim). Infanticide is practiced by many animal species — it's natural but not thereby moral. Monogamy is rare in nature — that observation doesn't settle whether it's beneficial for humans. The foundation for this argument needs to be something other than naturalness.`
    ]),
    comparative: () => pick([
        `Comparative claims always depend on unstated criteria, and the criteria matter enormously. The US healthcare system ranks highly by innovation metrics (most new drugs are developed there) but poorly by outcome metrics (lower life expectancy than 30 other countries despite 2x spending). Finland's education system excels by equity measures but not by elite-track metrics. The ranking changes based on what dimension you privilege — and that choice of dimension is where the real disagreement lies.`,
        `This comparison makes sense along certain dimensions, but by selecting different metrics, the ranking could easily reverse. Print books are inferior to e-readers for portability but superior for retention and comprehension (Delgado et al., 2018 meta-analysis). Cities score poorly for mental health but well for career opportunity. Most comparisons involve genuine tradeoffs that a simple "better/worse" assessment conceals rather than resolves.`,
        `The comparison here may be valid along the dimension you've chosen, but the things being compared likely involve tradeoffs between genuinely competing values. Is safety more important than freedom? Is efficiency more important than resilience? Is growth more important than sustainability? These aren't questions with objectively correct answers — they're value choices. The comparison only works within a particular framework, and frameworks differ.`
    ]),
    predictive: () => pick([
        `Forecasting complex systems has a well-documented failure rate. Philip Tetlock tracked 28,000 expert predictions over 20 years and found they were barely better than chance — with the most confident predictions performing worst. In 2007, virtually no mainstream economist predicted the 2008 financial crisis. In 2015, virtually no political analyst anticipated Trump's election. Confidence in a prediction is not correlated with its accuracy in any consistent way.`,
        `Extrapolation from current trends is the most common and most consistently unreliable form of prediction. In 1900, the biggest urban planning crisis was horse manure — experts predicted cities would be buried in it by 1930. In 1970, Paul Ehrlich predicted mass famine by 1980. In 2000, experts forecast peak oil within a decade. Trends plateau, reverse, and interact in ways that linear extrapolation cannot capture.`,
        `Complex adaptive systems resist prediction because they involve reflexivity — a forecast about the system changes behavior within the system, which alters the conditions that generated the forecast. This is why stock market predictions, political forecasts, and technology adoption timelines fail so reliably. The system adapts to the prediction itself. The appropriate posture toward the future is probabilistic, not deterministic.`
    ]),
    general: () => pick([
        `This position has clear reasoning behind it, but the strongest version of the opposing case would note that the assumptions underlying it are genuinely contestable. On most complex issues, rigorous experts exist on multiple sides — which suggests the evidence doesn't clearly favor any single conclusion. Your framing represents one valid perspective, but acknowledging the strength of competing perspectives would make the argument more robust.`,
        `This is a well-articulated position. The counter-case, however, would observe that the confidence level expressed here doesn't quite match the actual state of the evidence on this topic. Most complex questions involve more uncertainty, more "it depends," and more legitimate competing considerations than any single confident claim can accommodate. A more qualified version might actually be more persuasive to a critical audience.`,
        `The reasoning here is coherent, but it's worth noting that you're presenting one interpretation of a situation that admits multiple valid interpretations. The same underlying observations, weighted differently or viewed through a different analytical framework, support meaningfully different conclusions. The most rigorous thinking on this topic tends to be characterized by greater tentativeness — not from lack of expertise, but from awareness of complexity.`
    ])
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }


// ============================================================
// CONTRADICTION DETECTION
// ============================================================

function trackPosition(message) {
    if (message.length > 40) {
        debateContext.userPositions.push({ message, turn: conversationHistory.length });
    }
}

function detectContradiction(currentMessage) {
    if (debateContext.userPositions.length < 2) return null;
    const current = currentMessage.toLowerCase();
    const pairs = [
        [/\bi (love|like|enjoy|support)\b/, /\bi (hate|dislike|oppose|reject)\b/],
        [/\b(always|never)\b/, /\b(sometimes|occasionally|depends)\b/],
        [/\b(everyone|all people)\b/, /\b(not everyone|some people|few)\b/],
        [/\b(is (good|right|correct))\b/, /\b(is (bad|wrong|incorrect))\b/],
        [/\b(should|must)\b/, /\b(shouldn't|mustn't|don't need)\b/],
        [/\b(important|matters)\b/, /\b(unimportant|doesn't matter|trivial)\b/]
    ];
    for (const pos of debateContext.userPositions.slice(0, -1)) {
        const earlier = pos.message.toLowerCase();
        for (const [pA, pB] of pairs) {
            if ((pA.test(earlier) && pB.test(current)) || (pB.test(earlier) && pA.test(current))) {
                return pos.message;
            }
        }
    }
    return null;
}

// ============================================================
// FORMAT SOURCES INTO CITATION BLOCK
// ============================================================

function formatSourceBlock(sources) {
    if (!sources || sources.length === 0) return '';
    const seen = new Set();
    const unique = sources.filter(s => { if (!s.title || seen.has(s.title)) return false; seen.add(s.title); return true; });
    if (unique.length === 0) return '';
    let block = '\n\n--- Primary Sources ---\n';
    unique.slice(0, 6).forEach((s, i) => {
        const yr = s.year ? ` (${s.year})` : '';
        const cites = s.citations ? ` [${s.citations} citations]` : '';
        const auth = s.authors ? ` — ${s.authors}` : '';
        const jrnl = s.journal ? `, ${s.journal}` : '';
        block += `${i+1}. "${s.title}"${yr}${auth}${jrnl}${cites}\n   ${s.source}\n`;
    });
    return block;
}


// ============================================================
// UI & EVENT HANDLING
// ============================================================

function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    const body = document.createElement('div');
    body.className = 'msg-body';
    const urlRegex = /(https?:\/\/[^\s\)]+)/g;
    
    // Split into main content and source block
    const sourceIdx = text.indexOf('--- Primary Sources ---');
    const mainText = sourceIdx > -1 ? text.substring(0, sourceIdx).trim() : text;
    const sourceText = sourceIdx > -1 ? text.substring(sourceIdx) : '';
    
    mainText.split('\n\n').forEach(p => {
        const el = document.createElement('p');
        const parts = p.split(urlRegex);
        parts.forEach(part => {
            if (urlRegex.test(part)) {
                const a = document.createElement('a');
                a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer';
                a.textContent = 'source'; el.appendChild(a);
            } else { el.appendChild(document.createTextNode(part)); }
            urlRegex.lastIndex = 0;
        });
        body.appendChild(el);
    });
    
    // Source citation block (styled separately)
    if (sourceText) {
        const srcDiv = document.createElement('div');
        srcDiv.className = 'sources';
        const lines = sourceText.split('\n').filter(l => l.trim());
        lines.forEach(line => {
            if (line.startsWith('---')) return;
            const srcLine = document.createElement('div');
            const parts = line.split(urlRegex);
            parts.forEach(part => {
                if (urlRegex.test(part)) {
                    const a = document.createElement('a');
                    a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer';
                    a.textContent = 'link'; srcLine.appendChild(a);
                } else { srcLine.appendChild(document.createTextNode(part)); }
                urlRegex.lastIndex = 0;
            });
            srcDiv.appendChild(srcLine);
        });
        body.appendChild(srcDiv);
    }
    
    div.appendChild(body);
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTyping(text) {
    setStatus('Searching');
    const div = document.createElement('div');
    div.className = 'typing'; div.id = 'typingIndicator';
    div.innerHTML = `<span></span><span></span><span></span>${text ? `<span class="typing-label">${text}</span>` : ''}`;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTyping() {
    document.getElementById('typingIndicator')?.remove();
    setStatus('Ready');
}

function setStatus(text) {
    const el = document.getElementById('statusText');
    const dot = document.getElementById('statusDot');
    if (el) el.textContent = text;
    if (dot) {
        if (text === 'Ready') { dot.classList.remove('searching'); }
        else { dot.classList.add('searching'); }
    }
}

userInput.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
userInput.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inputForm.dispatchEvent(new Event('submit')); } });

// MAIN SUBMIT HANDLER
inputForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;
    
    addMessage(message, 'user');
    conversationHistory.push({ role: 'user', content: message });
    userInput.value = ''; userInput.style.height = 'auto';
    
    // Track position for contradiction detection
    trackPosition(message);
    
    // Check for contradictions first
    const contradiction = detectContradiction(message);
    if (contradiction) {
        showTyping('');
        await new Promise(r => setTimeout(r, 800));
        hideTyping();
        const resp = `You appear to be contradicting an earlier position. Previously you stated: "${contradiction.substring(0, 80)}..." — but your current claim moves in the opposite direction. That's worth acknowledging. If your thinking has evolved, I'd be interested to hear what changed. If not, these two positions need to be reconciled before either can stand on its own.`;
        addMessage(resp, 'senator');
        conversationHistory.push({ role: 'senator', content: resp });
        return;
    }
    
    // Detect URLs in the message — fetch and read them
    const urls = extractUrls(message);
    let fetchedContent = [];
    
    if (urls.length > 0) {
        showTyping('Reading your source...');
        fetchedContent = await fetchUserSources(urls);
    }
    
    // Search primary sources and build counter-argument
    const wordCount = message.split(/\s+/).length;
    if (wordCount >= 5 && SEARCH_CONFIG.enabled) {
        if (!urls.length) showTyping('Searching research databases...');
        else showTyping('Searching for counter-evidence...');
        
        try {
            const query = buildSearchQuery(stripUrls(message));
            const sources = await searchAllPrimarySources(query);
            hideTyping();
            
            // Build response using fetched content + searched sources
            let counter;
            if (fetchedContent.length > 0) {
                // User sent a source — read it, analyze it, argue against it with specifics
                counter = buildSourceRebuttal(message, fetchedContent, sources);
            } else {
                // No URL — use standard counter-argument with specific examples from sources
                counter = buildCounterWithExamples(message, sources);
            }
            
            // Append primary source citations
            if (sources.length > 0) {
                counter += formatSourceBlock(sources);
            }
            
            addMessage(counter, 'senator');
            conversationHistory.push({ role: 'senator', content: counter });
        } catch (err) {
            hideTyping();
            let counter;
            if (fetchedContent.length > 0) {
                counter = buildSourceRebuttal(message, fetchedContent, []);
            } else {
                counter = buildDirectCounter(message, []);
                counter += '\n\n(Source search encountered an error. Counter-argument based on logical principles.)';
            }
            addMessage(counter, 'senator');
            conversationHistory.push({ role: 'senator', content: counter });
        }
    } else {
        showTyping('');
        await new Promise(r => setTimeout(r, 600));
        hideTyping();
        let counter;
        if (fetchedContent.length > 0) {
            counter = buildSourceRebuttal(message, fetchedContent, []);
        } else {
            counter = buildDirectCounter(message, []);
        }
        addMessage(counter, 'senator');
        conversationHistory.push({ role: 'senator', content: counter });
    }
});

window.addEventListener('load', () => userInput.focus());


// ============================================================
// URL DETECTION & SOURCE FETCHING
// ============================================================

function extractUrls(text) {
    const urlRegex = /https?:\/\/[^\s\)\]\},]+/gi;
    return (text.match(urlRegex) || []).slice(0, 3); // Max 3 URLs
}

function stripUrls(text) {
    return text.replace(/https?:\/\/[^\s\)\]\},]+/gi, '').trim();
}

// Fetch and extract readable text from a URL
async function fetchUserSources(urls) {
    const results = [];
    for (const url of urls) {
        try {
            // Use a CORS proxy for cross-origin requests from the browser
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
            if (!response.ok) {
                // Try without proxy (same-origin or CORS-enabled)
                const direct = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (!direct.ok) { results.push({ url, content: null, error: 'Failed to fetch' }); continue; }
                const html = await direct.text();
                results.push({ url, content: extractTextFromHtml(html), error: null });
                continue;
            }
            const html = await response.text();
            results.push({ url, content: extractTextFromHtml(html), error: null });
        } catch (e) {
            results.push({ url, content: null, error: e.message });
        }
    }
    return results;
}

// Extract readable text from HTML
function extractTextFromHtml(html) {
    // Strip scripts, styles, and HTML tags
    let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    
    // Take the most substantial portion (skip very short or boilerplate content)
    // Return up to 3000 chars of meaningful content
    return text.substring(0, 3000);
}

// Extract key claims and data points from fetched content
function extractClaimsFromContent(content) {
    if (!content || content.length < 50) return [];
    
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 30);
    const claims = [];
    
    // Look for sentences with data, statistics, or strong claims
    const dataPatterns = [
        /\d+\s*%/,                           // Percentages
        /\d+\s*(million|billion|thousand)/i,  // Large numbers
        /\b(study|research|data|survey|found|showed|demonstrated|concluded)\b/i,
        /\b(increase|decrease|rise|fall|grew|declined|dropped)\b/i,
        /\b(according to|reported|published|estimated)\b/i,
        /\b(significant|substantial|majority|minority)\b/i
    ];
    
    for (const sentence of sentences) {
        let score = 0;
        for (const pattern of dataPatterns) {
            if (pattern.test(sentence)) score++;
        }
        if (score >= 1) {
            claims.push(sentence.trim());
        }
    }
    
    // Also grab the first few sentences as context
    const opening = sentences.slice(0, 3).map(s => s.trim());
    
    return { dataClaims: claims.slice(0, 8), context: opening };
}


// ============================================================
// SOURCE REBUTTAL — Read their source and argue against it specifically
// ============================================================

function buildSourceRebuttal(message, fetchedContent, searchedSources) {
    const successfulFetches = fetchedContent.filter(f => f.content && f.content.length > 50);
    
    if (successfulFetches.length === 0) {
        // Couldn't read the source
        const fallback = buildDirectCounter(stripUrls(message), searchedSources);
        return `I wasn't able to access the content at that URL — the site likely restricts automated requests. That said, here's my counter-argument based on the claim itself:\n\n${fallback}`;
    }
    
    // Analyze the fetched content
    const sourceContent = successfulFetches[0].content;
    const sourceUrl = successfulFetches[0].url;
    const { dataClaims, context } = extractClaimsFromContent(sourceContent);
    
    let response = `I've reviewed the source you shared (${sourceUrl}). Here's where I see weaknesses in its argument:\n\n`;
    
    if (dataClaims.length > 0) {
        // We found specific claims/data — argue against them directly
        response += `Specific points I'd challenge:\n\n`;
        
        // Pick 2-3 specific claims to rebut
        const toRebut = dataClaims.slice(0, 3);
        toRebut.forEach((claim, i) => {
            const rebuttal = generateSpecificRebuttal(claim);
            response += `${i + 1}. The source claims: "${claim.substring(0, 120)}${claim.length > 120 ? '...' : ''}"\n`;
            response += `   Counter: ${rebuttal}\n\n`;
        });
        
        // Add broader structural critique
        response += buildStructuralCritique(sourceContent, context);
    } else if (context.length > 0) {
        // No specific data claims found, but we have context
        response += `The central argument appears to be: "${context[0].substring(0, 150)}${context[0].length > 150 ? '...' : ''}"\n\nHere's where that reasoning breaks down:\n\n`;
        response += buildStructuralCritique(sourceContent, context);
    } else {
        // Very little content extracted
        response += `I was only able to extract limited content from this page. Based on what's available:\n\n`;
        response += buildDirectCounter(stripUrls(message), searchedSources);
    }
    
    // If we have counter-sources from our search, cite the best contradicting one
    if (searchedSources.length > 0) {
        const best = searchedSources[0];
        if (best.snippet && best.snippet.length > 30) {
            response += `\n\nCounter-evidence: "${best.title}" (${best.authors || best.database}, ${best.year || 'n.d.'}) states: "${best.snippet.substring(0, 180)}${best.snippet.length > 180 ? '...' : ''}"`;
            response += `\nSource: ${best.source}`;
        }
    }
    
    return response;
}

// Generate a specific rebuttal to a particular claim
function generateSpecificRebuttal(claim) {
    const c = claim.toLowerCase();
    
    // If it has percentage/stats — challenge the methodology
    if (/\d+\s*%/.test(c) || /\d+\s*(million|billion)/.test(c)) {
        return pick([
            `This statistic lacks context. Without knowing the sample size, methodology, time period, and population studied, a number is meaningless. Statistics can be constructed to support any narrative depending on how you frame the question and who you ask.`,
            `Numbers without methodology are rhetoric, not evidence. What was the sample? What was measured? What was excluded? How was the question framed? Different methodological choices produce wildly different numbers from the same underlying reality.`,
            `This figure likely comes from a single study or dataset. Competing studies using different methodologies have produced contradictory numbers. A single statistic is not a settled fact — it's one data point in a contested landscape.`
        ]);
    }
    
    // If it cites a study/research
    if (/\b(study|research|found|showed|demonstrated)\b/i.test(c)) {
        return pick([
            `Individual studies are data points, not conclusions. The replication crisis has demonstrated that many published findings — particularly in social sciences — fail to reproduce. Without meta-analytic confirmation across multiple independent labs, citing a single study proves nothing definitively.`,
            `This finding exists within a publication ecosystem that systematically favors positive results. Null findings go unpublished. Researchers are incentivized to produce significant results. The study you're citing may be part of a biased sample of the actual research landscape.`,
            `A study "finding" something is not the same as that thing being true. Methodological choices (sample selection, variable operationalization, statistical tests, control conditions) all shape outcomes. Different reasonable methodological choices might produce opposite findings.`
        ]);
    }
    
    // If it makes a causal claim
    if (/\b(causes?|leads?\s+to|results?\s+in|due\s+to|because)\b/i.test(c)) {
        return pick([
            `This causal claim hasn't been established — it's been asserted. Establishing causation requires randomized controlled experiments, not observational data. The observed correlation could be driven by confounding variables, reverse causation, or selection effects that this source hasn't ruled out.`,
            `The causal mechanism here is assumed, not demonstrated. Real-world causation is almost never as simple as A→B. There are mediators, moderators, feedback loops, and threshold effects that simple causal claims ignore entirely.`
        ]);
    }
    
    // If it makes a prediction
    if (/\b(will|going\s+to|projected|forecast|expect)\b/i.test(c)) {
        return pick([
            `This is a projection, not a fact. Projections depend on models, and models depend on assumptions that may not hold. History is full of authoritative projections that were spectacularly wrong because the underlying assumptions changed.`,
            `Forecasting complex systems has a well-documented failure rate. The confidence interval around this projection is likely far wider than presented. The source is giving you the point estimate while hiding the uncertainty.`
        ]);
    }
    
    // General rebuttal
    return pick([
        `This claim is stated as fact but is actually an interpretation. The same underlying data or observation can support multiple competing interpretations. This source has selected one and presented it as the only one.`,
        `This assertion relies on framing — the way the information is presented shapes the conclusion you draw. Reframe the same facts differently and you get a different picture. The source is doing interpretive work while pretending to be merely descriptive.`,
        `This is one perspective presented as the full picture. The source has made editorial choices about what to include, emphasize, and omit. Those choices shape the narrative more than the underlying facts do.`
    ]);
}

// Build a structural critique of the source overall
function buildStructuralCritique(content, context) {
    const c = content.toLowerCase();
    const critiques = [];
    
    // Check for balance
    if (!/(however|on the other hand|critics argue|opponents say|alternatively|conversely)/i.test(c)) {
        critiques.push(`The source presents a single perspective without engaging with counter-arguments or acknowledging limitations. This framing is characteristic of advocacy rather than analysis, and advocacy sources should be weighed with that context in mind.`);
    }
    
    // Check for sourcing
    if (!/(according to|study|research|data from|published in)/i.test(c)) {
        critiques.push(`The source makes substantive claims without citing primary evidence. Without verifiable data or references, these assertions amount to opinion — and opinion, regardless of how authoritatively presented, doesn't carry the weight of evidence.`);
    }
    
    // Check for hedging/certainty
    if (/(clearly|obviously|undeniably|without question|everyone knows|common sense)/i.test(c)) {
        critiques.push(`The source uses language of unqualified certainty — "clearly," "obviously," "undeniably." In practice, genuine expertise tends to involve careful qualification. When a source substitutes confidence for evidence, that's worth noting.`);
    }
    
    // Check for emotional language
    if (/(devastating|terrifying|shocking|outrageous|disgusting|alarming)/i.test(c)) {
        critiques.push(`The source relies on emotionally charged language — a technique designed to produce a visceral reaction rather than to inform. Well-supported evidence typically doesn't require emotional amplification to be persuasive.`);
    }
    
    if (critiques.length === 0) {
        critiques.push(`The source may be factually sound on individual points, but every piece of writing makes editorial choices about what to include, emphasize, and omit. Those choices shape the reader's conclusion at least as much as the underlying facts. A different set of equally valid editorial choices would produce a meaningfully different picture.`);
    }
    
    return critiques.slice(0, 2).join('\n\n');
}


// ============================================================
// COUNTER WITH SPECIFIC EXAMPLES — Uses source snippets as evidence
// ============================================================

function buildCounterWithExamples(message, sources) {
    // If we have sources with actual content, use their snippets as specific examples
    const sourcesWithContent = sources.filter(s => s.snippet && s.snippet.length > 50);
    
    if (sourcesWithContent.length >= 2) {
        // Build counter-argument citing specific findings from searched sources
        const base = buildDirectCounter(message, sources);
        
        let examples = '\n\nSpecific counter-evidence:';
        sourcesWithContent.slice(0, 3).forEach((s, i) => {
            const snippet = s.snippet.substring(0, 200);
            examples += `\n\n${i + 1}. ${s.title} (${s.authors || s.database}, ${s.year || 'n.d.'}): "${snippet}${s.snippet.length > 200 ? '...' : ''}"`;
        });
        
        return base + examples;
    }
    
    // Fallback to standard counter-argument
    return buildDirectCounter(message, sources);
}
