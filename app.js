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

const COUNTERS = {
    empirical: () => pick([
        `The research landscape is more complicated than you're presenting. Publication bias systematically inflates positive findings — studies that fail to confirm hypotheses rarely get published. The replication crisis has shown that up to 50% of published findings in some fields cannot be reproduced. Your confidence in "what the research shows" should be tempered by the systemic flaws in how research gets published and reported.`,
        `"Studies show" is not the conversation-ender you think it is. Individual studies are data points, not verdicts. Meta-analyses frequently reveal contradictory findings. Effect sizes are often smaller than headlines suggest, sample sizes inadequate, and confounding variables uncontrolled. The honest summary of most research topics is "it's complicated."`,
        `Your appeal to research conflates "a study found X" with "X is established fact." A single study establishes a hypothesis worth investigating, not a settled conclusion. The history of science is littered with "well-established" findings later overturned by better methodology.`
    ]),
    moral: () => pick([
        `Your moral framework isn't universal — it's one of many competing ethical systems, each internally consistent but reaching different conclusions. A utilitarian, a deontologist, and a virtue ethicist would each evaluate this differently. You're presenting one framework's conclusion as self-evident truth. It isn't.`,
        `Moral obligations don't exist in nature — they're constructed by societies to serve specific functions. The "should" you're invoking reflects a particular time, place, and culture. Many moral certainties of previous generations have been abandoned entirely. Your moral claim may look equally parochial to future generations.`,
        `You're making a prescriptive claim but treating it as descriptive. The gap between "is" and "ought" — Hume's guillotine — cannot be crossed by logic alone. No amount of factual observation can generate a moral obligation without moral premises that themselves need justification.`
    ]),
    policy: () => pick([
        `Every policy creates winners and losers — you've identified the winners and ignored the losers. The gap between policy intent and policy outcomes is massive and well-documented. Regulatory capture, perverse incentives, and unintended consequences reliably transform good-on-paper policies into real-world failures.`,
        `You're proposing a solution without establishing that the problem requires THIS solution or that implementation is feasible. Public choice theory demonstrates that policymakers operate with their own incentives and institutional constraints. Your idealized policy will be administered by imperfect humans in imperfect institutions.`,
        `History provides abundant evidence that policies with your stated goals have produced opposite outcomes. Rent control reduces housing supply. Prohibition increased organized crime. The War on Drugs increased incarceration without reducing drug use. Good intentions do not predict good outcomes.`
    ]),
    humanNature: () => pick([
        `Claims about "human nature" have historically served as post-hoc rationalizations for existing social arrangements. Every oppressive system — slavery, feudalism, patriarchy — was defended as "natural." Cross-cultural variation demonstrates that what feels like immutable nature is often deep cultural conditioning.`,
        `Evolutionary psychology narratives are largely unfalsifiable just-so stories that explain everything after the fact and predict nothing in advance. For every "natural" tendency you cite, cultures exist where the opposite behavior predominates. Behavioral plasticity is the actual finding of science.`,
        `Even granting biological tendencies, tendencies are not destinies. Civilization is precisely the project of overriding natural impulses. If "it's natural" were valid, medicine, agriculture, and every human institution would be indefensible.`
    ]),
    technology: () => pick([
        `Technology is never neutral — it embeds the values and biases of its creators while redistributing power in non-transparent ways. Every technological revolution has produced catastrophes alongside benefits: the printing press enabled propaganda, industrialization created ecological destruction, social media enabled mass manipulation.`,
        `"Progress" is a value judgment disguised as a description. It doesn't specify progress toward what goal, measured by whose standards, or at whose expense. The assumption that newer is better is an ideological position, not a neutral observation. Many local and traditional solutions outperform technological interventions.`,
        `The track record of technological optimism is poor. Predictions about technology's benefits routinely ignore distributional effects, displacement effects, and dependency effects. The honest accounting of any technology must include its full cost structure.`
    ]),
    causal: () => pick([
        `Correlation is not causation. Causal inference requires controlling for confounders, establishing temporal precedence, eliminating reverse causation, and demonstrating mechanism. Your observational claim almost certainly reflects selective attention to confirming cases while ignoring disconfirming ones.`,
        `The causal relationship you're asserting is almost certainly more complex than a simple A causes B model. Real-world causation involves feedback loops, mediating variables, and threshold effects. Simple causal narratives are psychologically satisfying but empirically inadequate.`,
        `Even if the causal relationship exists, magnitude matters enormously. A factor can "cause" something while explaining only 2% of the variance — technically true but practically meaningless for decision-making.`
    ]),
    absolute: () => pick([
        `Absolute claims are empirically indefensible. "Always," "never," "all," and "none" are the vocabulary of ideology, not evidence. Reality operates in distributions. The moment a single counterexample exists — and one always does — your universal claim collapses into a tendency requiring entirely different justification.`,
        `You're stating a universal where the evidence supports only a tendency. This is the difference between a law and a pattern, a certainty and a probability. By overstating your case, you've made it trivially easy to refute with a single counterexample.`,
        `Absolutism in argument signals that emotional conviction has outrun evidential support. The world is characterized by exceptions and context-dependency. Anyone claiming something is "always" or "never" the case is either ignorant of counterexamples or choosing to ignore them.`
    ]),
    nature: () => pick([
        `The naturalistic fallacy: inferring what ought to be from what is. Nature is amoral — it produces both cooperation and predation, nurturing and infanticide. Selecting "natural" phenomena that support your conclusion while ignoring others is cherry-picking in evolutionary clothing.`,
        `"Natural" is an empty category for moral reasoning. Diseases are natural. Earthquakes are natural. The entire project of civilization is systematically overriding natural conditions. If you wouldn't use "it's natural" to defend tuberculosis, you can't selectively apply it here.`,
        `Appeals to nature commit a basic error: confusing the descriptive with the normative. Evolution is descriptive biology, not prescriptive ethics. We don't derive legal systems or moral codes from nature — we construct them deliberately.`
    ]),
    comparative: () => pick([
        `Every comparative claim conceals unstated criteria. "Better" doesn't specify the measure, the beneficiary, or the time horizon. Every ranking reflects a value system. Your comparative claim is only as strong as your justification for the criteria — and that justification is absent.`,
        `By selectively choosing metrics, you can make almost anything appear superior. The question isn't whether X outperforms Y on your chosen dimension — it's whether your chosen dimension is the right one, and why we should privilege it over dimensions where Y outperforms X.`,
        `You're comparing across incommensurable values. The things you're ranking involve genuine tradeoffs between competing goods. Calling one "better" flattens the tradeoff into a false hierarchy.`
    ]),
    predictive: () => pick([
        `Predictions about complex systems have a dismal track record. Tetlock's research shows expert predictions about social and political outcomes are barely better than chance — and confident predictions are often worse. Your prediction reflects confidence, not knowledge.`,
        `You're extrapolating from current trends, but trends reverse, plateau, and interact unpredictably. The history of futurism is a graveyard of confident predictions: flying cars by 2000, paperless offices by 1990. Base rates for prediction accuracy should make you humble.`,
        `Predicting outcomes in complex adaptive systems is fundamentally different from predicting mechanical systems. These systems involve human agency, reflexivity, and sensitivity to initial conditions. Confident prediction here isn't bold — it's epistemically reckless.`
    ]),
    general: () => pick([
        `Your claim rests on assumptions that are contestable, evidence that is incomplete, and reasoning that skips steps. The opposing position holds that what you're asserting is at best partially true, applies only under conditions you haven't specified, and carries implications you haven't acknowledged.`,
        `The confidence with which you've stated this is inversely proportional to the evidence supporting it. Complex claims about complex systems require epistemic humility — the acknowledgment that you might be wrong, your sources might be biased, and your framing might be one of many valid ones.`,
        `You're treating a contested claim as settled, a perspective as a fact, or an interpretation as the only possible reading. The most rigorous thinkers on this topic disagree with each other — which means your certainty is unwarranted.`
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
        const resp = `You're contradicting yourself. Earlier you said: "${contradiction.substring(0, 80)}..." — but now you're arguing the opposite. You can't have it both ways. Pick a position and defend it consistently, or acknowledge that your thinking has evolved. Inconsistency is the most exploitable weakness in any argument.`;
        addMessage(resp, 'senator');
        conversationHistory.push({ role: 'senator', content: resp });
        return;
    }
    
    // Search primary sources and build counter-argument simultaneously
    const wordCount = message.split(/\s+/).length;
    if (wordCount >= 5 && SEARCH_CONFIG.enabled) {
        showTyping('Searching research databases...');
        try {
            const query = buildSearchQuery(message);
            const sources = await searchAllPrimarySources(query);
            hideTyping();
            
            // Build direct counter-argument (NO questions)
            let counter = buildDirectCounter(message, sources);
            
            // Append primary source citations
            if (sources.length > 0) {
                counter += formatSourceBlock(sources);
            } else {
                counter += '\n\n(No relevant primary sources found for this specific claim. The above counter-argument is based on established logical and rhetorical principles.)';
            }
            
            addMessage(counter, 'senator');
            conversationHistory.push({ role: 'senator', content: counter });
        } catch (err) {
            hideTyping();
            const counter = buildDirectCounter(message, []);
            counter += '\n\n(Source search encountered an error. Counter-argument based on logical principles.)';
            addMessage(counter, 'senator');
            conversationHistory.push({ role: 'senator', content: counter });
        }
    } else {
        showTyping('');
        await new Promise(r => setTimeout(r, 600));
        hideTyping();
        const counter = buildDirectCounter(message, []);
        addMessage(counter, 'senator');
        conversationHistory.push({ role: 'senator', content: counter });
    }
});

window.addEventListener('load', () => userInput.focus());
