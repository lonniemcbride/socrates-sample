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
  var citedTitles = new Set(); // Track already-cited papers to prevent repetition
  var consecutiveEmptyRounds = 0; // Auto-end when both sides run dry
  // NO fixed round limit — debate continues until sources exhausted or user stops

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

  // CORS proxy — Semantic Scholar needs it but often gets rate-limited
  // So we rely primarily on OpenAlex which works directly
  var CORS_PROXY = 'https://api.allorigins.win/raw?url=';

  // --- Source Search ---
  // OpenAlex is PRIMARY — it supports CORS natively from browsers
  // Semantic Scholar is REMOVED — consistently blocked by CORS and rate limits

  // Extract useful search terms from a claim (not the whole sentence)
  function extractSearchTerms(text) {
    var stops = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','between','out','off','over','under','that','this','these','those','it','its','and','but','or','nor','not','also','just','than','very','too','more','most','only','about','really','actually','basically','they','them','their','we','our','you','your','he','him','his','she','her','i','my','me','if','so','no','yes']);
    var words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(function(w) {
      return w.length > 3 && !stops.has(w);
    });
    // Take the most meaningful words (max 4-5 for a focused search)
    return words.slice(0, 5).join(' ');
  }


  async function searchOpenAlex(query) {
    try {
      // OpenAlex supports CORS natively — call directly (no proxy needed)
      var apiUrl = 'https://api.openalex.org/works?search=' +
        encodeURIComponent(query.substring(0, 200)) +
        '&per_page=5&select=id,title,abstract_inverted_index,publication_year,authorships,cited_by_count,doi&mailto=senator-app@example.com';
      var resp = await fetch(apiUrl);
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
    var all = [];
    
    // Search ALL sources in parallel for maximum coverage
    try {
      var results = await Promise.allSettled([
        searchOpenAlex(query),
        searchEuropePMC(query),
        searchCrossref(query)
      ]);
      results.forEach(function(r) {
        if (r.status === 'fulfilled') all = all.concat(r.value);
      });
    } catch (e) {}
    
    // STRICT relevance filter: source must actually be ABOUT the claim topic
    var queryWords = query.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 3; });
    all = all.filter(function (s) {
      if (!s.abstract || s.abstract.length < 50) return false;
      if (citedTitles.has(s.title)) return false;
      var combined = (s.title + ' ' + s.abstract).toLowerCase();
      var matchCount = queryWords.filter(function(w) { return combined.indexOf(w) >= 0; }).length;
      return matchCount >= 2;
    });
    all.sort(function (a, b) { return b.citations - a.citations; });
    return all;
  }

  // Europe PMC — 46M+ biomedical/life science papers (CORS supported)
  async function searchEuropePMC(query) {
    try {
      var apiUrl = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=' +
        encodeURIComponent(query.substring(0, 200)) +
        '&resultType=core&pageSize=5&format=json';
      var resp = await fetch(apiUrl);
      if (!resp.ok) return [];
      var data = await resp.json();
      if (!data.resultList || !data.resultList.result) return [];
      return data.resultList.result.map(function(p) {
        return {
          title: p.title || '',
          abstract: p.abstractText || '',
          year: p.pubYear ? parseInt(p.pubYear) : null,
          authors: p.authorString || '',
          citations: p.citedByCount || 0,
          url: p.doi ? 'https://doi.org/' + p.doi : ''
        };
      });
    } catch (e) { return []; }
  }

  // Crossref — 130M+ scholarly works with abstracts (CORS supported)
  async function searchCrossref(query) {
    try {
      var apiUrl = 'https://api.crossref.org/works?query=' +
        encodeURIComponent(query.substring(0, 200)) +
        '&rows=5&select=title,abstract,author,published-print,is-referenced-by-count,DOI&mailto=senator-app@example.com';
      var resp = await fetch(apiUrl);
      if (!resp.ok) return [];
      var data = await resp.json();
      if (!data.message || !data.message.items) return [];
      return data.message.items.map(function(w) {
        var authors = w.author ? w.author.slice(0, 3).map(function(a) {
          return (a.given || '') + ' ' + (a.family || '');
        }).join(', ') : '';
        var year = w['published-print'] && w['published-print']['date-parts'] && w['published-print']['date-parts'][0] ? w['published-print']['date-parts'][0][0] : null;
        var abstract = w.abstract ? w.abstract.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        return {
          title: Array.isArray(w.title) ? w.title[0] : (w.title || ''),
          abstract: abstract,
          year: year,
          authors: authors,
          citations: w['is-referenced-by-count'] || 0,
          url: w.DOI ? 'https://doi.org/' + w.DOI : ''
        };
      });
    } catch (e) { return []; }
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

    // Determine relevance to the claim — STRICT check
    var claimKeywords = claim.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 4; });
    
    // Count how many claim keywords appear in the full abstract
    var absLower = abstract.toLowerCase();
    var absRelevance = claimKeywords.filter(function (k) { return absLower.indexOf(k) >= 0; }).length;
    
    // Check title relevance
    var titleLower = source.title.toLowerCase();
    var titleRelevance = claimKeywords.filter(function (k) { return titleLower.indexOf(k) >= 0; }).length;

    // Source must have at least 2 claim keywords in title+abstract to be relevant
    var totalRelevance = absRelevance + titleRelevance;
    var isRelevant = totalRelevance >= 2;

    // Only extract findings from relevant sources
    var relevantFindings = [];
    if (isRelevant) {
      relevantFindings = findingSentences.filter(function (s) {
        var lower = s.toLowerCase();
        var matches = claimKeywords.filter(function (k) { return lower.indexOf(k) >= 0; });
        return matches.length >= 1;
      });
    }

    return {
      title: source.title,
      // Use relevant findings if available, otherwise use any findings from a relevant source
      findings: relevantFindings.length > 0 ? relevantFindings.join('. ') : (isRelevant ? findingSentences.join('. ') : ''),
      data: isRelevant ? dataSentences.join('. ') : '',
      limitations: isRelevant ? limitSentences.join('. ') : '',
      methodology: isRelevant ? methodSentences.join('. ') : '',
      fullAbstract: abstract,
      hasSubstance: isRelevant,
      titleRelevance: titleRelevance
    };
  }

  // --- Council Bot (argues FOR the claim) ---
  async function councilRound(claim, round, previousSenatorArg) {
    var baseTerms = extractSearchTerms(claim);
    // Many query variations to find relevant papers across rounds
    var queries = [
      baseTerms,
      baseTerms + ' evidence',
      baseTerms + ' study',
      baseTerms + ' research',
      baseTerms + ' analysis',
      baseTerms + ' review',
      baseTerms + ' findings',
      baseTerms + ' outcomes',
      baseTerms + ' history',
      baseTerms + ' impact'
    ];
    var query = queries[(round - 1) % queries.length];
    if (round > 3 && previousSenatorArg) {
      query = extractSearchTerms(previousSenatorArg);
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
      citedTitles.add(src.title); // Mark as cited

      // Build argument FROM the source content
      if (round === 1) {
        argument = 'Supporting evidence from "' + src.title + '" (' + src.authors + ', ' + src.year + '):\n\n';
      } else {
        argument = 'Additional evidence from "' + src.title + '" (' + src.year + '):\n\n';
      }

      if (analysis.findings) {
        argument += 'Key findings: ' + analysis.findings + '.\n\n';
      } else if (analysis.fullAbstract) {
        // Use first substantive sentences from abstract if no specific findings extracted
        var sentences = analysis.fullAbstract.split(/\.\s+/).filter(function(s) { return s.trim().length > 30; });
        var relevant = sentences.slice(0, 3).join('. ');
        if (relevant) argument += 'From the abstract: ' + relevant + '.\n\n';
      }
      if (analysis.data) {
        argument += 'Statistical evidence: ' + analysis.data + '.\n\n';
      }
      if (analysis.methodology) {
        argument += 'Methodology: ' + analysis.methodology + '.\n\n';
      }

      // Address Senator's previous point if applicable
      if (round > 1 && previousSenatorArg) {
        argument += 'This evidence addresses the previous counter-argument by providing additional context from peer-reviewed research.';
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

      return { text: argument, foundSource: true };
    } else {
      return { text: '', foundSource: false };
    }
  }

  // --- Senator Bot (argues AGAINST the claim) ---
  async function senatorRound(claim, round, previousCouncilArg) {
    var baseTerms = extractSearchTerms(claim);
    // Use the SAME base search as Council — but look for limitations/caveats in results
    var queries = [
      baseTerms,
      baseTerms + ' review',
      baseTerms + ' analysis',
      baseTerms + ' history',
      baseTerms + ' context',
      baseTerms + ' debate',
      baseTerms + ' interpretation',
      baseTerms + ' perspective',
      baseTerms + ' study',
      baseTerms + ' research'
    ];
    var query = queries[(round - 1) % queries.length];
    if (round > 3 && previousCouncilArg) {
      query = extractSearchTerms(previousCouncilArg);
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
      citedTitles.add(src.title); // Mark as cited

      if (round === 1) {
        argument = 'Counter-evidence from "' + src.title + '" (' + src.authors + ', ' + src.year + '):\n\n';
      } else {
        argument = 'Additional counter-evidence from "' + src.title + '" (' + src.year + '):\n\n';
      }

      if (analysis.findings) {
        argument += 'Findings that complicate the claim: ' + analysis.findings + '.\n\n';
      } else if (analysis.fullAbstract) {
        var sentences = analysis.fullAbstract.split(/\.\s+/).filter(function(s) { return s.trim().length > 30; });
        var relevant = sentences.slice(0, 3).join('. ');
        if (relevant) argument += 'From the abstract: ' + relevant + '.\n\n';
      }
      if (analysis.limitations) {
        argument += 'Limitations noted: ' + analysis.limitations + '.\n\n';
      }
      if (analysis.data) {
        argument += 'Data: ' + analysis.data + '.\n\n';
      }

      // Directly address Council's evidence
      if (round > 1 && previousCouncilArg) {
        argument += 'This research suggests the picture is more nuanced than the Council\'s evidence indicates.';
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

      return { text: argument, foundSource: true };
    } else {
      return { text: '', foundSource: false };
    }
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

    // Verdict and detailed summary (only after stop)
    if (shouldStop || !isDebating) {
      var councilStrong = councilEvidence.filter(function (e) { return e.findings && e.findings.length > 20; }).length;
      var senatorStrong = senatorEvidence.filter(function (e) { return e.findings && e.findings.length > 20; }).length;
      var verdictDiv = document.createElement('div');
      verdictDiv.className = 'summary-card';
      
      var verdict = '';
      if (councilStrong > senatorStrong + 1) {
        verdict = 'The evidence leans toward supporting the original claim.';
      } else if (senatorStrong > councilStrong + 1) {
        verdict = 'The counter-evidence is compelling and challenges the original claim.';
      } else {
        verdict = 'The debate is closely matched. This topic has genuine complexity.';
      }
      
      // Build detailed written summary
      var summary = '<h3>Final Summary</h3>';
      summary += '<div class="verdict"><strong>Verdict:</strong> ' + verdict + '</div>';
      summary += '<div style="margin-top:12px;font-size:12px;line-height:1.7;color:#e0e0e5;">';
      summary += '<p style="margin-bottom:8px;"><strong>Debate Overview:</strong> This debate ran for ' + currentRound + ' rounds. ';
      summary += 'The Council cited ' + councilStrong + ' substantive source' + (councilStrong !== 1 ? 's' : '') + ' in support of the claim, ';
      summary += 'while the Senator cited ' + senatorStrong + ' substantive source' + (senatorStrong !== 1 ? 's' : '') + ' against it.</p>';
      
      // Council's key evidence summary
      if (councilStrong > 0) {
        summary += '<p style="margin-bottom:8px;"><strong style="color:#10b981;">Council\'s strongest evidence:</strong> ';
        var councilBest = councilEvidence.filter(function(e) { return e.findings && e.findings.length > 20; });
        councilBest.slice(0, 3).forEach(function(e, i) {
          if (i > 0) summary += ' Additionally, ';
          summary += '"' + e.sourceTitle + '" (' + (e.sourceYear || 'n.d.') + ') ';
          if (e.findings) summary += 'found: ' + e.findings.substring(0, 200) + (e.findings.length > 200 ? '...' : '') + '. ';
          if (e.data) summary += '(Data: ' + e.data.substring(0, 100) + ') ';
        });
        summary += '</p>';
      }
      
      // Senator's key evidence summary
      if (senatorStrong > 0) {
        summary += '<p style="margin-bottom:8px;"><strong style="color:#f59e0b;">Senator\'s strongest counter-evidence:</strong> ';
        var senatorBest = senatorEvidence.filter(function(e) { return e.findings && e.findings.length > 20; });
        senatorBest.slice(0, 3).forEach(function(e, i) {
          if (i > 0) summary += ' Furthermore, ';
          summary += '"' + e.sourceTitle + '" (' + (e.sourceYear || 'n.d.') + ') ';
          if (e.findings) summary += 'indicates: ' + e.findings.substring(0, 200) + (e.findings.length > 200 ? '...' : '') + '. ';
          if (e.limitations) summary += '(Limitations: ' + e.limitations.substring(0, 100) + ') ';
        });
        summary += '</p>';
      }
      
      // Conclusion
      summary += '<p style="margin-bottom:0;"><strong>Conclusion:</strong> ';
      if (councilStrong > senatorStrong + 1) {
        summary += 'The peer-reviewed evidence available through OpenAlex, Europe PMC, and Crossref more strongly supports the original claim than contradicts it. The Council presented more substantive, directly relevant sources. However, the Senator\'s objections regarding ' + (senatorStrong > 0 ? 'methodology and scope' : 'the limits of available evidence') + ' remain worth considering.';
      } else if (senatorStrong > councilStrong + 1) {
        summary += 'The available academic literature raises significant challenges to the original claim. The Senator presented more substantive counter-evidence than the Council could support. The claim may require significant qualification or revision to be considered well-supported.';
      } else {
        summary += 'The academic literature does not clearly resolve this debate in either direction. Both sides presented relevant evidence, suggesting this is a genuinely contested question in the research community. Further investigation with more specific search terms or direct access to specialized databases may be needed.';
      }
      summary += '</p></div>';
      
      verdictDiv.innerHTML = summary;
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
    citedTitles.clear();
    consecutiveEmptyRounds = 0;
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
      
      if (councilResult.foundSource) {
        renderArgument(councilFeed, 'council', currentRound, councilResult.text);
        lastCouncilArg = councilResult.text;
        consecutiveEmptyRounds = 0;
      } else {
        // Council found nothing new
        consecutiveEmptyRounds++;
      }

      await delay(600);
      if (shouldStop) break;

      debateStatus.textContent = 'Round ' + currentRound + ' — Senator researching...';

      var senatorResult = await senatorRound(claim, currentRound, lastCouncilArg);
      if (shouldStop) break;
      
      if (senatorResult.foundSource) {
        renderArgument(senatorFeed, 'senator', currentRound, senatorResult.text);
        lastSenatorArg = senatorResult.text;
        consecutiveEmptyRounds = 0;
      } else {
        // Senator found nothing new
        consecutiveEmptyRounds++;
      }

      generateSummary();
      
      // AUTO-END: only if BOTH bots failed for 3 CONSECUTIVE rounds
      if (consecutiveEmptyRounds >= 6) {
        debateStatus.textContent = 'All available sources exhausted. Concluding debate.';
        renderArgument(councilFeed, 'council', currentRound, 'No further relevant academic sources could be found to support this claim. The available evidence has been presented.');
        renderArgument(senatorFeed, 'senator', currentRound, 'No further relevant academic sources could be found to challenge this claim. The available counter-evidence has been presented.');
        break;
      }
      
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
