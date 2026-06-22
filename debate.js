// Senator - Debate Arena
// Advocate + Senator bots with evidence-based argumentation

(function () {
  'use strict';

  // DOM Elements
  var advocateFeed = document.getElementById('advocateFeed');
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

  // State
  var isDebating = false;
  var shouldStop = false;
  var evidenceLog = [];
  var currentRound = 0;
  var TOTAL_ROUNDS = 4;
  var ALLORIGINS_PROXY = 'https://api.allorigins.win/raw?url=';

  // Evidence logging - called by both bots
  function logEvidence(entry) {
    evidenceLog.push({
      round: currentRound,
      timestamp: Date.now(),
      side: entry.side, // 'advocate' or 'senator'
      claim: entry.claim,
      source: entry.source,
      sourceTitle: entry.sourceTitle,
      findings: entry.findings,
      data: entry.data,
      limitations: entry.limitations || null
    });
  }

  // Search Semantic Scholar
  async function searchSemanticScholar(query) {
    try {
      var encodedQuery = encodeURIComponent(query.substring(0, 200));
      var url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' +
        encodedQuery + '&limit=3&fields=title,abstract,year,authors,citationCount,url';
      var response = await fetch(url);
      if (!response.ok) return [];
      var data = await response.json();
      if (!data.data) return [];
      return data.data.map(function (paper) {
        return {
          title: paper.title || 'Untitled',
          abstract: paper.abstract || '',
          year: paper.year || 'N/A',
          authors: paper.authors ? paper.authors.map(function (a) { return a.name; }).join(', ') : 'Unknown',
          citations: paper.citationCount || 0,
          url: paper.url || '',
          source: 'Semantic Scholar'
        };
      });
    } catch (e) {
      return [];
    }
  }

  // Search OpenAlex
  async function searchOpenAlex(query) {
    try {
      var encodedQuery = encodeURIComponent(query.substring(0, 200));
      var url = 'https://api.openalex.org/works?search=' + encodedQuery +
        '&per_page=3&select=id,title,publication_year,authorships,cited_by_count,doi';
      var response = await fetch(url);
      if (!response.ok) return [];
      var data = await response.json();
      if (!data.results) return [];
      return data.results.map(function (work) {
        var authors = work.authorships ? work.authorships.slice(0, 3).map(function (a) {
          return a.author ? a.author.display_name : 'Unknown';
        }).join(', ') : 'Unknown';
        return {
          title: work.title || 'Untitled',
          abstract: '',
          year: work.publication_year || 'N/A',
          authors: authors,
          citations: work.cited_by_count || 0,
          url: work.doi ? 'https://doi.org/' + work.doi.replace('https://doi.org/', '') : work.id,
          source: 'OpenAlex'
        };
      });
    } catch (e) {
      return [];
    }
  }

  // Analyze source content
  function analyzeSource(source) {
    var analysis = {
      title: source.title,
      findings: '',
      numbers: '',
      limitations: ''
    };

    if (source.abstract) {
      // Extract findings
      var sentences = source.abstract.split(/\.\s+/);
      var findingSentence = sentences.find(function (s) {
        return /found|result|show|demonstrat|suggest|indicat|reveal|conclud/i.test(s);
      });
      analysis.findings = findingSentence ? findingSentence.trim() : sentences[sentences.length - 1].trim();

      // Extract numbers/data
      var numberMatch = source.abstract.match(/(\d+\.?\d*\s*%|\d+\.?\d*\s*times|\d+\.?\d*-fold|p\s*[<>=]\s*\d+\.?\d*|n\s*=\s*\d+|OR\s*=?\s*\d+\.?\d*|HR\s*=?\s*\d+\.?\d*)/i);
      analysis.numbers = numberMatch ? numberMatch[0] : (source.citations > 50 ? 'Cited ' + source.citations + ' times' : '');

      // Extract limitations
      var limitSentence = sentences.find(function (s) {
        return /however|limitation|caveat|although|but|despite|nevertheless/i.test(s);
      });
      analysis.limitations = limitSentence ? limitSentence.trim() : '';
    } else {
      analysis.findings = source.title;
      analysis.numbers = source.citations > 0 ? 'Cited ' + source.citations + ' times (' + source.year + ')' : 'Published ' + source.year;
    }

    return analysis;
  }

  // Advocate bot - argues FOR the claim
  async function advocateRound(claim, round, previousCounter) {
    var searchQuery = '';
    if (round === 1) {
      searchQuery = claim + ' evidence support';
    } else {
      searchQuery = claim + ' benefits positive outcomes evidence ' + (previousCounter ? previousCounter.substring(0, 50) : '');
    }

    var results = await Promise.all([
      searchSemanticScholar(searchQuery),
      searchOpenAlex(searchQuery)
    ]);

    var sources = results[0].concat(results[1]);
    sources.sort(function (a, b) { return b.citations - a.citations; });

    var topSource = sources[0];
    var analysis = topSource ? analyzeSource(topSource) : null;

    var argument = '';
    if (analysis && analysis.findings) {
      if (round === 1) {
        argument = "The evidence supports this claim. " + analysis.title + " (" + (topSource.year) + ") " +
          "found that " + analysis.findings + ".";
      } else {
        argument = "Building on the evidence: " + analysis.title + " (" + (topSource.year) + ") " +
          "demonstrates that " + analysis.findings + ".";
      }
      if (analysis.numbers) {
        argument += " Key data: " + analysis.numbers + ".";
      }

      // Log evidence
      logEvidence({
        side: 'advocate',
        claim: claim,
        source: topSource.source,
        sourceTitle: topSource.title,
        findings: analysis.findings,
        data: analysis.numbers,
        limitations: analysis.limitations
      });
    } else {
      argument = round === 1
        ? "This claim is well-supported by general consensus and practical observation. The underlying principle aligns with established understanding in this domain."
        : "The weight of practical experience continues to support this position. Real-world outcomes demonstrate its validity across multiple contexts.";

      logEvidence({
        side: 'advocate',
        claim: claim,
        source: 'General knowledge',
        sourceTitle: 'Consensus view',
        findings: argument,
        data: '',
        limitations: 'No specific academic source found for this round'
      });
    }

    return {
      text: argument,
      source: topSource ? topSource.title : null,
      sourceData: analysis
    };
  }

  // Senator bot - argues AGAINST the claim
  async function senatorRound(claim, round, previousArgument) {
    var searchQuery = '';
    if (round === 1) {
      searchQuery = claim + ' criticism limitations problems';
    } else {
      searchQuery = claim + ' counter-evidence contradicts negative outcomes ' + (previousArgument ? previousArgument.substring(0, 50) : '');
    }

    var results = await Promise.all([
      searchSemanticScholar(searchQuery),
      searchOpenAlex(searchQuery)
    ]);

    var sources = results[0].concat(results[1]);
    sources.sort(function (a, b) { return b.citations - a.citations; });

    var topSource = sources[0];
    var analysis = topSource ? analyzeSource(topSource) : null;

    var argument = '';
    if (analysis && analysis.findings) {
      if (round === 1) {
        argument = "However, research presents a more nuanced picture. " + analysis.title + " (" + (topSource.year) + ") " +
          "found that " + analysis.findings + ".";
      } else {
        argument = "The counter-evidence strengthens: " + analysis.title + " (" + (topSource.year) + ") " +
          "shows that " + analysis.findings + ".";
      }
      if (analysis.numbers) {
        argument += " Notable data point: " + analysis.numbers + ".";
      }
      if (analysis.limitations) {
        argument += " Furthermore: " + analysis.limitations + ".";
      }

      // Log evidence
      logEvidence({
        side: 'senator',
        claim: claim,
        source: topSource.source,
        sourceTitle: topSource.title,
        findings: analysis.findings,
        data: analysis.numbers,
        limitations: analysis.limitations
      });
    } else {
      argument = round === 1
        ? "This claim deserves scrutiny. The underlying assumptions may not hold across all contexts, and the evidence base has notable gaps that weaken universal application."
        : "The case for this claim continues to show cracks. Without robust, replicated evidence across diverse settings, the conclusion remains premature.";

      logEvidence({
        side: 'senator',
        claim: claim,
        source: 'Critical analysis',
        sourceTitle: 'Methodological critique',
        findings: argument,
        data: '',
        limitations: 'No specific counter-source found for this round'
      });
    }

    return {
      text: argument,
      source: topSource ? topSource.title : null,
      sourceData: analysis
    };
  }

  // Render claim card in feed
  function renderClaimCard(feed, side, round, text, sourceData) {
    var card = document.createElement('div');
    card.className = 'claim-card ' + side;

    var html = '<div class="card-round">Round ' + round + '</div>';
    html += '<div class="card-text">' + text + '</div>';

    if (sourceData && sourceData.findings) {
      html += '<div class="card-evidence">';
      html += '<div class="evidence-label">Evidence from source</div>';
      html += '<div>' + sourceData.findings + '</div>';
      if (sourceData.numbers) {
        html += '<div style="margin-top:4px;color:#a78bfa;">' + sourceData.numbers + '</div>';
      }
      html += '</div>';
    }

    card.innerHTML = html;
    feed.appendChild(card);
    feed.scrollTop = feed.scrollHeight;
  }

  // Summary engine - cross-references evidence
  function generateSummary() {
    summaryStatus.textContent = 'Analyzing...';
    summaryContent.innerHTML = '';

    var advocateEvidence = evidenceLog.filter(function (e) { return e.side === 'advocate'; });
    var senatorEvidence = evidenceLog.filter(function (e) { return e.side === 'senator'; });

    // Cross-reference claims
    var html = '';

    // Round-by-round analysis
    for (var r = 1; r <= currentRound; r++) {
      var advRound = advocateEvidence.filter(function (e) { return e.round === r; });
      var senRound = senatorEvidence.filter(function (e) { return e.round === r; });

      if (advRound.length > 0 || senRound.length > 0) {
        html += '<div class="summary-card">';
        html += '<h3>Round ' + r + '</h3>';

        if (advRound.length > 0) {
          var adv = advRound[0];
          html += '<div style="margin-bottom:8px;">';
          html += '<strong style="color:#10b981;">Advocate:</strong> ';
          html += '<span>' + adv.findings.substring(0, 150) + '</span>';
          if (adv.data) {
            html += '<br><em style="font-size:11px;color:#a1a1aa;">Data: ' + adv.data + '</em>';
          }
          html += '<br><em style="font-size:11px;color:#71717a;">Source: ' + adv.sourceTitle + '</em>';
          html += '</div>';
        }

        if (senRound.length > 0) {
          var sen = senRound[0];
          html += '<div style="margin-bottom:8px;">';
          html += '<strong style="color:#f59e0b;">Senator:</strong> ';
          html += '<span>' + sen.findings.substring(0, 150) + '</span>';
          if (sen.data) {
            html += '<br><em style="font-size:11px;color:#a1a1aa;">Data: ' + sen.data + '</em>';
          }
          html += '<br><em style="font-size:11px;color:#71717a;">Source: ' + sen.sourceTitle + '</em>';

          // Show "countered by" if both sides have evidence
          if (advRound.length > 0 && adv.sourceTitle !== 'Consensus view') {
            html += '<br><em style="font-size:11px;color:#8b5cf6;">Countered by: ' + sen.sourceTitle + '</em>';
            if (sen.data) {
              html += '<em style="font-size:11px;color:#8b5cf6;"> (' + sen.data + ')</em>';
            }
          }
          html += '</div>';
        }

        html += '</div>';
      }
    }

    // Final verdict
    if (currentRound >= TOTAL_ROUNDS) {
      html += '<div class="summary-card">';
      html += '<h3>Verdict</h3>';

      var advWithSources = advocateEvidence.filter(function (e) { return e.sourceTitle !== 'Consensus view'; });
      var senWithSources = senatorEvidence.filter(function (e) { return e.sourceTitle !== 'Methodological critique'; });

      var advStrength = advWithSources.length;
      var senStrength = senWithSources.length;

      var verdict = '';
      if (advStrength > senStrength + 1) {
        verdict = 'The evidence leans toward supporting the original claim. The advocate presented stronger sourced arguments across more rounds.';
      } else if (senStrength > advStrength + 1) {
        verdict = 'The counter-evidence is compelling. The senator raised well-sourced objections that challenge the original claim significantly.';
      } else {
        verdict = 'The debate is closely matched. Both sides presented relevant evidence, suggesting this topic has genuine complexity and nuance.';
      }

      html += '<div class="verdict">' + verdict + '</div>';
      html += '<div style="margin-top:8px;font-size:12px;color:#71717a;">';
      html += 'Advocate sources cited: ' + advStrength + ' | Senator sources cited: ' + senStrength;
      html += '</div>';
      html += '</div>';

      summaryStatus.textContent = 'Debate complete';
    } else {
      summaryStatus.textContent = 'Round ' + currentRound + ' of ' + TOTAL_ROUNDS;
    }

    summaryContent.innerHTML = html;
    summaryPanel.scrollTop = summaryPanel.scrollHeight;
  }

  // Run debate loop
  async function runDebate(claim) {
    isDebating = true;
    shouldStop = false;
    evidenceLog = [];
    currentRound = 0;
    advocateFeed.innerHTML = '';
    senatorFeed.innerHTML = '';
    summaryContent.innerHTML = '';

    debateBtn.disabled = true;
    debateInput.disabled = true;
    stopDebateBtn.style.display = 'inline-block';
    summaryStatus.textContent = 'Debate in progress...';

    var lastAdvArgument = '';
    var lastSenArgument = '';

    for (var round = 1; round <= TOTAL_ROUNDS; round++) {
      if (shouldStop) break;

      currentRound = round;
      roundNumber.textContent = String(round);
      debateStatus.textContent = 'Round ' + round + ' — Advocate researching...';

      // Advocate turn
      var advResult = await advocateRound(claim, round, lastSenArgument);
      if (shouldStop) break;
      renderClaimCard(advocateFeed, 'advocate', round, advResult.text, advResult.sourceData);
      lastAdvArgument = advResult.text;

      // Small delay for readability
      await delay(800);
      if (shouldStop) break;

      debateStatus.textContent = 'Round ' + round + ' — Senator researching...';

      // Senator turn
      var senResult = await senatorRound(claim, round, lastAdvArgument);
      if (shouldStop) break;
      renderClaimCard(senatorFeed, 'senator', round, senResult.text, senResult.sourceData);
      lastSenArgument = senResult.text;

      // Update summary after each round
      generateSummary();

      // Delay between rounds
      if (round < TOTAL_ROUNDS) {
        await delay(1000);
      }
    }

    // Final summary
    if (!shouldStop) {
      generateSummary();
    }

    // Reset UI
    isDebating = false;
    debateBtn.disabled = false;
    debateInput.disabled = false;
    stopDebateBtn.style.display = 'none';
    debateStatus.textContent = shouldStop ? 'Debate stopped' : 'Debate complete';
  }

  // Utility delay
  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // Event: Start debate
  debateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var claim = debateInput.value.trim();
    if (claim && !isDebating) {
      runDebate(claim);
      debateInput.value = '';
    }
  });

  // Event: Stop debate
  stopDebateBtn.addEventListener('click', function () {
    shouldStop = true;
    debateStatus.textContent = 'Stopping...';
  });

  // Event: Enter key
  debateInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      debateForm.dispatchEvent(new Event('submit'));
    }
  });

  // Auto-resize textarea
  debateInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
  });

})();
