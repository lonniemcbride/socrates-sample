// Senator - Debate Arena
// Council + Senator bots. Unlimited rounds. Bots analyze source content.

(function () {
  'use strict';

  var councilFeed = document.getElementById('councilFeed');
  var senatorFeed = document.getElementById('senatorFeed');
  var summaryPanel = document.getElementById('summaryPanel');
  var summaryStatus = document.getElementById('summaryStatus');
  var summaryContent = document.getElementById('summaryContent');
  var debateForm = document.getElementById('debateForm');
  var debateInput = document.getElementById('debateInput');
  var debateBtn = document.getElementById('debateBtn');
  var debateControls = document.getElementById('debateControls');
  var debateStatus = document.getElementById('debateStatus');
  var stopDebateBtn = document.getElementById('stopDebateBtn');
  var roundNumber = document.getElementById('roundNumber');

  var isDebating = false;
  var shouldStop = false;
  var evidenceLog = [];
  var currentRound = 0;
  // NO fixed round limit — debate continues until user clicks Stop

  function logEvidence(entry) {
    evidenceLog.push({
      round: currentRound,
      side: entry.side,
      claim: entry.claim,
      sourceUrl: entry.sourceUrl || '',
      sourceTitle: entry.sourceTitle || '',
      sourceAuthors: entry.sourceAuthors || '',
      sourceYear: entry.sourceYear || null,
      // FULL text — never truncated
      findings: entry.findings || '',
      data: entry.data || '',
      limitations: entry.limitations || '',
      fullAbstract: entry.fullAbstract || ''
    });
  }

  // CORS proxy for cross-origin API requests from GitHub Pages
  var CORS_PROXY = 'https://api.allorigins.win/raw?url=';

  // --- Source Search ---
  async function searchSemanticScholar(query) {
    try {
      var apiUrl = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' +
        encodeURIComponent(query.substring(0, 200)) +
        '&limit=5&fields=title,abstract,year,authors,citationCount,url';
      var resp = await fetch(CORS_PROXY + encodeURIComponent(apiUrl));
      if (!resp.ok) return [];
      var data = await resp.json();
      if (!data.data) return [];
      return data.data.map(function (p) {
        return {
          title: p.title || '',
          abstract: p.abstract || '',
          year: p.year || null,
          authors: p.authors ? p.authors.map(function (a) { return a.name; }).join(', ') : '',
          citations: p.citationCount || 0,
          url: p.url || ''
        };
      });
    } catch (e) { return []; }
  }

  async function searchOpenAlex(query) {
    try {
      var apiUrl = 'https://api.openalex.org/works?search=' +
        encodeURIComponent(query.substring(0, 200)) +
        '&per_page=5&select=id,title,abstract_inverted_index,publication_year,authorships,cited_by_count,doi';
      var resp = await fetch(CORS_PROXY + encodeURIComponent(apiUrl));
      if (!resp.ok) return [];
      var data = await resp.json();
      if (!data.results) return [];
      return data.results.map(function (w) {
        var abstract = '';
        if (w.abstract_inverted_index) {
          var words = [];
          Object.entries(w.abstract_inverted_index).forEach(function (entry) {
            entry[1].forEach(function (pos) { words[pos] = entry[0]; });
          });
          abstract = words.join(' ');
        }
        var authors = w.authorships ? w.authorships.slice(0, 3).map(function (a) {
          return a.author ? a.author.display_name : '';
        }).filter(Boolean).join(', ') : '';
        return {
          title: w.title || '',
          abstract: abstract,
          year: w.publication_year || null,
          authors: authors,
          citations: w.cited_by_count || 0,
          url: w.doi ? 'https://doi.org/' + w.doi.replace('https://doi.org/', '') : (w.id || '')
        };
      });
    } catch (e) { return []; }
  }

  async function searchSources(query) {
    var results = await Promise.allSettled([
      searchSemanticScholar(query),
      searchOpenAlex(query)
    ]);
    var all = [];
    results.forEach(function (r) {
      if (r.status === 'fulfilled') all = all.concat(r.value);
    });
    // Only keep sources that have actual abstracts
    all = all.filter(function (s) { return s.abstract && s.abstract.length > 50; });
    all.sort(function (a, b) { return b.citations - a.citations; });
    return all;
  }

  // --- Source Analysis ---
  // Extracts specific findings, data, and limitations from full abstract
  function analyzeSource(source, claim) {
    var abstract = source.abstract || '';
    if (abstract.length < 30) return null;

    var sentences = abstract.split(/\.\s+/).filter(function (s) { return s.trim().length > 15; });

    // Find sentences with actual results/findings
    var findingSentences = sentences.filter(function (s) {
      return /\b(found|showed|demonstrated|revealed|observed|indicated|confirmed|associated|correlated|resulted|increased|decreased|reduced|improved|significant|effect|outcome)\b/i.test(s);
    });

    // Find sentences with numbers/statistics
    var dataSentences = sentences.filter(function (s) {
      return /(\d+\.?\d*\s*%|\d+\.?\d*\s*times|\d+\.?\d*-fold|p\s*[<>=]\s*0?\.\d+|n\s*=\s*\d+|OR\s*=?\s*\d|HR\s*=?\s*\d|CI\s*[:=]|r\s*=\s*0?\.\d|\d+\s*(participants|subjects|patients|samples))/i.test(s);
    });

    // Find limitation/caveat sentences
    var limitSentences = sentences.filter(function (s) {
      return /\b(however|although|limitation|caveat|despite|nevertheless|conversely|but|yet|unclear|inconsistent|heterogen|small sample|further research)\b/i.test(s);
    });

    // Find methodology
    var methodSentences = sentences.filter(function (s) {
      return /\b(randomized|meta-analysis|systematic review|longitudinal|cross-sectional|cohort|double-blind|controlled trial|survey of|experiment|sample of \d+)\b/i.test(s);
    });

    // Determine relevance to the claim
    var claimKeywords = claim.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 4; });
    var relevantFindings = findingSentences.filter(function (s) {
      var lower = s.toLowerCase();
      var matches = claimKeywords.filter(function (k) { return lower.indexOf(k) >= 0; });
      return matches.length >= 1;
    });

    return {
      title: source.title,
      // Use claim-relevant findings first, then any findings
      findings: relevantFindings.length > 0 ? relevantFindings.join('. ') : findingSentences.join('. '),
      data: dataSentences.join('. '),
      limitations: limitSentences.join('. '),
      methodology: methodSentences.join('. '),
      fullAbstract: abstract,
      hasSubstance: findingSentences.length > 0 || dataSentences.length > 0
    };
  }

  // --- Council Bot (argues FOR the claim) ---
  async function councilRound(claim, round, previousSenatorArg) {
    // Search with different queries each round for variety
    var queries = [
      claim + ' evidence support',
      claim + ' positive outcomes benefits',
      claim + ' confirmed demonstrated',
      claim + ' meta-analysis systematic review support',
      claim + ' longitudinal evidence'
    ];
    var query = queries[round % queries.length] || queries[0];
    if (round > 1 && previousSenatorArg) {
      // Address what Senator specifically cited
      query = claim + ' ' + extractKeyTerms(previousSenatorArg);
    }

    var sources = await searchSources(query);
    var usable = sources.filter(function (s) {
      var a = analyzeSource(s, claim);
      return a && a.hasSubstance;
    });

    var argument = '';

    if (usable.length > 0) {
      var src = usable[0];
      var analysis = analyzeSource(src, claim);

      // Build argument FROM the source content — not generic rhetoric
      if (round === 1) {
        argument = 'Supporting evidence from "' + src.title + '" (' + src.authors + ', ' + src.year + '):\n\n';
      } else {
        argument = 'Responding with additional evidence from "' + src.title + '" (' + src.year + '):\n\n';
      }

      if (analysis.findings) {
        argument += 'Key findings: ' + analysis.findings + '.\n\n';
      }
      if (analysis.data) {
        argument += 'Statistical evidence: ' + analysis.data + '.\n\n';
      }
      if (analysis.methodology) {
        argument += 'Methodology: ' + analysis.methodology + '.\n\n';
      }

      // Address Senator's previous point if applicable
      if (round > 1 && previousSenatorArg) {
        argument += 'Addressing the previous counter-argument: This evidence directly supports the original claim because the study\'s findings were derived from ' +
          (analysis.methodology ? analysis.methodology.substring(0, 100) : 'rigorous methodology') +
          ', which addresses the concerns raised.';
      }

      logEvidence({
        side: 'council',
        claim: analysis.findings || src.title,
        sourceUrl: src.url,
        sourceTitle: src.title,
        sourceAuthors: src.authors,
        sourceYear: src.year,
        findings: analysis.findings,
        data: analysis.data,
        limitations: analysis.limitations,
        fullAbstract: analysis.fullAbstract
      });
    } else {
      argument = round === 1
        ? 'I was unable to locate studies with accessible abstracts that directly support this specific claim in this search round. The claim may still be valid, but I cannot present specific evidence for it at this time.'
        : 'No additional studies with full abstracts were found this round. The previously cited evidence remains the strongest support for this position.';

      logEvidence({
        side: 'council',
        claim: claim,
        sourceTitle: 'No accessible source found',
        findings: '',
        data: '',
        limitations: 'Search did not return sources with abstracts relevant to this claim'
      });
    }

    return { text: argument };
  }

  // --- Senator Bot (argues AGAINST the claim) ---
  async function senatorRound(claim, round, previousCouncilArg) {
    var queries = [
      claim + ' criticism limitations problems',
      claim + ' negative outcomes risks',
      claim + ' contradicts disproven',
      claim + ' replication failure inconsistent',
      claim + ' confounding variables bias'
    ];
    var query = queries[round % queries.length] || queries[0];
    if (round > 1 && previousCouncilArg) {
      query = claim + ' counter ' + extractKeyTerms(previousCouncilArg);
    }

    var sources = await searchSources(query);
    var usable = sources.filter(function (s) {
      var a = analyzeSource(s, claim);
      return a && a.hasSubstance;
    });

    var argument = '';

    if (usable.length > 0) {
      var src = usable[0];
      var analysis = analyzeSource(src, claim);

      if (round === 1) {
        argument = 'Counter-evidence from "' + src.title + '" (' + src.authors + ', ' + src.year + '):\n\n';
      } else {
        argument = 'Additional counter-evidence from "' + src.title + '" (' + src.year + '):\n\n';
      }

      if (analysis.findings) {
        argument += 'Findings that complicate the claim: ' + analysis.findings + '.\n\n';
      }
      if (analysis.limitations) {
        argument += 'Limitations noted: ' + analysis.limitations + '.\n\n';
      }
      if (analysis.data) {
        argument += 'Data: ' + analysis.data + '.\n\n';
      }

      // Directly address Council's evidence
      if (round > 1 && previousCouncilArg) {
        argument += 'Regarding the Council\'s cited evidence: These findings suggest the relationship is more conditional than presented. ' +
          (analysis.limitations ? 'Specifically, the literature notes: ' + analysis.limitations.substring(0, 200) + '.' : 'The evidence base has gaps that weaken the universal application of this claim.');
      }

      logEvidence({
        side: 'senator',
        claim: analysis.findings || analysis.limitations || src.title,
        sourceUrl: src.url,
        sourceTitle: src.title,
        sourceAuthors: src.authors,
        sourceYear: src.year,
        findings: analysis.findings,
        data: analysis.data,
        limitations: analysis.limitations,
        fullAbstract: analysis.fullAbstract
      });
    } else {
      argument = round === 1
        ? 'I was unable to locate studies with accessible abstracts that directly counter this claim in this search round. This does not validate the claim — absence of counter-evidence is not evidence of absence.'
        : 'No additional counter-studies with full abstracts were found this round. The previously cited counter-evidence remains the strongest challenge to this position.';

      logEvidence({
        side: 'senator',
        claim: claim,
        sourceTitle: 'No accessible source found',
        findings: '',
        data: '',
        limitations: 'Search did not return sources with abstracts to challenge this claim'
      });
    }

    return { text: argument };
  }

  function extractKeyTerms(text) {
    var stops = new Set(['the','and','that','this','with','from','have','been','were','are','was','for','not','but','they','which','their','will','would','could','more','about','than','into']);
    return text.replace(/<[^>]+>/g, '').split(/\s+/).filter(function (w) {
      return w.length > 4 && !stops.has(w.toLowerCase());
    }).slice(0, 5).join(' ');
  }


  // --- Render argument in feed ---
  function renderArgument(feed, side, round, text) {
    var card = document.createElement('div');
    card.className = 'claim-card ' + side;
    var html = '<div class="card-round">Round ' + round + '</div>';
    html += '<div class="card-text">' + text.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>') + '</div>';
    card.innerHTML = html;
    feed.appendChild(card);
    feed.scrollTop = feed.scrollHeight;
  }

  // --- Summary with expandable cards ---
  function generateSummary() {
    summaryStatus.textContent = currentRound + ' rounds analyzed';
    summaryContent.innerHTML = '';

    var councilEvidence = evidenceLog.filter(function (e) { return e.side === 'council'; });
    var senatorEvidence = evidenceLog.filter(function (e) { return e.side === 'senator'; });

    for (var r = 1; r <= currentRound; r++) {
      var cEv = councilEvidence.filter(function (e) { return e.round === r; });
      var sEv = senatorEvidence.filter(function (e) { return e.round === r; });
      if (cEv.length === 0 && sEv.length === 0) continue;

      var roundCard = document.createElement('div');
      roundCard.className = 'summary-card';
      roundCard.innerHTML = '<h3>Round ' + r + '</h3>';

      if (cEv.length > 0) roundCard.appendChild(createEvidenceBlock(cEv[0], 'council'));
      if (sEv.length > 0) roundCard.appendChild(createEvidenceBlock(sEv[0], 'senator'));

      summaryContent.appendChild(roundCard);
    }

    // Verdict (only after stop)
    if (shouldStop || !isDebating) {
      var councilStrong = councilEvidence.filter(function (e) { return e.findings && e.findings.length > 20; }).length;
      var senatorStrong = senatorEvidence.filter(function (e) { return e.findings && e.findings.length > 20; }).length;
      var verdictDiv = document.createElement('div');
      verdictDiv.className = 'summary-card';
      var verdict = '';
      if (councilStrong > senatorStrong + 1) {
        verdict = 'The evidence leans toward supporting the original claim. Council cited ' + councilStrong + ' substantive sources vs Senator\'s ' + senatorStrong + '.';
      } else if (senatorStrong > councilStrong + 1) {
        verdict = 'The counter-evidence is compelling. Senator cited ' + senatorStrong + ' substantive sources vs Council\'s ' + councilStrong + '.';
      } else {
        verdict = 'The debate is closely matched (' + councilStrong + ' vs ' + senatorStrong + ' substantive sources). This topic has genuine complexity.';
      }
      verdictDiv.innerHTML = '<h3>Verdict</h3><div class="verdict">' + verdict + '</div>';
      summaryContent.appendChild(verdictDiv);
    }

    summaryPanel.scrollTop = summaryPanel.scrollHeight;
  }

  // Create an EXPANDABLE evidence block — click to see full details
  function createEvidenceBlock(ev, side) {
    var block = document.createElement('div');
    block.className = 'evidence-block ' + side;
    block.style.cursor = 'pointer';

    var color = side === 'council' ? '#10b981' : '#f59e0b';
    var label = side === 'council' ? 'Council' : 'Senator';

    // Preview (always visible)
    var preview = document.createElement('div');
    preview.className = 'evidence-preview';
    var previewText = ev.findings || ev.claim || 'No specific finding';
    // Show first 80 chars as preview
    var shortText = previewText.length > 80 ? previewText.substring(0, 80) + '...' : previewText;
    preview.innerHTML = '<strong style="color:' + color + ';">' + label + ':</strong> ' + shortText +
      (ev.sourceTitle && ev.sourceTitle !== 'No accessible source found' ? ' <em style="font-size:11px;color:#71717a;">(' + ev.sourceTitle.substring(0, 40) + ')</em>' : '') +
      ' <span style="font-size:10px;color:#8b5cf6;">&#9660; click to expand</span>';

    // Full details (hidden by default)
    var details = document.createElement('div');
    details.className = 'evidence-details';
    details.style.display = 'none';

    var detailHtml = '';
    if (ev.findings) {
      detailHtml += '<div class="detail-section"><span class="detail-label">Findings:</span><p>' + ev.findings + '</p></div>';
    }
    if (ev.data) {
      detailHtml += '<div class="detail-section"><span class="detail-label">Data/Statistics:</span><p>' + ev.data + '</p></div>';
    }
    if (ev.limitations) {
      detailHtml += '<div class="detail-section"><span class="detail-label">Limitations noted:</span><p>' + ev.limitations + '</p></div>';
    }
    if (ev.fullAbstract) {
      detailHtml += '<div class="detail-section"><span class="detail-label">Full abstract:</span><p>' + ev.fullAbstract + '</p></div>';
    }
    if (ev.sourceTitle && ev.sourceTitle !== 'No accessible source found') {
      detailHtml += '<div class="detail-section"><span class="detail-label">Source:</span><p>' +
        ev.sourceTitle + (ev.sourceAuthors ? ' — ' + ev.sourceAuthors : '') + (ev.sourceYear ? ' (' + ev.sourceYear + ')' : '') +
        '</p></div>';
    }
    if (ev.sourceUrl) {
      detailHtml += '<div class="detail-section"><a href="' + ev.sourceUrl + '" target="_blank" rel="noopener" style="color:#8b5cf6;text-decoration:underline;font-size:12px;">View source publication &rarr;</a></div>';
    }
    details.innerHTML = detailHtml;

    block.appendChild(preview);
    block.appendChild(details);

    // Toggle expand/collapse on click
    block.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') return; // Don't toggle if clicking link
      var isVisible = details.style.display !== 'none';
      details.style.display = isVisible ? 'none' : 'block';
      preview.querySelector('span:last-child').innerHTML = isVisible ? '&#9660; click to expand' : '&#9650; click to collapse';
    });

    return block;
  }


  // --- Debate Loop (UNLIMITED rounds until user stops) ---
  async function runDebate(claim) {
    isDebating = true;
    shouldStop = false;
    evidenceLog = [];
    currentRound = 0;
    councilFeed.innerHTML = '';
    senatorFeed.innerHTML = '';
    summaryContent.innerHTML = '';

    debateBtn.disabled = true;
    debateInput.disabled = true;
    stopDebateBtn.style.display = 'inline-block';
    summaryStatus.textContent = 'Debate in progress...';

    var lastCouncilArg = '';
    var lastSenatorArg = '';
    var round = 0;

    // Unlimited rounds — stops only when user clicks Stop
    while (!shouldStop) {
      round++;
      currentRound = round;
      if (roundNumber) roundNumber.textContent = String(round);
      debateStatus.textContent = 'Round ' + round + ' — Council researching...';

      // Council turn
      var councilResult = await councilRound(claim, round, lastSenatorArg);
      if (shouldStop) break;
      renderArgument(councilFeed, 'council', round, councilResult.text);
      lastCouncilArg = councilResult.text;

      await delay(600);
      if (shouldStop) break;

      debateStatus.textContent = 'Round ' + round + ' — Senator researching...';

      // Senator turn
      var senatorResult = await senatorRound(claim, round, lastCouncilArg);
      if (shouldStop) break;
      renderArgument(senatorFeed, 'senator', round, senatorResult.text);
      lastSenatorArg = senatorResult.text;

      // Update summary after each round
      generateSummary();

      await delay(800);
    }

    // Final summary with verdict
    generateSummary();

    // Reset UI
    isDebating = false;
    debateBtn.disabled = false;
    debateInput.disabled = false;
    stopDebateBtn.style.display = 'none';
    debateStatus.textContent = 'Debate complete (' + currentRound + ' rounds)';
    summaryStatus.textContent = 'Complete — ' + currentRound + ' rounds';
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // --- Events ---
  debateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var claim = debateInput.value.trim();
    if (claim && !isDebating) {
      runDebate(claim);
      debateInput.value = '';
    }
  });

  stopDebateBtn.addEventListener('click', function () {
    shouldStop = true;
    debateStatus.textContent = 'Stopping after current round...';
  });

  debateInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      debateForm.dispatchEvent(new Event('submit'));
    }
  });

  debateInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
  });



  // --- Debate Loop (UNLIMITED rounds until user stops) ---
  async function runDebate(claim) {
    isDebating = true;
    shouldStop = false;
    evidenceLog = [];
    currentRound = 0;
    councilFeed.innerHTML = '';
    senatorFeed.innerHTML = '';
    summaryContent.innerHTML = '';

    debateBtn.disabled = true;
    debateInput.disabled = true;
    stopDebateBtn.style.display = 'inline-block';
    summaryStatus.textContent = 'Debate in progress...';

    var lastCouncilArg = '';
    var lastSenatorArg = '';

    while (!shouldStop) {
      currentRound++;
      if (roundNumber) roundNumber.textContent = String(currentRound);
      debateStatus.textContent = 'Round ' + currentRound + ' — Council researching...';

      var councilResult = await councilRound(claim, currentRound, lastSenatorArg);
      if (shouldStop) break;
      renderArgument(councilFeed, 'council', currentRound, councilResult.text);
      lastCouncilArg = councilResult.text;

      await delay(600);
      if (shouldStop) break;

      debateStatus.textContent = 'Round ' + currentRound + ' — Senator researching...';

      var senatorResult = await senatorRound(claim, currentRound, lastCouncilArg);
      if (shouldStop) break;
      renderArgument(senatorFeed, 'senator', currentRound, senatorResult.text);
      lastSenatorArg = senatorResult.text;

      generateSummary();
      await delay(800);
    }

    generateSummary();
    isDebating = false;
    debateBtn.disabled = false;
    debateInput.disabled = false;
    stopDebateBtn.style.display = 'none';
    debateStatus.textContent = 'Debate complete (' + currentRound + ' rounds)';
    summaryStatus.textContent = 'Complete — ' + currentRound + ' rounds';
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // --- Events ---
  debateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var claim = debateInput.value.trim();
    if (claim && !isDebating) { runDebate(claim); debateInput.value = ''; }
  });
  stopDebateBtn.addEventListener('click', function () {
    shouldStop = true;
    debateStatus.textContent = 'Stopping after current round...';
  });
  debateInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); debateForm.dispatchEvent(new Event('submit')); }
  });
  debateInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
  });

})();
