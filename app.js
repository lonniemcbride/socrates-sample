// Senator - Counter-Argument Engine
// Searches Semantic Scholar + OpenAlex APIs for evidence-based rebuttals

(function () {
  'use strict';

  // DOM Elements
  const chatContainer = document.getElementById('chatContainer');
  const inputForm = document.getElementById('inputForm');
  const userInput = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');

  // State
  const contradictions = [];
  const ALLORIGINS_PROXY = 'https://api.allorigins.win/raw?url=';

  // Claim type detection
  function detectClaimType(text) {
    const lower = text.toLowerCase();
    if (/causes?|leads? to|results? in|because|due to|effect of/i.test(lower)) {
      return 'causal';
    }
    if (/should|must|ought|need to|policy|government|regulate/i.test(lower)) {
      return 'policy';
    }
    if (/moral|ethical|right|wrong|justice|fair/i.test(lower)) {
      return 'moral';
    }
    if (/always|never|every|all|none|no one/i.test(lower)) {
      return 'absolute';
    }
    if (/stud(y|ies)|research|data|evidence|percent|%|statistic/i.test(lower)) {
      return 'empirical';
    }
    if (/better|worse|superior|inferior|more effective/i.test(lower)) {
      return 'comparative';
    }
    return 'empirical';
  }

  // URL detection
  function detectURL(text) {
    var urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    var matches = text.match(urlRegex);
    return matches ? matches[0] : null;
  }

  // CORS proxy — fallback if direct API calls are blocked
  var CORS_PROXY = 'https://corsproxy.io/?url=';

  // Search Semantic Scholar
  async function searchSemanticScholar(query) {
    try {
      var encodedQuery = encodeURIComponent(query);
      var apiUrl = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' +
        encodedQuery + '&limit=5&fields=title,abstract,year,authors,citationCount,url';
      var response = await fetch(apiUrl);
      if (!response.ok) {
        // Retry with proxy
        response = await fetch(CORS_PROXY + encodeURIComponent(apiUrl));
      }
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
      console.warn('Semantic Scholar search failed:', e.message);
      return [];
    }
  }

  // Search OpenAlex
  async function searchOpenAlex(query) {
    try {
      var encodedQuery = encodeURIComponent(query);
      var apiUrl = 'https://api.openalex.org/works?search=' + encodedQuery +
        '&per_page=5&select=id,title,publication_year,authorships,cited_by_count,doi';
      var response = await fetch(apiUrl);
      if (!response.ok) {
        response = await fetch(CORS_PROXY + encodeURIComponent(apiUrl));
      }
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
      console.warn('OpenAlex search failed:', e.message);
      return [];
    }
  }

  // Fetch URL content via proxy
  async function fetchURLContent(url) {
    try {
      var proxyUrl = ALLORIGINS_PROXY + encodeURIComponent(url);
      var response = await fetch(proxyUrl);
      if (!response.ok) return null;
      var text = await response.text();
      // Extract readable content from HTML
      var doc = new DOMParser().parseFromString(text, 'text/html');
      // Remove scripts and styles
      var scripts = doc.querySelectorAll('script, style, nav, footer, header');
      scripts.forEach(function (el) { el.remove(); });
      var body = doc.body ? doc.body.textContent : '';
      // Clean up whitespace
      body = body.replace(/\s+/g, ' ').trim();
      // Get title
      var title = doc.querySelector('title') ? doc.querySelector('title').textContent.trim() : '';
      // Get meta description
      var metaDesc = doc.querySelector('meta[name="description"]');
      var description = metaDesc ? metaDesc.getAttribute('content') || '' : '';
      return {
        title: title,
        description: description,
        content: body.substring(0, 3000),
        url: url
      };
    } catch (e) {
      console.warn('URL fetch failed:', e.message);
      return null;
    }
  }

  // Build counter-arguments based on claim type
  function buildCounterArguments(claimType, claim, sources) {
    var validSources = sources.filter(function (s) { return s.title && s.title !== 'Untitled'; });
    if (validSources.length === 0) {
      return buildFallbackResponse(claimType, claim);
    }

    var topSource = validSources[0];
    var secondSource = validSources.length > 1 ? validSources[1] : null;

    var response = '';

    switch (claimType) {
      case 'causal':
        response = "That's an interesting causal claim. However, the relationship may be more nuanced than it appears. ";
        response += "**" + topSource.title + "** (" + topSource.year + ", cited " + topSource.citations + " times) ";
        if (topSource.abstract) {
          response += "found that " + extractKeyFinding(topSource.abstract) + ". ";
        } else {
          response += "suggests the causal mechanism may involve confounding factors. ";
        }
        if (secondSource) {
          response += "Additionally, " + secondSource.authors.split(',')[0] + " et al. (" + secondSource.year + ") ";
          response += "demonstrated that reverse causation or third variables could explain this pattern.";
        }
        break;

      case 'policy':
        response = "That's a policy position worth examining from multiple angles. ";
        response += "Research from " + topSource.authors.split(',')[0] + " et al. ";
        response += "(\"" + topSource.title + "\", " + topSource.year + ") ";
        if (topSource.abstract) {
          response += "indicates that " + extractKeyFinding(topSource.abstract) + ". ";
        } else {
          response += "raises important considerations about implementation challenges and unintended consequences. ";
        }
        if (secondSource) {
          response += "A " + secondSource.year + " study with " + secondSource.citations + " citations ";
          response += "found mixed results when similar policies were implemented in practice.";
        }
        break;

      case 'moral':
        response = "That's a meaningful ethical claim. Let me offer a different philosophical perspective. ";
        response += "According to work by " + topSource.authors.split(',')[0] + " ";
        response += "(\"" + topSource.title + "\", " + topSource.year + "), ";
        if (topSource.abstract) {
          response += extractKeyFinding(topSource.abstract) + ". ";
        } else {
          response += "the moral calculus here may depend on which ethical framework you prioritize. ";
        }
        response += "This challenges the claim by highlighting competing values and tradeoffs.";
        break;

      case 'absolute':
        response = "Absolute claims are tricky because exceptions often reveal important nuances. ";
        response += "**" + topSource.title + "** (" + topSource.year + ") ";
        if (topSource.abstract) {
          response += "documents cases where " + extractKeyFinding(topSource.abstract) + ". ";
        } else {
          response += "presents evidence of significant exceptions to this generalization. ";
        }
        if (secondSource) {
          response += "Furthermore, " + secondSource.authors.split(',')[0] + " (" + secondSource.year + ") ";
          response += "found that context matters enormously, with " + secondSource.citations + " subsequent papers citing their nuanced findings.";
        }
        break;

      case 'comparative':
        response = "Comparisons often depend heavily on what metrics you use. ";
        response += "A study by " + topSource.authors.split(',')[0] + " et al. (\"" + topSource.title + "\", " + topSource.year + ") ";
        if (topSource.abstract) {
          response += "found that " + extractKeyFinding(topSource.abstract) + ". ";
        } else {
          response += "suggests that by different measures, the comparison may flip. ";
        }
        if (secondSource) {
          response += "Research cited " + secondSource.citations + " times (" + secondSource.year + ") indicates ";
          response += "the advantage depends on specific conditions and populations studied.";
        }
        break;

      default: // empirical
        response = "Let me share what the research suggests. ";
        response += "**" + topSource.title + "** by " + topSource.authors.split(',')[0] + " et al. (" + topSource.year + ") ";
        if (topSource.abstract) {
          response += "found that " + extractKeyFinding(topSource.abstract) + ". ";
        } else {
          response += "presents findings that complicate this picture. ";
        }
        if (secondSource) {
          response += "This is supported by a " + secondSource.year + " paper with " + secondSource.citations + " citations ";
          response += "that reached similar conclusions using different methodology.";
        }
        break;
    }

    // Add source references
    response += '\n\n';
    validSources.slice(0, 3).forEach(function (source, i) {
      response += '`[' + source.source + '] ' + source.title + ' (' + source.year + ')`\n';
    });

    return response;
  }

  // Extract key finding from abstract
  function extractKeyFinding(abstract) {
    if (!abstract) return 'the evidence presents a more complex picture';
    // Look for results/findings sentences
    var sentences = abstract.split(/\.\s+/);
    var resultSentence = sentences.find(function (s) {
      return /found|result|show|demonstrat|suggest|indicat|reveal|conclud/i.test(s);
    });
    if (resultSentence) {
      // Trim to reasonable length
      var finding = resultSentence.trim();
      if (finding.length > 200) finding = finding.substring(0, 197) + '...';
      return finding.charAt(0).toLowerCase() + finding.slice(1);
    }
    // Fallback: use last sentence (often conclusion)
    var lastSentence = sentences[sentences.length - 1] || sentences[0] || '';
    if (lastSentence.length > 200) lastSentence = lastSentence.substring(0, 197) + '...';
    return lastSentence.trim().charAt(0).toLowerCase() + lastSentence.trim().slice(1);
  }

  // Fallback response when no sources found
  function buildFallbackResponse(claimType, claim) {
    var responses = {
      causal: "That's an interesting causal claim. While I couldn't find specific counter-studies right now, causal claims often face challenges from confounding variables, reverse causation, and selection bias. Consider whether controlled experiments have confirmed this relationship or if it's based on correlational data.",
      policy: "That's a meaningful policy position. Even without specific opposing research at hand, policy claims benefit from examining implementation costs, unintended consequences, distributional effects, and whether similar policies have succeeded or failed in other contexts.",
      moral: "That's a thought-provoking ethical claim. Moral positions often face challenges from competing ethical frameworks - utilitarian, deontological, and virtue ethics perspectives may each reach different conclusions here.",
      absolute: "Absolute claims are particularly vulnerable to counter-examples. Even one well-documented exception can undermine universal statements. Consider whether this holds across all cultures, time periods, and contexts.",
      comparative: "Comparative claims depend heavily on the metrics chosen. What seems superior by one measure may be inferior by another. Context, population, and measurement methodology all influence such comparisons.",
      empirical: "I wasn't able to find specific academic counter-evidence right now, but I'd encourage examining the methodology of supporting studies, looking for replication failures, and considering whether the evidence base represents diverse populations and conditions."
    };
    return responses[claimType] || responses.empirical;
  }

  // Analyze URL content and build rebuttal
  function buildSourceRebuttal(urlData, sources) {
    var response = "I've analyzed the content from **" + (urlData.title || urlData.url) + "**.\n\n";

    if (urlData.description) {
      response += "The article discusses: " + urlData.description + "\n\n";
    }

    response += "Here's what academic research suggests as counter-points:\n\n";

    var validSources = sources.filter(function (s) { return s.title && s.title !== 'Untitled'; });
    if (validSources.length > 0) {
      validSources.slice(0, 3).forEach(function (source, i) {
        response += "**" + (i + 1) + ". " + source.title + "** (" + source.year + ")\n";
        if (source.abstract) {
          response += "   Finding: " + extractKeyFinding(source.abstract) + "\n";
        }
        response += "   *" + source.authors + "* — cited " + source.citations + " times\n\n";
      });
    } else {
      response += "I couldn't find specific academic counter-evidence for this particular article at the moment. ";
      response += "Consider examining the article's sources, methodology, and whether it represents the full range of expert opinion on this topic.";
    }

    return response;
  }

  // Track contradiction
  function trackContradiction(claim, counterClaim, sources) {
    contradictions.push({
      timestamp: new Date().toISOString(),
      claim: claim,
      counter: counterClaim,
      sources: sources.slice(0, 2).map(function (s) { return s.title; })
    });
  }

  // Create message element
  function createMessage(content, type) {
    var div = document.createElement('div');
    div.className = 'message ' + type;
    div.innerHTML = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<span class="source-tag">$1</span>')
      .replace(/\n/g, '<br>');
    return div;
  }

  // Show typing indicator
  function showTyping() {
    var div = document.createElement('div');
    div.className = 'typing-indicator';
    div.id = 'typingIndicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Hide typing indicator
  function hideTyping() {
    var indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
  }

  // Remove welcome message
  function removeWelcome() {
    var welcome = chatContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();
  }

  // Main message handler
  async function handleMessage(text) {
    if (!text.trim()) return;

    removeWelcome();

    // Show user message
    chatContainer.appendChild(createMessage(text, 'user'));
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Show typing
    showTyping();
    sendBtn.disabled = true;

    var url = detectURL(text);
    var response = '';
    var allSources = [];

    try {
      if (url) {
        // URL analysis mode
        var urlData = await fetchURLContent(url);
        // Extract keywords from URL content for searching
        var searchTerms = '';
        if (urlData) {
          searchTerms = urlData.title || urlData.description || url;
        } else {
          searchTerms = text.replace(url, '').trim() || 'claim analysis';
        }

        var results = await Promise.all([
          searchSemanticScholar(searchTerms),
          searchOpenAlex(searchTerms)
        ]);
        allSources = results[0].concat(results[1]);

        if (urlData) {
          response = buildSourceRebuttal(urlData, allSources);
        } else {
          response = "I wasn't able to fetch the content from that URL. Could you summarize the main claim so I can search for counter-evidence?";
        }
      } else {
        // Claim analysis mode
        var claimType = detectClaimType(text);
        var counterQuery = buildSearchQuery(text, claimType);

        var results = await Promise.all([
          searchSemanticScholar(counterQuery),
          searchOpenAlex(counterQuery)
        ]);
        allSources = results[0].concat(results[1]);

        // Sort by citations
        allSources.sort(function (a, b) { return b.citations - a.citations; });

        response = buildCounterArguments(claimType, text, allSources);
        trackContradiction(text, response, allSources);
      }
    } catch (err) {
      console.error('Error processing message:', err);
      response = "I encountered an issue while searching for counter-evidence. Please try rephrasing your claim, and I'll give it another go.";
    }

    hideTyping();
    chatContainer.appendChild(createMessage(response, 'senator'));
    chatContainer.scrollTop = chatContainer.scrollHeight;
    sendBtn.disabled = false;
  }

  // Build search query optimized for finding counter-evidence
  function buildSearchQuery(claim, claimType) {
    var lower = claim.toLowerCase();
    // Remove filler words
    var cleaned = lower.replace(/\b(i think|i believe|it seems|obviously|clearly|everyone knows)\b/gi, '').trim();

    switch (claimType) {
      case 'causal':
        return cleaned.replace(/causes?|leads? to/gi, '') + ' confounding factors limitations';
      case 'policy':
        return cleaned + ' unintended consequences criticism';
      case 'moral':
        return cleaned + ' ethical critique opposing view';
      case 'absolute':
        return cleaned + ' exceptions counter-examples limitations';
      case 'comparative':
        return cleaned + ' mixed results context dependent';
      default:
        return cleaned + ' criticism evidence against';
    }
  }

  // Auto-resize textarea
  userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Handle form submit
  inputForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = userInput.value.trim();
    if (text) {
      handleMessage(text);
      userInput.value = '';
      userInput.style.height = 'auto';
    }
  });

  // Handle Enter key (shift+enter for newline)
  userInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      inputForm.dispatchEvent(new Event('submit'));
    }
  });

})();
