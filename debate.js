// debate.js — Debate Arena JavaScript for Senator App

// DOM References
const advocateFeed = document.getElementById('advocateFeed');
const senatorFeed = document.getElementById('senatorFeed');
const debateForm = document.getElementById('debateForm');
const debateInput = document.getElementById('debateInput');
const debateControls = document.getElementById('debateControls');
const debateStatus = document.getElementById('debateStatus');
const roundLabel = document.getElementById('roundLabel');
const summaryPanel = document.getElementById('summaryPanel');
const summaryContent = document.getElementById('summaryContent');
const summaryStatus = document.getElementById('summaryStatus');
const stopDebateBtn = document.getElementById('stopDebateBtn');
const debateBtn = document.getElementById('debateBtn');

// Configuration
const DEBATE_CONFIG = {
  maxRounds: 4,
  searchTimeout: 10000,
  delayBetweenTurns: 1200
};

// Debate State
const debateState = {
  active: false,
  round: 0,
  userClaim: '',
  advocateArguments: [],
  senatorArguments: [],
  advocateEvidence: [],
  senatorEvidence: [],
  stopped: false
};

// --- Helper Functions ---

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function esc(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function extractKeywords(text) {
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been',
    'being','have','has','had','do','does','did','will','would','could','should',
    'may','might','shall','can','need','dare','ought','used','to','of','in','for',
    'on','with','at','by','from','as','into','through','during','before','after',
    'above','below','between','out','off','over','under','again','further','then',
    'once','that','this','these','those','it','its','and','but','or','nor','not']);
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
}


function topicOverlap(a, b) {
  const keywordsA = extractKeywords(a);
  const keywordsB = extractKeywords(b);
  if (keywordsA.length === 0 || keywordsB.length === 0) return 0;
  const setB = new Set(keywordsB);
  const overlap = keywordsA.filter(k => setB.has(k)).length;
  return overlap / Math.max(keywordsA.length, keywordsB.length);
}

function buildSearchQuery(message) {
  const keywords = extractKeywords(message);
  return keywords.slice(0, 5).join(' ');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addToFeed(feed, text, round) {
  const entry = document.createElement('div');
  entry.className = 'feed-entry';
  if (round !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'round-badge';
    badge.textContent = 'Round ' + round;
    entry.appendChild(badge);
  }
  const content = document.createElement('p');
  content.innerHTML = text;
  entry.appendChild(content);
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

function updateStatus(text) {
  if (debateStatus) debateStatus.textContent = text;
}

function showTyping(feed) {
  const typing = document.createElement('div');
  typing.className = 'typing-indicator';
  typing.id = 'typing-' + (feed === advocateFeed ? 'advocate' : 'senator');
  typing.textContent = 'Thinking...';
  feed.appendChild(typing);
  feed.scrollTop = feed.scrollHeight;
}

function hideTyping(feed) {
  const id = 'typing-' + (feed === advocateFeed ? 'advocate' : 'senator');
  const el = document.getElementById(id);
  if (el) el.remove();
}


// --- Source Search APIs ---

async function searchSemanticScholar(query) {
  const url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' +
    encodeURIComponent(query) +
    '&fields=title,abstract,year,citationCount,authors,url,tldr&limit=5';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEBATE_CONFIG.searchTimeout);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.data || []).map(paper => ({
      title: paper.title || '',
      snippet: (paper.tldr && paper.tldr.text) || paper.abstract || '',
      year: paper.year || null,
      citations: paper.citationCount || 0,
      authors: (paper.authors || []).map(a => a.name).join(', '),
      url: paper.url || '',
      source: 'Semantic Scholar'
    }));
  } catch (e) {
    clearTimeout(timeout);
    return [];
  }
}

async function searchOpenAlex(query) {
  const url = 'https://api.openalex.org/works?search=' +
    encodeURIComponent(query) + '&per_page=5';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEBATE_CONFIG.searchTimeout);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || []).map(work => ({
      title: work.title || work.display_name || '',
      snippet: work.abstract_inverted_index
        ? Object.keys(work.abstract_inverted_index).slice(0, 50).join(' ')
        : '',
      year: work.publication_year || null,
      citations: work.cited_by_count || 0,
      authors: (work.authorships || []).map(a => a.author && a.author.display_name).filter(Boolean).join(', '),
      url: work.doi ? ('https://doi.org/' + work.doi.replace('https://doi.org/', '')) : (work.id || ''),
      source: 'OpenAlex'
    }));
  } catch (e) {
    clearTimeout(timeout);
    return [];
  }
}

async function searchSources(query) {
  const results = await Promise.allSettled([
    searchSemanticScholar(query),
    searchOpenAlex(query)
  ]);
  const sources = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      sources.push(...result.value);
    }
  }
  return sources;
}


// --- Source Analysis ---

function analyzeSourceContent(source) {
  const text = source.snippet || '';
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);

  const findings = sentences.filter(s =>
    /\b(found|showed|demonstrated|revealed|indicated|confirmed|established)\b/i.test(s)
  );

  const numbers = sentences.filter(s =>
    /(\d+%|\d+\.\d+|\b\d{2,}\b)/.test(s)
  );

  const limitations = sentences.filter(s =>
    /\b(however|although|limitation|caveat|nonetheless|despite|drawback|concern)\b/i.test(s)
  );

  const methodology = [];
  if (/\b(randomized|randomised)\b/i.test(text)) methodology.push('randomized');
  if (/\bmeta-analysis\b/i.test(text)) methodology.push('meta-analysis');
  if (/\blongitudinal\b/i.test(text)) methodology.push('longitudinal');
  if (/\bcohort\b/i.test(text)) methodology.push('cohort');
  if (/\bsystematic review\b/i.test(text)) methodology.push('systematic review');

  return { findings, numbers, limitations, methodology };
}

// --- Evidence Logging ---

function logEvidence(side, entry) {
  if (side === 'advocate') {
    debateState.advocateEvidence.push(entry);
  } else {
    debateState.senatorEvidence.push(entry);
  }
}


// --- Advocate Bot ---

function advocateArgue(userClaim, round, senatorLastArg, sources) {
  if (round === 1) {
    return advocateOpening(userClaim, sources);
  }
  return advocateRebuttal(userClaim, round, senatorLastArg, sources);
}

function advocateOpening(userClaim, sources) {
  const usable = sources.filter(s => s.snippet && s.snippet.length > 20);
  if (usable.length === 0) {
    return 'I\'d like to defend the claim that "' + esc(userClaim) +
      '". While I\'m still gathering academic sources, the underlying reasoning supports this position. Let me build the case as more evidence becomes available.';
  }

  let argument = 'I\'m here to defend the claim: "' + esc(userClaim) + '". Let me present the evidence.\n\n';
  const cited = usable.slice(0, 3);
  cited.forEach((src, i) => {
    const analysis = analyzeSourceContent(src);
    const dataPoint = analysis.findings.length > 0
      ? analysis.findings[0]
      : (analysis.numbers.length > 0 ? analysis.numbers[0] : src.snippet.slice(0, 120));

    argument += '<strong>Evidence ' + (i + 1) + ':</strong> ' + esc(dataPoint) + ' ';
    argument += '<em>(' + esc(src.title) + ', ' + (src.year || 'n.d.') + ')</em>\n\n';

    logEvidence('advocate', {
      claim: dataPoint,
      sourceData: src.snippet.slice(0, 200),
      sourceTitle: src.title,
      sourceAuthors: src.authors,
      sourceYear: src.year,
      sourceUrl: src.url,
      keywords: extractKeywords(dataPoint)
    });
  });

  argument += 'The academic literature consistently supports this position. I look forward to hearing the counterarguments.';
  return argument;
}

function advocateRebuttal(userClaim, round, senatorLastArg, sources) {
  const usable = sources.filter(s => s.snippet && s.snippet.length > 20);
  let argument = '<strong>Rebuttal (Round ' + round + '):</strong> ';

  if (senatorLastArg) {
    argument += 'My colleague raises interesting points, but the evidence tells a different story.\n\n';
  }

  if (usable.length > 0) {
    const src = usable[0];
    const analysis = analyzeSourceContent(src);
    const dataPoint = analysis.findings.length > 0
      ? analysis.findings[0]
      : (analysis.numbers.length > 0 ? analysis.numbers[0] : src.snippet.slice(0, 120));

    argument += 'Fresh evidence strengthens my case: ' + esc(dataPoint) + ' ';
    argument += '<em>(' + esc(src.title) + ', ' + (src.year || 'n.d.') + ')</em>\n\n';

    logEvidence('advocate', {
      claim: dataPoint,
      sourceData: src.snippet.slice(0, 200),
      sourceTitle: src.title,
      sourceAuthors: src.authors,
      sourceYear: src.year,
      sourceUrl: src.url,
      keywords: extractKeywords(dataPoint)
    });
  }

  argument += 'The weight of evidence continues to favor the original claim.';
  return argument;
}


// --- Senator Bot ---

function senatorArgue(userClaim, round, advocateLastArg, sources) {
  if (round === 1) {
    return senatorOpening(userClaim, sources);
  }
  return senatorRebuttal(userClaim, round, advocateLastArg, sources);
}

function senatorOpening(userClaim, sources) {
  const usable = sources.filter(s => s.snippet && s.snippet.length > 20);

  let argument = 'I appreciate the claim, but let me offer a rigorous challenge to: "' + esc(userClaim) + '".\n\n';

  if (usable.length === 0) {
    argument += 'While the Advocate presents their case, we should consider that many popular claims lack robust empirical support. Extraordinary claims require extraordinary evidence.';
    return argument;
  }

  const cited = usable.slice(0, 3);
  cited.forEach((src, i) => {
    const analysis = analyzeSourceContent(src);
    const counterPoint = analysis.limitations.length > 0
      ? analysis.limitations[0]
      : (analysis.findings.length > 0
        ? 'While research notes: ' + analysis.findings[0] + ' — we must consider the limitations'
        : 'The evidence from this source is inconclusive at best');

    argument += '<strong>Challenge ' + (i + 1) + ':</strong> ' + esc(counterPoint) + ' ';
    argument += '<em>(' + esc(src.title) + ', ' + (src.year || 'n.d.') + ')</em>\n\n';

    logEvidence('senator', {
      claim: counterPoint,
      sourceData: src.snippet.slice(0, 200),
      sourceTitle: src.title,
      sourceAuthors: src.authors,
      sourceYear: src.year,
      sourceUrl: src.url,
      keywords: extractKeywords(counterPoint)
    });
  });

  argument += 'The claim deserves more scrutiny before we accept it as established fact.';
  return argument;
}

function senatorRebuttal(userClaim, round, advocateLastArg, sources) {
  const usable = sources.filter(s => s.snippet && s.snippet.length > 20);
  let argument = '<strong>Counter (Round ' + round + '):</strong> ';

  if (advocateLastArg) {
    argument += 'The Advocate\'s latest evidence is noted, but let me address it directly.\n\n';
  }

  if (usable.length > 0) {
    const src = usable[0];
    const analysis = analyzeSourceContent(src);
    const counterPoint = analysis.limitations.length > 0
      ? analysis.limitations[0]
      : (analysis.numbers.length > 0
        ? 'The data actually shows: ' + analysis.numbers[0]
        : 'Further examination reveals gaps in this argument');

    argument += 'Consider this counter-evidence: ' + esc(counterPoint) + ' ';
    argument += '<em>(' + esc(src.title) + ', ' + (src.year || 'n.d.') + ')</em>\n\n';

    logEvidence('senator', {
      claim: counterPoint,
      sourceData: src.snippet.slice(0, 200),
      sourceTitle: src.title,
      sourceAuthors: src.authors,
      sourceYear: src.year,
      sourceUrl: src.url,
      keywords: extractKeywords(counterPoint)
    });
  }

  argument += 'We must remain skeptical and demand higher standards of proof.';
  return argument;
}


// --- Debate Engine ---

async function startDebate(userClaim) {
  try {
    // Reset state
    debateState.active = true;
    debateState.round = 0;
    debateState.userClaim = userClaim;
    debateState.advocateArguments = [];
    debateState.senatorArguments = [];
    debateState.advocateEvidence = [];
    debateState.senatorEvidence = [];
    debateState.stopped = false;

    // Clear feeds
    if (advocateFeed) advocateFeed.innerHTML = '';
    if (senatorFeed) senatorFeed.innerHTML = '';
    if (summaryPanel) summaryPanel.style.display = 'none';
    if (debateControls) debateControls.style.display = 'block';

    updateStatus('Searching for academic sources...');

    // Search for sources
    const query = buildSearchQuery(userClaim) || userClaim.slice(0, 60);
    const allSources = await searchSources(query);

    // Split sources between bots
    const mid = Math.ceil(allSources.length / 2);
    const advocateSources = allSources.slice(0, mid);
    const senatorSources = allSources.slice(mid);

    updateStatus('Debate in progress...');

    // Run debate rounds
    for (let round = 1; round <= DEBATE_CONFIG.maxRounds; round++) {
      if (debateState.stopped) break;

      debateState.round = round;
      if (roundLabel) roundLabel.textContent = 'Round ' + round + ' of ' + DEBATE_CONFIG.maxRounds;

      // Advocate's turn
      showTyping(advocateFeed);
      await delay(DEBATE_CONFIG.delayBetweenTurns);
      hideTyping(advocateFeed);

      if (debateState.stopped) break;

      const senatorLast = debateState.senatorArguments.length > 0
        ? debateState.senatorArguments[debateState.senatorArguments.length - 1]
        : null;

      // Search for fresh sources on rebuttals
      let roundAdvocateSources = advocateSources;
      if (round > 1 && senatorLast) {
        const freshQuery = buildSearchQuery(senatorLast);
        if (freshQuery) {
          const fresh = await searchSources(freshQuery);
          if (fresh.length > 0) roundAdvocateSources = fresh;
        }
      }

      const advocateArg = advocateArgue(userClaim, round, senatorLast, roundAdvocateSources);
      debateState.advocateArguments.push(advocateArg);
      addToFeed(advocateFeed, advocateArg, round);

      if (debateState.stopped) break;
      await delay(DEBATE_CONFIG.delayBetweenTurns);

      // Senator's turn
      showTyping(senatorFeed);
      await delay(DEBATE_CONFIG.delayBetweenTurns);
      hideTyping(senatorFeed);

      if (debateState.stopped) break;

      const advocateLast = debateState.advocateArguments[debateState.advocateArguments.length - 1];

      let roundSenatorSources = senatorSources;
      if (round > 1 && advocateLast) {
        const freshQuery = buildSearchQuery(advocateLast);
        if (freshQuery) {
          const fresh = await searchSources(freshQuery);
          if (fresh.length > 0) roundSenatorSources = fresh;
        }
      }

      const senatorArg = senatorArgue(userClaim, round, advocateLast, roundSenatorSources);
      debateState.senatorArguments.push(senatorArg);
      addToFeed(senatorFeed, senatorArg, round);

      if (debateState.stopped) break;
      await delay(DEBATE_CONFIG.delayBetweenTurns);
    }

    // Debate complete
    debateState.active = false;
    updateStatus(debateState.stopped ? 'Debate stopped early.' : 'Debate complete. Generating summary...');

    generateSummary(userClaim, debateState, allSources);

  } catch (err) {
    debateState.active = false;
    updateStatus('An error occurred during the debate.');
    if (summaryContent) {
      summaryContent.innerHTML = '<div class="error-message">An error occurred: ' + esc(err.message) + '</div>';
    }
    if (summaryPanel) summaryPanel.style.display = 'block';
  }
}


// --- Summary Generation ---

function generateSummary(userClaim, state, sources) {
  const advocateEvidence = state.advocateEvidence;
  const senatorEvidence = state.senatorEvidence;

  // Cross-reference: find which advocate claims were countered by senator
  const crossReferenced = advocateEvidence.map(advClaim => {
    const countered = senatorEvidence.find(senClaim =>
      topicOverlap(advClaim.claim, senClaim.claim) > 0.2
    );
    return {
      ...advClaim,
      side: 'advocate',
      countered: countered || null,
      counterData: countered ? countered.sourceData : null,
      counterSource: countered ? countered.sourceTitle : null,
      counterAuthors: countered ? countered.sourceAuthors : null
    };
  });

  // Also check senator claims that weren't matched
  const senatorOnly = senatorEvidence.filter(senClaim => {
    return !advocateEvidence.some(advClaim =>
      topicOverlap(advClaim.claim, senClaim.claim) > 0.2
    );
  }).map(claim => ({
    ...claim,
    side: 'senator',
    countered: null,
    counterData: null,
    counterSource: null,
    counterAuthors: null
  }));

  let allClaims = [...crossReferenced, ...senatorOnly];

  // Fallback: extract claims from debate text if no structured evidence
  if (allClaims.length === 0) {
    const allArgs = [...state.advocateArguments, ...state.senatorArguments];
    allArgs.forEach(arg => {
      const stripped = arg.replace(/<[^>]+>/g, '');
      const sentences = stripped.split(/[.!?]+/).filter(s => s.trim().length > 30);
      sentences.slice(0, 2).forEach(sentence => {
        allClaims.push({
          claim: sentence.trim(),
          side: 'general',
          sourceData: null,
          sourceTitle: 'Debate transcript',
          sourceAuthors: '',
          sourceYear: null,
          sourceUrl: '',
          keywords: extractKeywords(sentence),
          countered: null,
          counterData: null,
          counterSource: null,
          counterAuthors: null
        });
      });
    });
  }

  renderSummary(userClaim, allClaims);
}


// --- Rendering ---

function renderSummary(userClaim, claims) {
  if (!summaryPanel || !summaryContent) return;

  const validated = claims.filter(c => c.side === 'advocate' && !c.countered);
  const refuted = claims.filter(c => c.countered);
  const challenged = claims.filter(c => c.side === 'senator');

  let html = '<h3>Debate Summary</h3>';
  html += '<p class="summary-claim">Claim: "' + esc(userClaim) + '"</p>';

  if (validated.length > 0) {
    html += '<div class="claim-group"><h4>Supported Claims</h4>';
    validated.forEach(c => { html += createClaimCard(c); });
    html += '</div>';
  }

  if (refuted.length > 0) {
    html += '<div class="claim-group"><h4>Contested Claims</h4>';
    refuted.forEach(c => { html += createClaimCard(c); });
    html += '</div>';
  }

  if (challenged.length > 0) {
    html += '<div class="claim-group"><h4>Counter-Arguments Raised</h4>';
    challenged.forEach(c => { html += createClaimCard(c); });
    html += '</div>';
  }

  // Verdict
  const totalAdvocate = validated.length + refuted.length;
  const totalRefuted = refuted.length;
  let verdict;
  if (totalAdvocate === 0) {
    verdict = 'Insufficient evidence was presented to reach a conclusion.';
  } else if (totalRefuted === 0) {
    verdict = 'The claim appears well-supported. No evidence was successfully countered.';
  } else if (totalRefuted < totalAdvocate / 2) {
    verdict = 'The claim is mostly supported, though some points were contested.';
  } else {
    verdict = 'The claim faces significant challenges. Both sides presented compelling evidence.';
  }

  html += '<div class="verdict"><strong>Verdict:</strong> ' + esc(verdict) + '</div>';

  summaryContent.innerHTML = html;
  summaryPanel.style.display = 'block';
  if (summaryStatus) summaryStatus.textContent = 'Summary generated';
}

function createClaimCard(claim) {
  let card = '<div class="claim-card">';
  card += '<p class="claim-text">' + esc(claim.claim) + '</p>';

  if (claim.sourceData) {
    card += '<div class="claim-evidence">';
    card += '<span class="evidence-label">Evidence from source:</span> ';
    card += '<span class="evidence-data">' + esc(claim.sourceData.slice(0, 150)) + '</span>';
    card += '<span class="evidence-attribution"> — ' + esc(claim.sourceTitle || 'Unknown');
    if (claim.sourceAuthors) card += ' (' + esc(claim.sourceAuthors) + ')';
    if (claim.sourceYear) card += ', ' + claim.sourceYear;
    card += '</span>';
    card += '</div>';
  }

  if (claim.counterData) {
    card += '<div class="claim-counter">';
    card += '<span class="counter-label">Countered by:</span> ';
    card += '<span class="counter-data">' + esc(claim.counterData.slice(0, 150)) + '</span>';
    card += '<span class="counter-attribution"> — ' + esc(claim.counterSource || 'Unknown');
    if (claim.counterAuthors) card += ' (' + esc(claim.counterAuthors) + ')';
    card += '</span>';
    card += '</div>';
  }

  if (claim.sourceUrl) {
    card += '<a class="source-link" href="' + esc(claim.sourceUrl) + '" target="_blank" rel="noopener">View Source</a>';
  }

  card += '</div>';
  return card;
}


// --- Event Listeners ---

if (debateForm) {
  debateForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const claim = debateInput ? debateInput.value.trim() : '';
    if (!claim || debateState.active) return;
    startDebate(claim);
  });
}

if (stopDebateBtn) {
  stopDebateBtn.addEventListener('click', function() {
    debateState.stopped = true;
    updateStatus('Stopping debate...');
  });
}

if (debateInput) {
  debateInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });
}
