// Socratic Method Chat Application — Enhanced with Rhetoric & Debate
// Responds with probing questions, identifies logical fallacies,
// constructs counter-arguments, and uses classical rhetorical techniques

const chatContainer = document.getElementById('chatContainer');
const inputForm = document.getElementById('inputForm');
const userInput = document.getElementById('userInput');

// Conversation history for context-aware responses
let conversationHistory = [];
let debateContext = {
    userPositions: [],
    contradictions: [],
    fallaciesDetected: [],
    rhetoricalMoves: [],
    currentTopic: null,
    argumentStrength: 'unknown'
};


// ============================================================
// LOGICAL FALLACY DETECTION
// ============================================================
const logicalFallacies = {
    adHominem: {
        pattern: /\b(stupid|idiot|dumb|ignorant|fool|moron)\b.*\b(people|person|they|he|she|you)\b|\b(people|person|they|he|she|you)\b.*\b(stupid|idiot|dumb|ignorant|fool|moron)\b/i,
        name: "Ad Hominem",
        counter: "You're attacking the person rather than their argument. Even if someone is flawed, their reasoning might still be sound. Can you address the argument itself, separate from who's making it?"
    },
    strawman: {
        pattern: /\b(so you('re| are) saying|that means you think|you basically want|what you really mean)\b/i,
        name: "Straw Man",
        counter: "Be careful — you may be restating someone's position in a weaker form than they intended. What is the strongest version of the argument you're opposing?"
    },
    slipperySlope: {
        pattern: /\b(next thing|before you know it|will lead to|inevitably|soon enough|where does it end|opens the door)\b/i,
        name: "Slippery Slope",
        counter: "You're assuming one step inevitably leads to an extreme outcome. But is each link in that chain actually inevitable? Where might the progression stop, and why?"
    },
    falseDisjunction: {
        pattern: /\b(either|only two|you('re| are) either|it('s| is) either|no middle|pick a side|black and white)\b/i,
        name: "False Dilemma",
        counter: "You've framed this as an either/or choice. But are those really the only two options? What possibilities exist between — or entirely outside — the extremes you've presented?"
    },
    appealToAuthority: {
        pattern: /\b(experts say|scientists say|studies show|research proves|everyone agrees|all the experts)\b/i,
        name: "Appeal to Authority",
        counter: "Citing authority isn't wrong, but authority alone doesn't make something true. What is the actual reasoning or evidence behind what these experts claim? Could qualified people disagree?"
    },
    bandwagon: {
        pattern: /\b(everyone|most people|majority|popular|mainstream|nobody disagrees|common sense)\b/i,
        name: "Argumentum ad Populum",
        counter: "Popularity doesn't equal truth — the majority has been wrong many times throughout history. What makes this position correct independent of how many people hold it?"
    },
    appealToEmotion: {
        pattern: /\b(think of the children|imagine if|how would you feel|heartbreaking|devastating|terrifying)\b/i,
        name: "Appeal to Emotion",
        counter: "Emotions are powerful, but they can cloud reasoning. Setting the emotional weight aside for a moment — what is the logical case for your position?"
    },
    circularReasoning: {
        pattern: /\b(because it('s| is)|it('s| is) true because|the reason is that it|obviously because)\b/i,
        name: "Circular Reasoning",
        counter: "Your conclusion seems to be embedded in your premise. You're essentially saying 'X is true because X is true.' Can you find independent support for your claim?"
    },
    tuQuoque: {
        pattern: /\b(you (also|too|do it)|what about (when you|your)|hypocrit|look who('s| is) talking)\b/i,
        name: "Tu Quoque",
        counter: "Pointing out someone else's inconsistency doesn't actually address whether the argument itself is valid. Even hypocrites can make true statements. Does the argument stand on its own merits?"
    },
    noTrueScotsman: {
        pattern: /\b(real|true|actual)\s+(christian|muslim|liberal|conservative|patriot|feminist|man|woman|american)/i,
        name: "No True Scotsman",
        counter: "You're redefining the group to exclude counter-examples. But who gets to decide who qualifies as a 'real' member? Isn't that definition itself what's being debated?"
    }
};


// ============================================================
// RHETORICAL TECHNIQUES (Classical & Modern)
// ============================================================
const rhetoricalTechniques = {
    reductioAdAbsurdum: {
        trigger: /\b(always|never|all|none|every|no one|impossible|guaranteed)\b/i,
        responses: [
            "Let's take your claim to its logical extreme. If '{keyword}' is truly absolute, then {absurd_consequence}. Does that still hold?",
            "If we accept this without qualification, we arrive at some uncomfortable conclusions. For instance — if this is always true, what about {edge_case}?",
            "The word '{keyword}' carries a heavy burden. Can you think of even one exception? Because one exception transforms an absolute claim into something far more nuanced."
        ]
    },
    steelmanning: {
        trigger: /\b(disagree|wrong|bad idea|terrible|nonsense|ridiculous)\b/i,
        responses: [
            "Before you dismiss this view — what is the strongest possible version of the argument you're opposing? If you can defeat the best version, your objection is much more powerful.",
            "I notice you're quick to reject this. But intellectual honesty demands we engage with ideas at their strongest. What's the most charitable interpretation of the position you oppose?",
            "A skilled debater defeats the strongest form of an opponent's argument, not the weakest. What would a thoughtful proponent of this view say in response to your objection?"
        ]
    },
    dialectic: {
        trigger: /\b(but|however|on the other hand|although|yet|still)\b/i,
        responses: [
            "You see the tension. Good. Now — can you find a synthesis that honors both sides of this contradiction? What higher truth contains both of these apparently opposing ideas?",
            "You're holding two ideas in tension. Rather than choosing one, what if both contain partial truths? Where do they overlap, and what does that overlap reveal?",
            "This 'but' is where the real thinking begins. The easy positions are the ones with no contradictions. What would it look like to genuinely reconcile these competing claims?"
        ]
    },
    analogicalReasoning: {
        trigger: /\b(like|similar|same as|just as|equivalent|comparable|analogy)\b/i,
        responses: [
            "Analogies illuminate, but they also deceive. In what ways does your comparison break down? Where do the two cases differ in ways that matter?",
            "Every analogy has limits. You've shown me the similarity — now show me where it fails. What is importantly different about these two cases?",
            "An analogy is a tool, not a proof. At what point does your comparison stop being useful and start being misleading?"
        ]
    },
    concessionAndPivot: {
        trigger: /\b(i agree|you('re| are) right|fair point|granted|true but|yes but|i concede)\b/i,
        responses: [
            "You've conceded a point — that shows intellectual maturity. But I'm curious: does this concession weaken your original position, or can your argument survive it? How?",
            "Interesting. You've given ground. Now — does your central thesis still stand with this concession built in? Or does it require modification?",
            "A concession is not defeat — it's refinement. How does your position look now that you've acknowledged this? Is it stronger for having accommodated the objection, or has it fundamentally shifted?"
        ]
    },
    burdenOfProof: {
        trigger: /\b(prove|can('t| not) prove|burden|demonstrate|show me|evidence that)\b/i,
        responses: [
            "Who bears the burden of proof here? The one making the claim, or the one questioning it? And crucially — have you met that burden yourself?",
            "You're demanding proof. Fair enough. But what standard of proof would satisfy you? And is that the same standard you apply to your own beliefs?",
            "Proof is a high bar. What would count as sufficient evidence for you? If nothing could change your mind, is this really a reasoned position or an article of faith?"
        ]
    }
};


// ============================================================
// ARGUMENT STRUCTURE ANALYSIS
// ============================================================
const argumentIndicators = {
    premises: /\b(because|since|given that|as|for the reason|considering that|due to)\b/i,
    conclusions: /\b(therefore|thus|hence|so|consequently|it follows|this means|this proves)\b/i,
    qualifiers: /\b(maybe|perhaps|possibly|probably|likely|might|could|sometimes)\b/i,
    absolutes: /\b(always|never|all|none|every|no one|impossible|certain|definitely|undeniably)\b/i,
    hedging: /\b(i think|i feel|in my opinion|it seems|i guess|sort of|kind of|somewhat)\b/i,
    strongClaims: /\b(the fact is|the truth is|clearly|obviously|undeniably|without question|beyond doubt)\b/i
};

// Counter-argument generation templates
const counterArgumentTemplates = {
    empirical: [
        "What if the data showed the opposite? How would you explain cases where {negation}?",
        "Consider: for every study supporting this, there may be one showing the contrary. Have you sought out disconfirming evidence?",
        "If we gathered 100 examples, how many would actually support your claim? Is the pattern as strong as you suggest?"
    ],
    logical: [
        "Your argument requires {premise} to be true. But what if it isn't? Your conclusion collapses without that foundation.",
        "There's a hidden step in your reasoning — you're moving from '{claim_a}' to your conclusion without justifying the connection. What bridges that gap?",
        "This argument would also prove {unwanted_conclusion} if applied consistently. Are you prepared to accept that consequence?"
    ],
    definitional: [
        "Much depends on how we define '{keyword}.' If we defined it differently, would your argument still hold?",
        "You and your opponent may actually agree on the facts but disagree on definitions. What precisely do you mean by '{keyword}'?",
        "Words carry hidden assumptions. When you say '{keyword},' you're smuggling in a particular worldview. Is that the only valid way to frame this?"
    ],
    pragmatic: [
        "Even if you're correct in theory, what happens when we try to apply this in the real world? Theory and practice often diverge.",
        "Let's say you win this argument. What changes? What would the practical consequences of widespread acceptance actually look like?",
        "Being right and being useful aren't always the same thing. Is this position actionable? Does it lead somewhere productive?"
    ]
};


// ============================================================
// DEBATE MODES & SOCRATIC QUESTIONING
// ============================================================
const questioningStrategies = {
    clarification: [
        "What do you mean when you say '{keyword}'?",
        "Could you put that another way — preferably in a way your opponent would accept as fair?",
        "What do you think is the crux of the disagreement here?",
        "Can you give me a concrete example that illustrates your point?",
        "How would you explain this to someone who holds the opposite view?",
        "Strip away the rhetoric — what is the core claim you're making?",
        "When you say that, what hidden premises are doing the work?"
    ],
    assumptions: [
        "What are you taking for granted that an opponent would challenge?",
        "Is that always the case, or are there exceptions that threaten your rule?",
        "What foundational beliefs must someone share to accept your argument?",
        "What would have to be true for your view to be demonstrably wrong?",
        "You've built your argument on certain ground. How solid is that ground, really?",
        "What if the opposite were true — could you construct an equally compelling case?",
        "Which of your premises is weakest? An honest debater attacks their own weakest link first."
    ],
    evidence: [
        "What evidence would distinguish your position from its competitors?",
        "How do you know this — through reason, experience, testimony, or intuition? Each has different reliability.",
        "If you were a prosecutor, would this evidence survive cross-examination?",
        "Is there anything that contradicts your view? Have you actively looked?",
        "If you had to convince the most rigorous skeptic in the room, what single piece of evidence would you lead with?",
        "Your evidence supports your conclusion. But does it also support other conclusions you don't accept?",
        "What would falsify your claim? If nothing could, you're holding a faith position, not a reasoned one."
    ],
    perspectives: [
        "You've made your case. Now argue the opposite position with equal vigor. What's the best argument against you?",
        "How would the most sophisticated version of your opponent respond to what you just said?",
        "You're seeing one facet. Rotate the diamond — what does this look like from the other sides?",
        "Whose voices are missing from this conversation? What would they say?",
        "If you were hired to defeat your own argument in a debate, where would you attack?",
        "Perspective is not just opinion — it's what you can see from where you stand. Move. What's visible from elsewhere?",
        "The test of a first-rate intelligence is the ability to hold two opposed ideas and still function. Can you hold both sides simultaneously?"
    ],
    consequences: [
        "If your argument wins, what world does it create? Is that the world you want?",
        "Follow this thread to its endpoint. Where does this logic ultimately terminate?",
        "If we universalized this principle, what would society look like? Can it survive universalization?",
        "What are the second-order effects? Not just what happens — what happens after that?",
        "Every position has costs. What are you willing to sacrifice for this conclusion?",
        "Arguments don't exist in a vacuum. What does accepting this require you to accept about other issues?",
        "If you're wrong about this, what's the damage? What's at stake in this being incorrect?"
    ],
    metaQuestions: [
        "Why are you defending this position? Is it because you've reasoned your way there, or because it's psychologically comfortable?",
        "Notice your resistance to this line of questioning. What does that resistance tell you?",
        "Are you trying to find the truth, or are you trying to win? Those are different goals.",
        "What would it cost you — emotionally, socially, identity-wise — to change your mind about this?",
        "Is this a belief you chose, or one that chose you?",
        "If you discovered tomorrow that you were wrong, what would you feel? Relief? Threat? That feeling tells you something important.",
        "We've been circling something. What's the question underneath the question?"
    ]
};

// Topic detection patterns (expanded for debate contexts)
const topicPatterns = {
    belief: /\b(believe|think|feel|opinion|view|sure|certain|know|truth|conviction)\b/i,
    morality: /\b(right|wrong|good|bad|evil|moral|ethical|should|ought|fair|just|virtue|vice)\b/i,
    identity: /\b(i am|i'm|my identity|who i|myself|self|personality|character|we are)\b/i,
    knowledge: /\b(know|learn|understand|wise|wisdom|ignorant|education|truth|fact|evidence|proof)\b/i,
    purpose: /\b(purpose|meaning|why|reason|goal|point|matter|worth|value|significance)\b/i,
    emotion: /\b(happy|sad|angry|fear|love|hate|anxious|depressed|joy|content|outraged)\b/i,
    relationship: /\b(friend|family|love|partner|people|social|trust|together|alone|community)\b/i,
    success: /\b(success|fail|achieve|goal|ambition|career|money|rich|poor|win|lose)\b/i,
    change: /\b(change|different|new|old|transform|grow|evolve|stuck|same|progress|regress)\b/i,
    freedom: /\b(free|freedom|choice|decide|control|power|liberty|constrain|rights|autonomy)\b/i,
    politics: /\b(government|policy|law|political|democrat|republican|liberal|conservative|vote|tax)\b/i,
    justice: /\b(justice|injustice|equality|inequality|privilege|oppression|rights|discrimination)\b/i,
    technology: /\b(technology|ai|artificial|algorithm|data|privacy|internet|digital|automation)\b/i,
    philosophy: /\b(philosophy|exist|reality|consciousness|mind|soul|metaphysic|ontolog|epistem)\b/i
};


// ============================================================
// CORE RESPONSE ENGINE
// ============================================================

function generateSocraticResponse(userMessage) {
    const message = userMessage.toLowerCase().trim();
    
    // 1. Check for logical fallacies first
    const fallacy = detectFallacy(message);
    if (fallacy) {
        debateContext.fallaciesDetected.push(fallacy.name);
        return buildFallacyResponse(fallacy, message);
    }
    
    // 2. Check for rhetorical technique opportunities
    const rhetoric = detectRhetoricalOpportunity(message);
    if (rhetoric) {
        debateContext.rhetoricalMoves.push(rhetoric.trigger);
        return buildRhetoricalResponse(rhetoric, message);
    }
    
    // 3. Analyze argument structure
    const argAnalysis = analyzeArgument(message);
    
    // 4. Track user positions for contradiction detection
    trackPosition(userMessage);
    
    // 5. Check for contradictions with earlier statements
    const contradiction = detectContradiction(userMessage);
    if (contradiction) {
        return buildContradictionResponse(contradiction, message);
    }
    
    // 6. Detect topics
    const detectedTopics = [];
    for (const [topic, pattern] of Object.entries(topicPatterns)) {
        if (pattern.test(message)) {
            detectedTopics.push(topic);
        }
    }
    
    // 7. Select and build response using argument-aware strategy
    let strategy = selectStrategy(detectedTopics, message, argAnalysis);
    let response = buildResponse(strategy, message, detectedTopics, argAnalysis);
    
    return response;
}

function detectFallacy(message) {
    for (const [key, fallacy] of Object.entries(logicalFallacies)) {
        if (fallacy.pattern.test(message)) {
            return fallacy;
        }
    }
    return null;
}

function detectRhetoricalOpportunity(message) {
    // Only trigger rhetorical techniques after initial exchanges
    if (conversationHistory.length < 2) return null;
    
    for (const [key, technique] of Object.entries(rhetoricalTechniques)) {
        if (technique.trigger.test(message)) {
            // 60% chance to use rhetorical technique (variety)
            if (Math.random() < 0.6) {
                return technique;
            }
        }
    }
    return null;
}

function analyzeArgument(message) {
    return {
        hasPremise: argumentIndicators.premises.test(message),
        hasConclusion: argumentIndicators.conclusions.test(message),
        hasQualifier: argumentIndicators.qualifiers.test(message),
        hasAbsolute: argumentIndicators.absolutes.test(message),
        isHedging: argumentIndicators.hedging.test(message),
        isStrongClaim: argumentIndicators.strongClaims.test(message),
        wordCount: message.split(/\s+/).length,
        sentenceCount: message.split(/[.!?]+/).filter(s => s.trim()).length
    };
}

function trackPosition(message) {
    // Store key claims for contradiction detection
    const claimIndicators = /\b(i (believe|think|feel)|my (view|position|stance) is|the (truth|fact|reality) is)\b/i;
    if (claimIndicators.test(message) || message.length > 50) {
        debateContext.userPositions.push({
            message: message,
            timestamp: Date.now(),
            turn: conversationHistory.length
        });
    }
}

function detectContradiction(currentMessage) {
    if (debateContext.userPositions.length < 2) return null;
    
    const current = currentMessage.toLowerCase();
    const negationPairs = [
        [/\bi (love|like|enjoy|support)\b/, /\bi (hate|dislike|oppose|reject)\b/],
        [/\b(always|never)\b/, /\b(sometimes|occasionally|depends)\b/],
        [/\b(everyone|all people)\b/, /\b(not everyone|some people|few)\b/],
        [/\b(is (good|right|correct))\b/, /\b(is (bad|wrong|incorrect))\b/],
        [/\b(should|must|need to)\b/, /\b(shouldn't|mustn't|don't need)\b/],
        [/\b(important|matters|significant)\b/, /\b(unimportant|doesn't matter|trivial)\b/]
    ];
    
    for (const pos of debateContext.userPositions.slice(0, -1)) {
        const earlier = pos.message.toLowerCase();
        for (const [patternA, patternB] of negationPairs) {
            if ((patternA.test(earlier) && patternB.test(current)) ||
                (patternB.test(earlier) && patternA.test(current))) {
                return { earlier: pos.message, current: currentMessage, turn: pos.turn };
            }
        }
    }
    return null;
}


// ============================================================
// RESPONSE BUILDERS
// ============================================================

function buildFallacyResponse(fallacy, message) {
    const preambles = [
        `Careful — I detect a potential ${fallacy.name} in your reasoning. `,
        `Hold on. There's a logical misstep here — this looks like ${fallacy.name}. `,
        `A skilled opponent would identify this as ${fallacy.name}. Let me explain why: `,
        `I want to help you argue better, so I'll point this out: this reasoning resembles ${fallacy.name}. `
    ];
    const preamble = preambles[Math.floor(Math.random() * preambles.length)];
    
    const followUps = [
        "\n\nCan you reformulate your point without this logical shortcut?",
        "\n\nHow would you make this same point using only logic and evidence?",
        "\n\nTry again — but this time, argue as though your audience is hostile and brilliant.",
        "\n\nWhat would your argument look like if you steelmanned the opposition first?"
    ];
    const followUp = followUps[Math.floor(Math.random() * followUps.length)];
    
    return preamble + fallacy.counter + followUp;
}

function buildRhetoricalResponse(technique, message) {
    const responses = technique.responses;
    let response = responses[Math.floor(Math.random() * responses.length)];
    response = personalizeQuestion(response, message);
    response = fillRhetoricalPlaceholders(response, message);
    return response;
}

function buildContradictionResponse(contradiction, message) {
    const templates = [
        `Interesting. Earlier you said: "${truncate(contradiction.earlier, 60)}"\n\nBut now you seem to be saying something different. Both cannot be true simultaneously. Which position do you actually hold — and what changed?`,
        `I'm going to press you here. Your current statement appears to contradict something you said earlier: "${truncate(contradiction.earlier, 60)}"\n\nA consistent worldview requires reconciling these two claims. Can you do that, or will you abandon one?`,
        `A good debater would catch this: you seem to be contradicting yourself. Before, you suggested: "${truncate(contradiction.earlier, 60)}"\n\nNow you're saying the opposite. Is this evolution of thought, or inconsistency? Either is fine — but you need to own it.`,
        `Wait. Let's rewind. You previously argued: "${truncate(contradiction.earlier, 60)}"\n\nThat sits uneasily with what you just said. In rhetoric, this is called inconsistency — and it's the most devastating weakness an opponent can exploit. How do you reconcile these positions?`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
}

function selectStrategy(topics, message, argAnalysis) {
    const turnCount = conversationHistory.length;
    
    // If user makes a strong claim without evidence: demand evidence
    if (argAnalysis.isStrongClaim && !argAnalysis.hasPremise) {
        return 'evidence';
    }
    
    // If user uses absolutes: challenge assumptions
    if (argAnalysis.hasAbsolute) {
        return 'assumptions';
    }
    
    // Early in conversation: clarification
    if (turnCount <= 2) {
        return 'clarification';
    }
    
    // If user is hedging too much: push for commitment
    if (argAnalysis.isHedging) {
        return 'evidence';
    }
    
    // If user provides structured argument (premise + conclusion): attack from perspectives
    if (argAnalysis.hasPremise && argAnalysis.hasConclusion) {
        return 'perspectives';
    }
    
    // Topic-based selection
    if (topics.includes('morality') || topics.includes('justice')) return 'perspectives';
    if (topics.includes('purpose') || topics.includes('change')) return 'consequences';
    if (topics.includes('philosophy') || topics.includes('knowledge')) return 'assumptions';
    if (topics.includes('politics') || topics.includes('freedom')) return 'perspectives';
    
    // Deep in conversation: meta-questions
    if (turnCount > 6) return 'metaQuestions';
    
    // Default: rotate with bias toward argument-challenging strategies
    const weightedStrategies = ['assumptions', 'evidence', 'perspectives', 'consequences', 'evidence', 'assumptions'];
    return weightedStrategies[turnCount % weightedStrategies.length];
}

function buildResponse(strategy, message, topics, argAnalysis) {
    const questions = questioningStrategies[strategy];
    let selectedQuestions = [];
    let shuffled = [...questions].sort(() => Math.random() - 0.5);
    
    // Always pick at least one question
    selectedQuestions.push(shuffled[0]);
    
    // Add counter-argument if user made a structured claim (50% chance)
    if (argAnalysis.hasPremise && Math.random() < 0.5) {
        const counterArg = generateCounterArgument(message, topics);
        if (counterArg) {
            selectedQuestions.push(counterArg);
        }
    }
    // Otherwise sometimes add a second question from another strategy (40% chance)
    else if (Math.random() < 0.4 && conversationHistory.length > 1) {
        const otherStrategies = Object.keys(questioningStrategies).filter(s => s !== strategy);
        const otherStrategy = otherStrategies[Math.floor(Math.random() * otherStrategies.length)];
        const otherQuestions = questioningStrategies[otherStrategy];
        selectedQuestions.push(otherQuestions[Math.floor(Math.random() * otherQuestions.length)]);
    }

    // Build contextual preamble with debate awareness
    let preamble = getContextualPreamble(message, topics, argAnalysis);
    
    // Compose final response
    let response = preamble;
    selectedQuestions.forEach((q, i) => {
        q = personalizeQuestion(q, message);
        response += (i > 0 ? '\n\n' : '') + q;
    });
    
    return response;
}

function generateCounterArgument(message, topics) {
    // Select counter-argument type based on content
    let type = 'logical';
    if (topics.includes('knowledge') || topics.includes('belief')) type = 'empirical';
    if (topics.includes('identity') || topics.includes('philosophy')) type = 'definitional';
    if (topics.includes('politics') || topics.includes('success')) type = 'pragmatic';
    
    const templates = counterArgumentTemplates[type];
    let counter = templates[Math.floor(Math.random() * templates.length)];
    counter = personalizeQuestion(counter, message);
    return counter;
}


// ============================================================
// PREAMBLE & TEXT UTILITIES
// ============================================================

function getContextualPreamble(message, topics, argAnalysis) {
    // Debate-aware preambles
    if (argAnalysis.isStrongClaim) {
        const strongPreambles = [
            "Bold claim. Let's stress-test it. ",
            "You state this with confidence. Confidence is not evidence. ",
            "A strong assertion demands strong justification. ",
            "You've planted your flag. Now defend the hill: "
        ];
        return strongPreambles[Math.floor(Math.random() * strongPreambles.length)];
    }
    
    if (argAnalysis.isHedging) {
        const hedgePreambles = [
            "You're hedging. Commit to a position so we can examine it properly. ",
            "I notice you're qualifying heavily. What would it take for you to say this with conviction? ",
            "'I think' and 'maybe' protect you from being wrong — but they also prevent real engagement. ",
            "Tentativeness can be wisdom or avoidance. Which is it here? "
        ];
        return hedgePreambles[Math.floor(Math.random() * hedgePreambles.length)];
    }
    
    if (argAnalysis.hasPremise && argAnalysis.hasConclusion) {
        const structuredPreambles = [
            "You've given me a structured argument. Good. Now let me find the cracks: ",
            "I see your reasoning: premise to conclusion. Let me test the bridge between them: ",
            "A formal argument — let's see if it survives scrutiny. ",
            "You've shown your logic. Now I'll probe its foundations: "
        ];
        return structuredPreambles[Math.floor(Math.random() * structuredPreambles.length)];
    }

    const topicPreambles = {
        belief: [
            "A conviction exposed for examination. ",
            "You hold this as true. Let's see if truth holds you back. ",
            "Belief is easy; justification is hard. "
        ],
        morality: [
            "Moral claims are the hardest to defend rationally. ",
            "You invoke right and wrong. But whose framework? ",
            "Ethics — where certainty goes to die. Let's examine: "
        ],
        identity: [
            "You speak of who you are. But identity is a story we tell ourselves. ",
            "The self is constructed, not discovered. What built yours? ",
            "A claim about identity. Let's see what's beneath it: "
        ],
        knowledge: [
            "Knowledge claims require the highest standard of justification. ",
            "You say you know. But knowing that you know is a different matter entirely. ",
            "The pursuit of knowledge begins with admitting ignorance: "
        ],
        politics: [
            "Political positions are often emotional convictions dressed in rational clothing. ",
            "In politics, we rarely argue facts — we argue values. Which values are you defending? ",
            "A political claim. Let's separate the ideology from the argument: "
        ],
        justice: [
            "Justice is contested territory. Every theory of justice excludes someone. ",
            "You invoke justice. But justice for whom, and at whose expense? ",
            "Claims about fairness require a framework. Which one are you using? "
        ],
        philosophy: [
            "Now we're in deep water. Philosophical claims demand philosophical rigor. ",
            "You're touching bedrock questions. Let's dig: ",
            "Philosophy begins in wonder and ends in more wonder. Consider: "
        ],
        default: [
            "Let's examine this with the rigor it deserves. ",
            "An interesting claim. Now defend it: ",
            "I hear your position. Now I'll test it: ",
            "Let's subject this to scrutiny. ",
            "Very well — let me challenge you: "
        ]
    };
    
    let category = 'default';
    for (const topic of topics) {
        if (topicPreambles[topic]) {
            category = topic;
            break;
        }
    }
    
    const options = topicPreambles[category];
    return options[Math.floor(Math.random() * options.length)];
}

function personalizeQuestion(question, message) {
    if (question.includes('{keyword}')) {
        const words = message.split(/\s+/).filter(w => w.length > 4 && !/^(about|their|there|these|those|which|would|could|should|because|always|never)$/i.test(w));
        const keyword = words.length > 0 
            ? words[Math.floor(Math.random() * words.length)] 
            : 'that';
        question = question.replace(/\{keyword\}/g, keyword.replace(/[^a-zA-Z'-]/g, ''));
    }
    return question;
}

function fillRhetoricalPlaceholders(text, message) {
    // Fill in rhetorical placeholders with contextual content
    const words = message.split(/\s+/).filter(w => w.length > 3);
    
    if (text.includes('{absurd_consequence}')) {
        const consequences = [
            "no exceptions could ever exist",
            "we'd have to accept some deeply uncomfortable conclusions",
            "it would apply even in cases where it clearly shouldn't",
            "the principle would destroy itself in edge cases"
        ];
        text = text.replace('{absurd_consequence}', consequences[Math.floor(Math.random() * consequences.length)]);
    }
    
    if (text.includes('{edge_case}')) {
        const edgeCases = [
            "the cases at the margins",
            "situations involving competing values",
            "circumstances where your rule harms the innocent",
            "the hard cases that test every principle"
        ];
        text = text.replace('{edge_case}', edgeCases[Math.floor(Math.random() * edgeCases.length)]);
    }
    
    if (text.includes('{negation}')) {
        const negations = [
            "the opposite pattern was observed",
            "your explanation failed to predict outcomes",
            "people acted contrary to your model",
            "the evidence pointed the other way"
        ];
        text = text.replace('{negation}', negations[Math.floor(Math.random() * negations.length)]);
    }
    
    if (text.includes('{premise}')) {
        const premises = [
            "a particular definition holding universally",
            "human nature being as you describe it",
            "the current conditions remaining stable",
            "your framing being the only valid one"
        ];
        text = text.replace('{premise}', premises[Math.floor(Math.random() * premises.length)]);
    }
    
    if (text.includes('{claim_a}')) {
        const firstWords = words.slice(0, 4).join(' ') || 'your initial premise';
        text = text.replace('{claim_a}', firstWords);
    }
    
    if (text.includes('{unwanted_conclusion}')) {
        const unwanted = [
            "things you'd find unacceptable",
            "conclusions that undermine your other beliefs",
            "results that no one would endorse",
            "positions you'd reject in other contexts"
        ];
        text = text.replace('{unwanted_conclusion}', unwanted[Math.floor(Math.random() * unwanted.length)]);
    }
    
    return text;
}

function truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
}


// ============================================================
// UI FUNCTIONS
// ============================================================

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = sender === 'socrates' ? '&#x1F3DB;' : '&#x1F464;';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Split text into paragraphs
    const paragraphs = text.split('\n\n');
    paragraphs.forEach(p => {
        const pElement = document.createElement('p');
        pElement.textContent = p;
        contentDiv.appendChild(pElement);
    });
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    
    scrollToBottom();
}

function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message socrates';
    typingDiv.id = 'typingIndicator';
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = '&#x1F3DB;';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = `
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    
    typingDiv.appendChild(avatarDiv);
    typingDiv.appendChild(contentDiv);
    chatContainer.appendChild(typingDiv);
    
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Auto-resize textarea
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Handle Enter key (Shift+Enter for newline)
userInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        inputForm.dispatchEvent(new Event('submit'));
    }
});

// Handle form submission
inputForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const message = userInput.value.trim();
    if (!message) return;
    
    // Add user message
    addMessage(message, 'user');
    conversationHistory.push({ role: 'user', content: message });
    
    // Clear input
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // Show typing indicator
    addTypingIndicator();
    
    // Simulate thinking time (longer for more complex responses)
    const thinkTime = Math.min(1000 + message.length * 12, 3000);
    
    setTimeout(() => {
        removeTypingIndicator();
        
        // Generate and display Socratic response
        const response = generateSocraticResponse(message);
        addMessage(response, 'socrates');
        conversationHistory.push({ role: 'socrates', content: response });
    }, thinkTime);
});

// Focus input on load
window.addEventListener('load', () => {
    userInput.focus();
});
