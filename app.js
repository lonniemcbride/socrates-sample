// Socratic Method Chat Application — Enhanced with Rhetoric, Debate & Counter-Arguments
// Actively constructs counter-arguments, identifies logical weaknesses,
// pokes holes in reasoning, and challenges every claim with opposing positions

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
    argumentStrength: 'unknown',
    claimsToChallenge: [],
    weaknessesExploited: []
};


// ============================================================
// HOLE-POKING ENGINE — Identifies specific weaknesses in statements
// ============================================================
const weaknessDetectors = {
    unsupportedCausation: {
        pattern: /\b(\w+)\s+(causes?|leads?\s+to|results?\s+in|creates?|produces?|makes?)\s+(.+)/i,
        poke: (match, message) => {
            const cause = match[1];
            const effect = match[3].split(/[.,!?]/)[0];
            return [
                `You claim ${cause} causes ${effect}. But correlation isn't causation. What mechanism connects the two? Could there be a third factor causing both?`,
                `"${cause} causes ${effect}" — that's a causal claim, and causal claims require more than observation. Have you eliminated alternative explanations? What if ${effect} was already happening for other reasons?`,
                `Interesting causal claim. Let me poke at it: how do you rule out reverse causation? What if ${effect} actually contributes to ${cause}, rather than the other way around?`
            ];
        }
    },
    overgeneralization: {
        pattern: /\b(all|every|always|never|no one|everyone|nobody|everywhere|nowhere)\s+(.+)/i,
        poke: (match, message) => {
            const absolute = match[1];
            const claim = match[2].split(/[.,!?]/)[0];
            return [
                `"${absolute} ${claim}" — really? Every single case? I only need one counterexample to demolish an absolute claim. Can you think of one yourself, or shall I?`,
                `You've universalized this: "${absolute} ${claim}." The moment I find one exception, your argument collapses from a law into a tendency. And tendencies require different justifications than laws. Do you want to revise to something more defensible?`,
                `Absolute claims are the easiest to defeat in debate. "${absolute} ${claim}" — your opponent only needs a single counterexample. I suspect you don't actually mean this universally. What's the more precise claim hiding behind this overstatement?`
            ];
        }
    },
    hiddenValueJudgment: {
        pattern: /\b(is|are|was|were)\s+(better|worse|superior|inferior|more important|less important|the best|the worst)\b/i,
        poke: (match, message) => {
            return [
                `"Better" according to what standard? You've smuggled a value judgment into what sounds like a factual claim. By whose criteria is this better? Who decides?`,
                `You say something "is better" — but that's not a fact, it's a judgment. Every comparative claim depends on unstated criteria. What criteria are you using, and why should I accept those criteria?`,
                `This is a value claim masquerading as an observation. "Better" for whom? By what metric? Under what circumstances? If you change the criteria, does your ranking survive?`
            ];
        }
    },
    falseEquivalence: {
        pattern: /\b(same\s+(as|thing)|no\s+different|just\s+like|exactly\s+like|equivalent\s+to|identical\s+to)\b/i,
        poke: (match, message) => {
            return [
                `You're equating two things. But are they really the same? What are the differences you're glossing over? Two things can share features while being fundamentally distinct in ways that matter.`,
                `This equivalence does a lot of work in your argument. But if I pulled at the seams, where would it unravel? What's different about these two cases that you're asking me to ignore?`,
                `"The same as" — is it though? Or is this a rhetorical move to transfer the legitimacy of one thing onto another? Where specifically does this comparison break down?`
            ];
        }
    },
    unfoundedPrediction: {
        pattern: /\b(will|going\s+to|is\s+going|bound\s+to|destined\s+to|guaranteed\s+to|inevitably\s+will)\s+(.+)/i,
        poke: (match, message) => {
            const prediction = match[2].split(/[.,!?]/)[0];
            return [
                `You're predicting the future: "${prediction}." What's your track record on predictions? Humans are notoriously bad at forecasting. What makes you confident about this specific outcome?`,
                `A prediction: "${prediction}." But predictions require models, and models have assumptions. What assumptions undergird this prediction? What would have to change for it to fail?`,
                `You say this will happen. But consider: how many "inevitable" outcomes never materialized? What's the strongest case that this prediction is wrong? History is full of confident predictions that look foolish in hindsight.`
            ];
        }
    },
    appealToNature: {
        pattern: /\b(natural|unnatural|nature\s+intended|meant\s+to\s+be|designed\s+to|how\s+it('s|\s+is)\s+supposed)\b/i,
        poke: (match, message) => {
            return [
                `You're appealing to "nature" — but nature is descriptive, not prescriptive. Arsenic is natural; medicine is artificial. "Natural" doesn't mean good, and "unnatural" doesn't mean bad. What's the actual argument here?`,
                `The naturalistic fallacy: assuming what is natural is right. Nature includes parasites, cancer, and extinction events. Are you sure "natural" is the standard you want to use?`,
                `"Natural" is doing heavy lifting here. Smallpox was natural; vaccines are artificial. Human flight is unnatural. Clearly naturalness alone can't determine value. What's the real reason behind your position?`
            ];
        }
    },
    missingNuance: {
        pattern: /\b(simple|simply|obviously|just|merely|only)\s+(.+)/i,
        poke: (match, message) => {
            const claim = match[2].split(/[.,!?]/)[0];
            return [
                `"Simply ${claim}" — if it were truly simple, it wouldn't be debated. What complexity are you flattening? Simple explanations for complex phenomena are almost always wrong.`,
                `You're reducing something complex to something "simple." That might be elegant, or it might be dangerously reductive. What are you leaving out? What complicating factors have you swept under the rug?`,
                `The word "simply" or "just" is a red flag in any argument. It suggests you're pretending away inconvenient complexity. What about this isn't simple? What are the exceptions, edge cases, and complicating factors?`
            ];
        }
    },
    survivorshipBias: {
        pattern: /\b(successful\s+people|winners?|the\s+best|top\s+performers?|great\s+(leaders?|companies|minds))\s+(all|always|usually)\b/i,
        poke: (match, message) => {
            return [
                `You're looking only at the winners. But what about everyone who did the same things and failed? Survivorship bias: we study successes and ignore the graveyard of identical attempts that didn't make it.`,
                `This is survivorship bias. You're drawing conclusions from the survivors while ignoring the vast majority who did the same thing and failed silently. What did the failures look like?`,
                `You're generalizing from success stories. But for every success you can point to, there may be thousands of identical attempts that failed. The successful ones don't prove the method — they might just prove luck.`
            ];
        }
    },
    vagueClaim: {
        pattern: /\b(society|people|they|the system|the world|things)\s+(should|need\s+to|must|have\s+to)\s+(.+)/i,
        poke: (match, message) => {
            const subject = match[1];
            const action = match[3].split(/[.,!?]/)[0];
            return [
                `"${subject} should ${action}" — who specifically? How specifically? Vague prescriptions are unfalsifiable and therefore useless in debate. Get concrete: who does what, by when, at what cost?`,
                `This is too abstract to engage with rigorously. "${subject}" isn't an agent — it can't do anything. Who specifically should act? What specific mechanism would achieve this? What tradeoffs are involved?`,
                `When you say "${subject} should ${action}" — you've hidden all the hard questions. Who pays for it? Who decides? What are the second-order effects? Abstract should-statements are easy. Concrete plans are hard.`
            ];
        }
    },
    sunkCostThinking: {
        pattern: /\b(already\s+invested|come\s+this\s+far|too\s+late\s+to|can('t|\s+not)\s+stop\s+now|after\s+all\s+(this|that|we've))\b/i,
        poke: (match, message) => {
            return [
                `You're reasoning from sunk costs. But past investment is irrelevant to future decisions. The only question is: from where you stand NOW, what's the best path forward? The past is paid for either way.`,
                `This sounds like sunk cost reasoning: 'we've already invested, so we must continue.' But throwing good money after bad doesn't become rational just because you've thrown a lot of bad money. What if you could start fresh today?`,
                `The sunk cost fallacy: feeling obligated to continue because of past investment. But would you start this from scratch today, knowing what you know? If not, the past investment is a reason to stop, not continue.`
            ];
        }
    }
};


// ============================================================
// ACTIVE COUNTER-ARGUMENT CONSTRUCTION
// ============================================================

// Constructs actual opposing positions, not just questions
const counterPositionBuilders = {
    // When user makes a moral claim, construct the opposing moral position
    moralCounter: {
        trigger: /\b(should|ought|must|wrong\s+to|right\s+to|duty|obligation|immoral|unethical)\b/i,
        build: (message) => {
            const stances = [
                `Let me argue the opposite: What if this "duty" you describe is actually a form of control? Obligations aren't self-justifying — they require foundations. And many obligations we once considered sacred (obedience to kings, rigid gender roles) we now reject. What makes yours different?`,
                `Here's the counter-position: moral "oughts" often reflect the values of those in power, not universal truths. Your moral claim might be a cultural artifact disguised as a timeless principle. How would you respond to a moral relativist who says your "should" is just your tribe's preference?`,
                `I'll take the opposite side: Your moral claim assumes a particular theory of ethics. A utilitarian, a virtue ethicist, and a deontologist would each evaluate this differently — and might reach opposite conclusions. Which framework justifies YOUR position, and why should we accept that framework?`,
                `Counter-argument: Every moral rule creates moral dilemmas when taken seriously. Your principle here — if applied consistently — would produce outcomes you yourself would find troubling. Should I construct the scenario that breaks your rule, or can you already see where it fails?`
            ];
            return stances[Math.floor(Math.random() * stances.length)];
        }
    },
    
    // When user makes a factual/empirical claim, construct alternative explanation
    empiricalCounter: {
        trigger: /\b(research\s+shows|studies?\s+(show|prove|demonstrate)|data\s+(shows?|proves?)|statistics?|evidence\s+(shows?|proves?|suggests?))\b/i,
        build: (message) => {
            const counters = [
                `Let me challenge your evidence: Research also shows publication bias — studies that confirm hypotheses get published, disconfirming ones don't. The "research" you cite exists in an ecosystem that rewards positive results. How do you account for the file drawer problem?`,
                `Counter-argument: Data doesn't interpret itself. The same dataset can support different conclusions depending on methodology, framing, and which variables you control for. Your interpretation of the evidence isn't the only one. What's an alternative reading of the same data?`,
                `I'll push back: "Studies show" is one of the weakest appeals in rigorous debate. Which studies? What was the sample size? Has it been replicated? What percentage of published findings in this field have failed replication? Your confidence should be proportional to the quality of evidence, not just its existence.`,
                `Here's my counter: Even if the data is solid, you're making an inferential leap from "what is" to "what this means." Correlation studies don't prove mechanism. Observational data can't establish causation. And meta-analyses are only as good as the studies they aggregate. Where specifically is the gap between your evidence and your conclusion?`
            ];
            return counters[Math.floor(Math.random() * counters.length)];
        }
    },
    
    // When user makes a political/policy claim
    policyCounter: {
        trigger: /\b(government|policy|law|regulation|tax|ban|mandate|require|legislation|vote|elect)\b/i,
        build: (message) => {
            const counters = [
                `Here's the opposing position: Every policy creates winners and losers. You've identified the winners of your proposal. But who loses? What are the unintended consequences? Policies interact with complex systems — the second and third-order effects often overwhelm the intended first-order effects.`,
                `Counter-argument: You're proposing a solution. But does the problem actually require this solution? Might the cure be worse than the disease? What happens when this policy is administered by flawed institutions staffed by imperfect people with their own incentives?`,
                `Let me construct the opposition: Your policy assumes government can effectively execute this. But implementation is where most policies fail. The gap between "we should do X" and "X was successfully done" is enormous. What's your theory of implementation? How does this survive contact with reality?`,
                `I'll argue against you: Every restriction you propose on others could someday be used against you. Every power you grant to institutions will be wielded by people you didn't choose. Have you run this through the "worst person" test — what happens when the worst possible administrator controls this policy?`
            ];
            return counters[Math.floor(Math.random() * counters.length)];
        }
    },
    
    // When user makes a claim about human nature or psychology
    humanNatureCounter: {
        trigger: /\b(people\s+are|humans?\s+are|human\s+nature|we\s+are\s+(all|naturally|inherently)|innate(ly)?|hardwired|evolved\s+to)\b/i,
        build: (message) => {
            const counters = [
                `Counter-argument: Claims about "human nature" have historically been used to justify whatever the speaker already believed. Slavery was "natural." Patriarchy was "natural." What seems like human nature is often just cultural conditioning so deep it feels innate.`,
                `I'll argue the opposite: Human behavior is remarkably plastic. For every trait you claim is "natural," I can find cultures where the opposite prevails. If human nature were as fixed as you suggest, there would be no cultural variation — yet variation is enormous. How do you explain that?`,
                `Here's my counter: You're committing the naturalistic fallacy in reverse — assuming what IS must be what MUST BE. Even if humans have tendencies, tendencies aren't destinies. We override "natural" impulses constantly (that's what civilization IS). Why should this particular tendency be treated as immutable?`,
                `Push back: "Evolved to" arguments are just-so stories unless backed by rigorous evidence. Evolutionary psychology is rife with unfalsifiable narratives that explain everything and predict nothing. What specific evidence distinguishes your evolutionary explanation from a convenient post-hoc rationalization?`
            ];
            return counters[Math.floor(Math.random() * counters.length)];
        }
    },
    
    // When user makes an identity or values-based claim
    identityCounter: {
        trigger: /\b(i\s+am|we\s+are|my\s+(generation|group|community)|our\s+(values?|culture|way))\b/i,
        build: (message) => {
            const counters = [
                `Counter: You're treating an identity claim as an argument. But "this is who I am" isn't a logical defense — it's a boundary. Boundaries are fine, but they don't advance debates. Can you separate what you believe from who you are long enough to examine it critically?`,
                `I'll challenge this: Identity-based claims are rhetorically powerful but logically empty. "As an X, I believe Y" doesn't make Y more true. Your identity gives you a perspective, maybe even standing — but it doesn't give you correctness. What's the argument beyond the identity?`,
                `Here's my counter-position: Identities aren't arguments. When we fuse our beliefs with our identities, we make our beliefs unfalsifiable — because challenging the belief becomes an attack on the self. Can you hold this position at arm's length and evaluate it as if it belonged to a stranger?`
            ];
            return counters[Math.floor(Math.random() * counters.length)];
        }
    },

    // When user makes a claim about technology or progress
    technologyCounter: {
        trigger: /\b(technology|ai|automation|progress|innovation|digital|internet|social\s+media|algorithm)\b/i,
        build: (message) => {
            const counters = [
                `Counter-argument: Technology is never neutral — it embeds the values and biases of its creators. Every tool that "empowers" also constrains. What are you losing in exchange for what you're gaining? Not everything that can be optimized should be.`,
                `I'll take the other side: Every technological revolution has produced unintended catastrophes alongside its benefits. The printing press enabled both the Enlightenment and propaganda. The internet enabled both democratized knowledge and mass manipulation. What's the shadow side of what you're advocating?`,
                `Here's the opposition: "Progress" is not a direction — it's a judgment. Progress toward what? For whom? At whose expense? The assumption that newer is better is itself a value claim masquerading as a fact. What was lost in the last wave of "progress," and do you mourn it?`
            ];
            return counters[Math.floor(Math.random() * counters.length)];
        }
    },

    // General counter for any declarative statement
    generalCounter: {
        trigger: /./,
        build: (message) => {
            const counters = [
                `Let me construct the strongest possible case against you: Assume for a moment that everything you've said is wrong. Not slightly wrong — fundamentally wrong. What would the world look like if that were the case? Now — can you distinguish THAT world from the one where you're right?`,
                `Here's my counter-argument: You've told me what you believe. But belief isn't knowledge. What would be DIFFERENT about reality if your claim were false? If you can't specify an observable difference, your claim might not be saying anything meaningful at all.`,
                `I'll take the opposite position: Every confident statement conceals the same question — "how do I know I'm not wrong?" You're confident. But confidence tracks personality more than truth. The most confident people in history have been spectacularly, disastrously wrong. What makes your confidence epistemically justified rather than merely psychological?`,
                `Counter: You've made a claim. Now I'll stress-test it. If I gave this claim to your smartest, most well-informed critic — someone who's thought deeply about this for decades — what would they say? What's the version of the opposition that you can't easily dismiss?`
            ];
            return counters[Math.floor(Math.random() * counters.length)];
        }
    }
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
        pattern: /\b(everyone knows|most people agree|majority thinks|nobody disagrees|common sense says)\b/i,
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
    },
    geneticFallacy: {
        pattern: /\b(where\s+(it|that)\s+came\s+from|origin|source|invented\s+by|created\s+by|started\s+as)\b.*\b(therefore|so|means|proves)\b/i,
        name: "Genetic Fallacy",
        counter: "You're judging an idea by its origin rather than its merits. Bad people can have good ideas, and good ideas can emerge from flawed contexts. Judge the argument on its current logic, not its pedigree."
    },
    moveGoalposts: {
        pattern: /\b(that('s|\s+is)\s+not\s+what\s+I\s+meant|I\s+was\s+really\s+saying|my\s+actual\s+point|what\s+I\s+really\s+mean)\b/i,
        name: "Moving the Goalposts",
        counter: "It seems like the target is shifting. When your original claim was challenged, you've restated it as something different. That's fine — but acknowledge that your position has changed rather than pretending it hasn't."
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

// Questioning strategies for Socratic dialogue
const questioningStrategies = {
    clarification: [
        "What do you mean when you say '{keyword}'?",
        "Could you put that another way — preferably in a way your opponent would accept as fair?",
        "What do you think is the crux of the disagreement here?",
        "Strip away the rhetoric — what is the core claim you're making?",
        "When you say that, what hidden premises are doing the work?"
    ],
    assumptions: [
        "What are you taking for granted that an opponent would challenge?",
        "Is that always the case, or are there exceptions that threaten your rule?",
        "What foundational beliefs must someone share to accept your argument?",
        "What would have to be true for your view to be demonstrably wrong?",
        "Which of your premises is weakest? An honest debater attacks their own weakest link first."
    ],
    evidence: [
        "What evidence would distinguish your position from its competitors?",
        "How do you know this — through reason, experience, testimony, or intuition?",
        "If you were a prosecutor, would this evidence survive cross-examination?",
        "Your evidence supports your conclusion. But does it also support other conclusions you don't accept?",
        "What would falsify your claim? If nothing could, you're holding a faith position, not a reasoned one."
    ],
    perspectives: [
        "You've made your case. Now argue the opposite position with equal vigor.",
        "How would the most sophisticated version of your opponent respond?",
        "If you were hired to defeat your own argument in a debate, where would you attack?",
        "The test of a first-rate intelligence is holding two opposed ideas simultaneously. Can you?",
        "Whose voices are missing from this conversation? What would they say?"
    ],
    consequences: [
        "If your argument wins, what world does it create? Is that the world you want?",
        "Follow this thread to its endpoint. Where does this logic ultimately terminate?",
        "If we universalized this principle, can it survive universalization?",
        "Every position has costs. What are you willing to sacrifice for this conclusion?",
        "If you're wrong about this, what's the damage? What's at stake?"
    ],
    metaQuestions: [
        "Why are you defending this? Reasoned conviction, or psychological comfort?",
        "Are you trying to find the truth, or to win? Those are different goals.",
        "What would it cost you — emotionally, socially — to change your mind?",
        "Is this a belief you chose, or one that chose you?",
        "We've been circling something. What's the question underneath the question?"
    ]
};

// Topic detection patterns
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
// CORE RESPONSE ENGINE — Now with aggressive counter-arguments
// ============================================================

function generateSocraticResponse(userMessage) {
    const message = userMessage.toLowerCase().trim();
    const originalMessage = userMessage.trim();
    
    // 1. Detect and exploit specific logical weaknesses (HIGHEST PRIORITY)
    const weakness = detectWeakness(message, originalMessage);
    if (weakness) {
        debateContext.weaknessesExploited.push(weakness.type);
        return weakness.response;
    }
    
    // 2. Check for logical fallacies
    const fallacy = detectFallacy(message);
    if (fallacy) {
        debateContext.fallaciesDetected.push(fallacy.name);
        return buildFallacyResponse(fallacy, message);
    }
    
    // 3. Construct active counter-argument (HIGH PRIORITY — 70% chance)
    const counterPosition = buildCounterPosition(message, originalMessage);
    if (counterPosition && Math.random() < 0.7) {
        return counterPosition;
    }
    
    // 4. Check for rhetorical technique opportunities
    const rhetoric = detectRhetoricalOpportunity(message);
    if (rhetoric) {
        debateContext.rhetoricalMoves.push(rhetoric.trigger);
        return buildRhetoricalResponse(rhetoric, message);
    }
    
    // 5. Analyze argument structure
    const argAnalysis = analyzeArgument(message);
    
    // 6. Track user positions for contradiction detection
    trackPosition(originalMessage);
    
    // 7. Check for contradictions with earlier statements
    const contradiction = detectContradiction(originalMessage);
    if (contradiction) {
        return buildContradictionResponse(contradiction, message);
    }
    
    // 8. Detect topics
    const detectedTopics = [];
    for (const [topic, pattern] of Object.entries(topicPatterns)) {
        if (pattern.test(message)) {
            detectedTopics.push(topic);
        }
    }
    
    // 9. Build Socratic response with probing questions
    let strategy = selectStrategy(detectedTopics, message, argAnalysis);
    let response = buildResponse(strategy, message, detectedTopics, argAnalysis);
    
    return response;
}

// Detect specific exploitable weaknesses in reasoning
function detectWeakness(message, originalMessage) {
    for (const [type, detector] of Object.entries(weaknessDetectors)) {
        const match = message.match(detector.pattern);
        if (match) {
            const responses = detector.poke(match, message);
            const response = responses[Math.floor(Math.random() * responses.length)];
            return { type, response };
        }
    }
    return null;
}

// Build an active counter-position (not just questions — actual opposing arguments)
function buildCounterPosition(message, originalMessage) {
    // Try specific counter-position builders (in order of specificity)
    const builders = [
        counterPositionBuilders.empiricalCounter,
        counterPositionBuilders.moralCounter,
        counterPositionBuilders.policyCounter,
        counterPositionBuilders.humanNatureCounter,
        counterPositionBuilders.identityCounter,
        counterPositionBuilders.technologyCounter
    ];
    
    for (const builder of builders) {
        if (builder.trigger.test(message)) {
            return builder.build(originalMessage);
        }
    }
    
    // For statements long enough to be substantive, use general counter
    if (message.split(/\s+/).length >= 8) {
        return counterPositionBuilders.generalCounter.build(originalMessage);
    }
    
    return null;
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
    if (conversationHistory.length < 2) return null;
    
    for (const [key, technique] of Object.entries(rhetoricalTechniques)) {
        if (technique.trigger.test(message)) {
            if (Math.random() < 0.5) {
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
    
    if (argAnalysis.isStrongClaim && !argAnalysis.hasPremise) return 'evidence';
    if (argAnalysis.hasAbsolute) return 'assumptions';
    if (turnCount <= 2) return 'clarification';
    if (argAnalysis.isHedging) return 'evidence';
    if (argAnalysis.hasPremise && argAnalysis.hasConclusion) return 'perspectives';
    if (topics.includes('morality') || topics.includes('justice')) return 'perspectives';
    if (topics.includes('purpose') || topics.includes('change')) return 'consequences';
    if (topics.includes('philosophy') || topics.includes('knowledge')) return 'assumptions';
    if (topics.includes('politics') || topics.includes('freedom')) return 'perspectives';
    if (turnCount > 6) return 'metaQuestions';
    
    const weightedStrategies = ['assumptions', 'evidence', 'perspectives', 'consequences', 'evidence', 'assumptions'];
    return weightedStrategies[turnCount % weightedStrategies.length];
}

function buildResponse(strategy, message, topics, argAnalysis) {
    const questions = questioningStrategies[strategy];
    let shuffled = [...questions].sort(() => Math.random() - 0.5);
    let selectedQuestions = [shuffled[0]];
    
    if (Math.random() < 0.4 && conversationHistory.length > 1) {
        const otherStrategies = Object.keys(questioningStrategies).filter(s => s !== strategy);
        const otherStrategy = otherStrategies[Math.floor(Math.random() * otherStrategies.length)];
        const otherQuestions = questioningStrategies[otherStrategy];
        selectedQuestions.push(otherQuestions[Math.floor(Math.random() * otherQuestions.length)]);
    }

    let preamble = getContextualPreamble(message, topics, argAnalysis);
    
    let response = preamble;
    selectedQuestions.forEach((q, i) => {
        q = personalizeQuestion(q, message);
        response += (i > 0 ? '\n\n' : '') + q;
    });
    
    return response;
}


// ============================================================
// PREAMBLE & TEXT UTILITIES
// ============================================================

function getContextualPreamble(message, topics, argAnalysis) {
    if (argAnalysis.isStrongClaim) {
        const p = ["Bold claim. Let's stress-test it. ", "You state this with confidence. Confidence is not evidence. ", "A strong assertion demands strong justification. ", "You've planted your flag. Now defend the hill: "];
        return p[Math.floor(Math.random() * p.length)];
    }
    if (argAnalysis.isHedging) {
        const p = ["You're hedging. Commit to a position so we can examine it properly. ", "I notice you're qualifying heavily. What would it take for you to say this with conviction? ", "Tentativeness can be wisdom or avoidance. Which is it here? "];
        return p[Math.floor(Math.random() * p.length)];
    }
    if (argAnalysis.hasPremise && argAnalysis.hasConclusion) {
        const p = ["You've given me a structured argument. Good. Now let me find the cracks: ", "I see your reasoning: premise to conclusion. Let me test the bridge between them: ", "A formal argument — let's see if it survives scrutiny. "];
        return p[Math.floor(Math.random() * p.length)];
    }

    const topicPreambles = {
        belief: ["A conviction exposed for examination. ", "Belief is easy; justification is hard. "],
        morality: ["Moral claims are the hardest to defend rationally. ", "You invoke right and wrong. But whose framework? "],
        identity: ["The self is perhaps the hardest thing to know. ", "A claim about identity. Let's see what's beneath it: "],
        knowledge: ["Knowledge claims require the highest standard of justification. ", "You say you know. But knowing that you know is a different matter entirely. "],
        politics: ["Political positions are often emotional convictions dressed in rational clothing. ", "A political claim. Let's separate the ideology from the argument: "],
        justice: ["Justice is contested territory. Every theory of justice excludes someone. ", "You invoke justice. But justice for whom, and at whose expense? "],
        philosophy: ["Philosophical claims demand philosophical rigor. ", "You're touching bedrock questions. Let's dig: "],
        default: ["Let's examine this with the rigor it deserves. ", "An interesting claim. Now defend it: ", "I hear your position. Now I'll test it: ", "Very well — let me challenge you: "]
    };
    
    let category = 'default';
    for (const topic of topics) {
        if (topicPreambles[topic]) { category = topic; break; }
    }
    const options = topicPreambles[category];
    return options[Math.floor(Math.random() * options.length)];
}

function personalizeQuestion(question, message) {
    if (question.includes('{keyword}')) {
        const stopWords = /^(about|their|there|these|those|which|would|could|should|because|always|never|being|having|where|after|before|under|above|between)$/i;
        const words = message.split(/\s+/).filter(w => w.length > 4 && !stopWords.test(w));
        const keyword = words.length > 0 ? words[Math.floor(Math.random() * words.length)] : 'that';
        question = question.replace(/\{keyword\}/g, keyword.replace(/[^a-zA-Z'-]/g, ''));
    }
    return question;
}

function fillRhetoricalPlaceholders(text, message) {
    const words = message.split(/\s+/).filter(w => w.length > 3);
    
    if (text.includes('{absurd_consequence}')) {
        const c = ["no exceptions could ever exist", "we'd have to accept some deeply uncomfortable conclusions", "it would apply even in cases where it clearly shouldn't", "the principle would destroy itself in edge cases"];
        text = text.replace('{absurd_consequence}', c[Math.floor(Math.random() * c.length)]);
    }
    if (text.includes('{edge_case}')) {
        const c = ["the cases at the margins", "situations involving competing values", "circumstances where your rule harms the innocent", "the hard cases that test every principle"];
        text = text.replace('{edge_case}', c[Math.floor(Math.random() * c.length)]);
    }
    if (text.includes('{negation}')) {
        const c = ["the opposite pattern was observed", "your explanation failed to predict outcomes", "people acted contrary to your model", "the evidence pointed the other way"];
        text = text.replace('{negation}', c[Math.floor(Math.random() * c.length)]);
    }
    if (text.includes('{premise}')) {
        const c = ["a particular definition holding universally", "human nature being as you describe it", "the current conditions remaining stable", "your framing being the only valid one"];
        text = text.replace('{premise}', c[Math.floor(Math.random() * c.length)]);
    }
    if (text.includes('{claim_a}')) {
        text = text.replace('{claim_a}', words.slice(0, 4).join(' ') || 'your initial premise');
    }
    if (text.includes('{unwanted_conclusion}')) {
        const c = ["things you'd find unacceptable", "conclusions that undermine your other beliefs", "results that no one would endorse", "positions you'd reject in other contexts"];
        text = text.replace('{unwanted_conclusion}', c[Math.floor(Math.random() * c.length)]);
    }
    return text;
}

function truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
}


// ============================================================
// PRIMARY SOURCE SEARCH & CONCESSION ENGINE
// Uses actual primary sources: peer-reviewed papers, government data,
// and academic research databases. NOT Wikipedia or secondary sources.
// ============================================================

// Search configuration
const SEARCH_CONFIG = {
    enabled: true,
    timeout: 10000,
    // Primary source APIs (all free, no API key required for basic use):
    // 1. Semantic Scholar — 200M+ peer-reviewed academic papers
    // 2. OpenAlex — 250M+ scholarly works (papers, datasets, theses)
    // 3. PubMed/NCBI — Biomedical and life sciences research
    // 4. CORE — Open access research papers
    sources: ['semanticScholar', 'openAlex', 'pubmed']
};

// API endpoints for actual primary sources
const PRIMARY_SOURCE_APIS = {
    // Semantic Scholar: peer-reviewed papers from all scientific fields
    // Free, no auth needed for up to 100 requests/5 minutes
    semanticScholar: {
        search: 'https://api.semanticscholar.org/graph/v1/paper/search',
        fields: 'title,abstract,year,citationCount,journal,authors,url,tldr',
        name: 'Semantic Scholar',
        type: 'peer-reviewed research'
    },
    // OpenAlex: open catalog of scholarly works (papers, books, datasets)
    // Completely free, no auth needed
    openAlex: {
        search: 'https://api.openalex.org/works',
        name: 'OpenAlex',
        type: 'scholarly works'
    },
    // PubMed/NCBI: biomedical and life sciences
    // Free, no auth needed for basic queries
    pubmed: {
        search: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
        summary: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
        name: 'PubMed (NIH/NCBI)',
        type: 'biomedical research'
    },
    // US Government Publications: policy, reports, statistics, legislation
    // Free, no auth needed (CKAN API on catalog.data.gov)
    usGov: {
        search: 'https://catalog.data.gov/api/3/action/package_search',
        name: 'US Government (data.gov)',
        type: 'government publication'
    },
    // UK Government Publications: policy papers, guidance, statistics, research
    // Free, no auth needed (gov.uk Search API)
    ukGov: {
        search: 'https://www.gov.uk/api/search.json',
        name: 'UK Government (gov.uk)',
        type: 'government publication'
    },
    // EU Publications Office: legislation, reports, policy, official journals
    // Free, no auth needed
    euPublications: {
        search: 'https://op.europa.eu/webapi/rdf/sparql',
        searchAlt: 'https://data.europa.eu/api/hub/search/search',
        name: 'EU Publications Office',
        type: 'government publication'
    }
};

// Extract the core factual claim from user message
function extractFactualClaim(message) {
    const cleaned = message
        .replace(/\b(i think|i believe|in my opinion|i feel like|it seems|obviously|clearly)\b/gi, '')
        .replace(/\b(that|which|who|whom)\b/gi, '')
        .trim();
    
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length === 0) return null;
    
    const factualIndicators = /\b(is|are|was|were|causes?|leads?|proves?|shows?|created?|invented?|discovered?|found|established|began|started|ended|died|born|built|wrote|said|increases?|decreases?|affects?|effects?)\b/i;
    
    const factualSentences = sentences.filter(s => factualIndicators.test(s));
    if (factualSentences.length > 0) {
        return factualSentences.reduce((a, b) => a.length > b.length ? a : b).trim();
    }
    return sentences.reduce((a, b) => a.length > b.length ? a : b).trim();
}

// Build search query from claim
function buildSearchQuery(claim) {
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','dare','ought','used','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','each','every','both','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','because','but','and','or','if','while','that','this','these','those','it','its','they','them','their','we','our','you','your','he','him','his','she','her','i','my','me','think','believe','feel']);
    
    const words = claim.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));
    
    return words.slice(0, 8).join(' ');
}

// Search Semantic Scholar for peer-reviewed papers
async function searchSemanticScholar(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.semanticScholar.search}?query=${encodeURIComponent(query)}&limit=5&fields=${PRIMARY_SOURCE_APIS.semanticScholar.fields}`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(SEARCH_CONFIG.timeout)
        });
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
    } catch (e) {
        console.log('Semantic Scholar search failed:', e.message);
        return [];
    }
}

// Search OpenAlex for scholarly works
async function searchOpenAlex(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.openAlex.search}?search=${encodeURIComponent(query)}&per_page=5&select=id,title,abstract_inverted_index,publication_year,cited_by_count,primary_location,authorships`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(SEARCH_CONFIG.timeout),
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) return [];
        
        const data = await response.json();
        if (!data.results || data.results.length === 0) return [];
        
        return data.results.map(work => {
            // Reconstruct abstract from inverted index
            let abstract = '';
            if (work.abstract_inverted_index) {
                const words = [];
                for (const [word, positions] of Object.entries(work.abstract_inverted_index)) {
                    for (const pos of positions) {
                        words[pos] = word;
                    }
                }
                abstract = words.join(' ').substring(0, 300);
            }
            
            const source = work.primary_location?.landing_page_url || work.id;
            const journal = work.primary_location?.source?.display_name || 'Unknown source';
            const authors = (work.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(', ');
            
            return {
                title: work.title || 'Untitled',
                snippet: abstract,
                source: source,
                year: work.publication_year,
                citations: work.cited_by_count,
                journal: journal,
                authors: authors,
                type: 'scholarly work',
                database: 'OpenAlex'
            };
        });
    } catch (e) {
        console.log('OpenAlex search failed:', e.message);
        return [];
    }
}

// Search PubMed for biomedical research
async function searchPubMed(query) {
    try {
        // Step 1: Search for paper IDs
        const searchUrl = `${PRIMARY_SOURCE_APIS.pubmed.search}?db=pubmed&term=${encodeURIComponent(query)}&retmax=3&retmode=json`;
        const searchResponse = await fetch(searchUrl, {
            signal: AbortSignal.timeout(SEARCH_CONFIG.timeout)
        });
        if (!searchResponse.ok) return [];
        
        const searchData = await searchResponse.json();
        const ids = searchData.esearchresult?.idlist || [];
        if (ids.length === 0) return [];
        
        // Step 2: Get summaries for found papers
        const summaryUrl = `${PRIMARY_SOURCE_APIS.pubmed.summary}?db=pubmed&id=${ids.join(',')}&retmode=json`;
        const summaryResponse = await fetch(summaryUrl, {
            signal: AbortSignal.timeout(SEARCH_CONFIG.timeout)
        });
        if (!summaryResponse.ok) return [];
        
        const summaryData = await summaryResponse.json();
        const results = [];
        
        for (const id of ids) {
            const paper = summaryData.result?.[id];
            if (!paper) continue;
            
            results.push({
                title: paper.title || 'Untitled',
                snippet: paper.sorttitle || paper.title || '',
                source: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                year: parseInt(paper.pubdate?.split(' ')[0]) || null,
                citations: null,
                journal: paper.fulljournalname || paper.source || 'Unknown journal',
                authors: (paper.authors || []).slice(0, 3).map(a => a.name).join(', '),
                type: 'biomedical research',
                database: 'PubMed (NIH)'
            });
        }
        
        return results;
    } catch (e) {
        console.log('PubMed search failed:', e.message);
        return [];
    }
}

// Search US Government publications (data.gov CKAN API)
async function searchUSGov(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.usGov.search}?q=${encodeURIComponent(query)}&rows=4`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(SEARCH_CONFIG.timeout)
        });
        if (!response.ok) return [];
        
        const data = await response.json();
        if (!data.result || !data.result.results || data.result.results.length === 0) return [];
        
        return data.result.results.map(dataset => {
            const org = dataset.organization?.title || 'US Government';
            const notes = dataset.notes || '';
            const url = dataset.url || `https://catalog.data.gov/dataset/${dataset.name}`;
            
            return {
                title: dataset.title || 'Untitled',
                snippet: notes.substring(0, 300),
                source: url,
                year: dataset.metadata_created ? new Date(dataset.metadata_created).getFullYear() : null,
                citations: null,
                journal: org,
                authors: org,
                type: 'US government publication',
                database: 'US Government (data.gov)'
            };
        });
    } catch (e) {
        console.log('US Gov search failed:', e.message);
        return [];
    }
}

// Search UK Government publications (gov.uk Search API)
async function searchUKGov(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.ukGov.search}?q=${encodeURIComponent(query)}&count=4&filter_format=research-and-statistics,policy-paper,guidance,statistical-data-set,official-statistics`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(SEARCH_CONFIG.timeout)
        });
        if (!response.ok) return [];
        
        const data = await response.json();
        if (!data.results || data.results.length === 0) return [];
        
        return data.results.map(result => {
            const org = result.organisations?.[0]?.title || result.organisation_content_ids?.[0] || 'UK Government';
            
            return {
                title: result.title || 'Untitled',
                snippet: result.description || '',
                source: `https://www.gov.uk${result.link}`,
                year: result.public_timestamp ? new Date(result.public_timestamp).getFullYear() : null,
                citations: null,
                journal: org,
                authors: org,
                type: 'UK government publication',
                database: 'UK Government (gov.uk)'
            };
        });
    } catch (e) {
        console.log('UK Gov search failed:', e.message);
        return [];
    }
}

// Search EU Publications (data.europa.eu CKAN-compatible API)
async function searchEUPublications(query) {
    try {
        const url = `${PRIMARY_SOURCE_APIS.euPublications.searchAlt}?q=${encodeURIComponent(query)}&limit=4&filter=country:http://publications.europa.eu/resource/authority/country`;
        const response = await fetch(url, {
            signal: AbortSignal.timeout(SEARCH_CONFIG.timeout),
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) return [];
        
        const data = await response.json();
        const results = data.result?.results || data.results || [];
        if (results.length === 0) return [];
        
        return results.slice(0, 4).map(result => {
            const title = result.title?.en || result.title || (typeof result.title === 'object' ? Object.values(result.title)[0] : 'Untitled');
            const description = result.description?.en || result.description || (typeof result.description === 'object' ? Object.values(result.description)[0] : '');
            const publisher = result.catalog?.publisher?.name || result.publisher?.name || 'European Union';
            
            return {
                title: typeof title === 'string' ? title : 'EU Publication',
                snippet: (typeof description === 'string' ? description : '').substring(0, 300),
                source: result.access_url || result.landing_page || result.id || 'https://data.europa.eu',
                year: result.issued ? new Date(result.issued).getFullYear() : null,
                citations: null,
                journal: typeof publisher === 'string' ? publisher : 'European Union',
                authors: typeof publisher === 'string' ? publisher : 'European Union',
                type: 'EU government publication',
                database: 'EU Publications Office'
            };
        });
    } catch (e) {
        console.log('EU Publications search failed:', e.message);
        return [];
    }
}

// Search all primary source databases in parallel
async function searchAllPrimarySources(query) {
    const searches = [
        searchSemanticScholar(query),
        searchOpenAlex(query),
        searchPubMed(query),
        searchUSGov(query),
        searchUKGov(query),
        searchEUPublications(query)
    ];
    
    const results = await Promise.allSettled(searches);
    
    let allResults = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
            allResults = [...allResults, ...result.value];
        }
    }
    
    // Sort by citation count (most-cited = most established research)
    // Government sources without citations ranked by relevance (kept in order)
    allResults.sort((a, b) => (b.citations || 0) - (a.citations || 0));
    
    return allResults;
}

// Determine if search results contradict the user's claim
function analyzeContradiction(claim, searchResults) {
    if (!searchResults || searchResults.length === 0) {
        return { contradicts: false, results: [], hasRelevantSources: false };
    }
    
    const claimLower = claim.toLowerCase();
    const contradictionIndicators = [];
    const supportingIndicators = [];
    
    for (const result of searchResults) {
        const snippet = (result.snippet || '').toLowerCase();
        if (!snippet || snippet.length < 20) continue;
        
        const relevanceScore = calculateRelevanceScore(claimLower, snippet);
        if (relevanceScore < 2) continue; // Not relevant enough
        
        const contradictionScore = calculateContradictionScore(claimLower, snippet);
        
        if (contradictionScore >= 3) {
            contradictionIndicators.push({
                ...result,
                contradictionScore,
                relevanceScore,
                relevantExcerpt: truncate(result.snippet || '', 250)
            });
        } else if (relevanceScore >= 3) {
            supportingIndicators.push({
                ...result,
                relevanceScore,
                relevantExcerpt: truncate(result.snippet || '', 250)
            });
        }
    }
    
    contradictionIndicators.sort((a, b) => b.contradictionScore - a.contradictionScore);
    
    return {
        contradicts: contradictionIndicators.length > 0,
        results: contradictionIndicators.slice(0, 3),
        supportingResults: supportingIndicators.slice(0, 2),
        hasRelevantSources: contradictionIndicators.length > 0 || supportingIndicators.length > 0
    };
}

function calculateRelevanceScore(claim, sourceText) {
    const claimWords = claim.split(/\s+/).filter(w => w.length > 4);
    const sourceWords = new Set(sourceText.split(/\s+/));
    
    let sharedTerms = 0;
    for (const word of claimWords) {
        if (sourceWords.has(word)) sharedTerms++;
    }
    return sharedTerms;
}

function calculateContradictionScore(claim, sourceText) {
    let score = 0;
    
    const contradictionSignals = [
        'however', 'contrary', 'disproven', 'debunked', 'no evidence',
        'not supported', 'disputed', 'controversial', 'criticized',
        'refuted', 'overturned', 'revised', 'failed to replicate',
        'no significant', 'did not find', 'inconclusive', 'contradicts',
        'no correlation', 'no association', 'negative results',
        'myth', 'misconception', 'false', 'incorrect', 'inaccurate'
    ];
    
    for (const signal of contradictionSignals) {
        if (sourceText.includes(signal)) score += 2;
    }
    
    // Weaker signals
    const weakSignals = ['although', 'despite', 'nevertheless', 'whereas', 'in contrast', 'alternatively', 'competing', 'debate'];
    for (const signal of weakSignals) {
        if (sourceText.includes(signal)) score += 1;
    }
    
    return score;
}

// Main function: search primary sources and respond
async function searchAndRespond(userMessage) {
    const claim = extractFactualClaim(userMessage);
    if (!claim || claim.length < 15) return null;
    
    const query = buildSearchQuery(claim);
    if (!query || query.length < 5) return null;
    
    // Search actual primary source databases (peer-reviewed research)
    const searchResults = await searchAllPrimarySources(query);
    
    // Analyze whether sources contradict the claim
    const analysis = analyzeContradiction(claim, searchResults);
    
    return {
        claim,
        query,
        analysis,
        results: searchResults
    };
}


// ============================================================
// CONCESSION & SOURCE-BACKED RESPONSE BUILDERS
// ============================================================

function buildSourceBackedCounter(searchResult) {
    const { claim, analysis, results } = searchResult;
    
    if (analysis.contradicts && analysis.results.length > 0) {
        // We found contradicting peer-reviewed research — present it
        const topSource = analysis.results[0];
        const sourceUrl = topSource.source;
        const excerpt = topSource.relevantExcerpt;
        const sourceInfo = topSource.authors ? `${topSource.authors} (${topSource.year || 'n.d.'})` : topSource.title;
        const journalInfo = topSource.journal ? `, published in ${topSource.journal}` : '';
        const citationInfo = topSource.citations ? ` [cited ${topSource.citations} times]` : '';
        
        const intros = [
            `I found peer-reviewed research that challenges your claim.`,
            `The academic literature tells a different story than the one you're presenting.`,
            `I've searched the primary research databases, and the published evidence pushes back on your position.`,
            `Peer-reviewed studies and government publications complicate your claim significantly.`
        ];
        const intro = intros[Math.floor(Math.random() * intros.length)];
        
        let response = `${intro}\n\n`;
        response += `From ${topSource.database}: "${topSource.title}" by ${sourceInfo}${journalInfo}${citationInfo}\n`;
        response += `Source: ${sourceUrl}\n`;
        if (excerpt) {
            response += `Finding: "${truncate(excerpt, 200)}"\n\n`;
        } else {
            response += `\n`;
        }
        
        if (analysis.results.length > 1) {
            const second = analysis.results[1];
            const secondInfo = second.authors ? `${second.authors} (${second.year || 'n.d.'})` : '';
            response += `Additional source: "${second.title}" ${secondInfo} (${second.database}) — ${second.source}\n\n`;
        }
        
        if (analysis.results.length > 2) {
            const third = analysis.results[2];
            response += `Also see: "${third.title}" (${third.database}) — ${third.source}\n\n`;
        }
        
        // List ALL sources consulted (both contradicting and supporting)
        response += `--- Primary Sources Consulted ---\n`;
        const allSourcesUsed = [...analysis.results];
        if (analysis.supportingResults) {
            allSourcesUsed.push(...analysis.supportingResults);
        }
        allSourcesUsed.forEach((src, i) => {
            const yr = src.year ? ` (${src.year})` : '';
            const cites = src.citations ? ` [${src.citations} citations]` : '';
            response += `${i + 1}. "${src.title}"${yr} — ${src.database}${cites}\n   ${src.source}\n`;
        });
        response += `\n`;
        
        const challenges = [
            `This peer-reviewed research directly challenges your claim. How do you reconcile your position with published findings? Do you have counter-evidence from primary research?`,
            `The published literature appears to contradict your assertion. Can you cite primary research that supports your position, or does this require revision?`,
            `Academic research and official publications suggest your claim may be incomplete or inaccurate. A strong argument requires engaging with the best available evidence — how do you respond to this?`,
            `Primary source evidence from the research literature is at odds with your statement. In rigorous debate, the person with peer-reviewed evidence on their side has a significant advantage. Can you overcome this?`
        ];
        response += challenges[Math.floor(Math.random() * challenges.length)];
        
        return response;
    }
    
    // If we have relevant but non-contradicting sources, include them in concession
    if (analysis.hasRelevantSources && analysis.supportingResults && analysis.supportingResults.length > 0) {
        return null; // Will trigger concession, but concession will include source list
    }
    
    return null; // No contradiction found — will trigger concession
}

function buildConcession(searchResult, userMessage) {
    // The app concedes when it cannot find contradicting peer-reviewed research
    const databases = 'Semantic Scholar, OpenAlex, PubMed, US Government (data.gov), UK Government (gov.uk), and EU Publications Office';
    
    let sourceList = '';
    // List what sources were found (even if they don't contradict)
    if (searchResult.results && searchResult.results.length > 0) {
        sourceList = `\n\n--- Primary Sources Consulted (non-contradicting) ---\n`;
        searchResult.results.slice(0, 5).forEach((src, i) => {
            const yr = src.year ? ` (${src.year})` : '';
            const cites = src.citations ? ` [${src.citations} citations]` : '';
            sourceList += `${i + 1}. "${src.title}"${yr} — ${src.database}${cites}\n   ${src.source}\n`;
        });
    }
    
    const concessions = [
        `I've searched the peer-reviewed literature and government publications across ${databases}, and I cannot find published research that directly contradicts your statement. On this point, I'll concede — your claim appears to be supported by, or at minimum not contradicted by, the available primary research.\n\nThat said — being factually correct doesn't mean your conclusion necessarily follows. The facts may be right while the interpretation remains debatable. Is there an interpretive claim underneath the factual one that we should examine?${sourceList}`,
        
        `I'll be honest: I searched ${databases} for peer-reviewed evidence and government data to challenge your claim, and I couldn't find any. Credit where it's due — your statement appears to hold up against the published research.\n\nBut let me pivot: even well-supported facts can be used to build flawed arguments. The fact may be solid; is the conclusion you're drawing from it equally solid? That's a different question.${sourceList}`,
        
        `I concede this point. The peer-reviewed primary sources and government publications I can access across ${databases} do not contradict your claim. A good dialectician knows when to yield ground — and this ground appears to be yours.\n\nHowever, conceding a fact is not the same as conceding an argument. Facts are building blocks; arguments are structures. Your brick may be sound, but is the wall you're building with it structurally sound?${sourceList}`,
        
        `Fair enough — I cannot counter this with peer-reviewed research or official government publications from ${databases}. Your claim stands unchallenged at the level of primary sources. I acknowledge that.\n\nNow: does this factual correctness prove everything you want it to prove? Or is there a gap between "this fact is true" and "therefore my broader conclusion is correct"? Let's explore that gap.${sourceList}`
    ];
    
    return concessions[Math.floor(Math.random() * concessions.length)];
}

// Response when search fails entirely (network issues, etc.)
function buildSearchFailureResponse(userMessage) {
    const responses = [
        `I attempted to verify your claim against primary sources but was unable to complete the search. I'll engage with your argument on its logical merits instead.\n\n`,
        `My primary source lookup encountered an issue. Rather than make unsupported counter-claims, I'll focus on the logical structure of your argument.\n\n`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
}


// ============================================================
// UI FUNCTIONS — Updated with async source search
// ============================================================

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = sender === 'socrates' ? '&#x1F3DB;' : '&#x1F464;';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Split text into paragraphs and handle source links
    const paragraphs = text.split('\n\n');
    paragraphs.forEach(p => {
        const pElement = document.createElement('p');
        // Convert URLs to clickable links
        const urlRegex = /(https?:\/\/[^\s\)]+)/g;
        const parts = p.split(urlRegex);
        parts.forEach(part => {
            if (urlRegex.test(part)) {
                const link = document.createElement('a');
                link.href = part;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = '[source]';
                link.style.color = '#e94560';
                link.style.textDecoration = 'underline';
                pElement.appendChild(link);
            } else {
                pElement.appendChild(document.createTextNode(part));
            }
            // Reset regex lastIndex
            urlRegex.lastIndex = 0;
        });
        contentDiv.appendChild(pElement);
    });
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    
    scrollToBottom();
}

function addTypingIndicator(searchingText) {
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
        ${searchingText ? `<p style="font-size: 0.8rem; color: #a0a0b0; margin-top: 0.4rem; font-style: italic;">${searchingText}</p>` : ''}
    `;
    
    typingDiv.appendChild(avatarDiv);
    typingDiv.appendChild(contentDiv);
    chatContainer.appendChild(typingDiv);
    
    scrollToBottom();
}

function updateTypingIndicator(text) {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        const statusP = indicator.querySelector('.message-content p');
        if (statusP) {
            statusP.textContent = text;
        }
    }
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

// Handle form submission — always searches sources for counter-arguments
inputForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const message = userInput.value.trim();
    if (!message) return;
    
    // Add user message
    addMessage(message, 'user');
    conversationHistory.push({ role: 'user', content: message });
    
    // Clear input
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // Determine if message is substantive enough to search sources
    const wordCount = message.split(/\s+/).length;
    const shouldSearchSources = wordCount >= 6 && SEARCH_CONFIG.enabled;
    
    if (shouldSearchSources) {
        // Show searching indicator
        addTypingIndicator('Searching peer-reviewed research & government publications...');
        
        try {
            // Search primary sources in parallel with generating logic-based response
            const [searchResult, logicResponse] = await Promise.all([
                searchAndRespond(message),
                Promise.resolve(generateSocraticResponse(message))
            ]);
            
            updateTypingIndicator('Analyzing research findings...');
            await delay(400);
            removeTypingIndicator();
            
            if (searchResult && searchResult.analysis.contradicts && searchResult.analysis.results.length > 0) {
                // Found contradicting sources — build source-backed counter
                const sourceCounter = buildSourceBackedCounter(searchResult);
                if (sourceCounter) {
                    addMessage(sourceCounter, 'socrates');
                    conversationHistory.push({ role: 'socrates', content: sourceCounter });
                    return;
                }
            }
            
            // If no contradicting sources, or search returned non-contradicting results:
            // Use the logic-based response BUT append relevant sources found
            if (searchResult && searchResult.results && searchResult.results.length > 0) {
                // We have sources — append them to whatever counter-argument was generated
                let responseWithSources = logicResponse;
                responseWithSources += buildSourceCitationBlock(searchResult.results);
                
                // If sources didn't contradict, note the concession on factual level
                if (isSubstantiveFactualClaim(message) && !searchResult.analysis.contradicts) {
                    const concessionNote = `\n\n(Note: I searched primary sources and could not find published evidence contradicting your factual claim. My challenge above is directed at the logic, framing, or interpretation — not the underlying facts.)`;
                    responseWithSources += concessionNote;
                }
                
                addMessage(responseWithSources, 'socrates');
                conversationHistory.push({ role: 'socrates', content: responseWithSources });
            } else {
                // No sources found at all — deliver logic-based response alone
                addMessage(logicResponse, 'socrates');
                conversationHistory.push({ role: 'socrates', content: logicResponse });
            }
            
        } catch (error) {
            removeTypingIndicator();
            console.error('Source search failed:', error);
            
            // Fallback: use logic-based response with note about search failure
            const fallbackIntro = buildSearchFailureResponse(message);
            const logicResponse = generateSocraticResponse(message);
            const combined = fallbackIntro + logicResponse;
            addMessage(combined, 'socrates');
            conversationHistory.push({ role: 'socrates', content: combined });
        }
    } else {
        // Short message — use standard debate/Socratic response without source search
        addTypingIndicator('');
        await delay(Math.min(800 + message.length * 10, 2000));
        removeTypingIndicator();
        const response = generateSocraticResponse(message);
        addMessage(response, 'socrates');
        conversationHistory.push({ role: 'socrates', content: response });
    }
});

// Build a formatted citation block listing all primary sources used
function buildSourceCitationBlock(sources) {
    if (!sources || sources.length === 0) return '';
    
    // Deduplicate by title
    const seen = new Set();
    const unique = sources.filter(src => {
        if (seen.has(src.title)) return false;
        seen.add(src.title);
        return true;
    });
    
    let block = `\n\n--- Primary Sources Used in This Counter-Argument ---\n`;
    unique.slice(0, 6).forEach((src, i) => {
        const yr = src.year ? ` (${src.year})` : '';
        const cites = src.citations ? ` [${src.citations} citations]` : '';
        const db = src.database || 'Unknown';
        const authors = src.authors ? ` — ${src.authors}` : '';
        block += `${i + 1}. "${src.title}"${yr}${authors}\n   ${db}${cites}\n   ${src.source}\n`;
    });
    
    return block;
}

// Determine if a message contains a substantive factual claim worth verifying
function isSubstantiveFactualClaim(message) {
    const wordCount = message.split(/\s+/).length;
    if (wordCount < 6) return false; // Too short
    
    // Patterns that indicate factual claims (not just opinions)
    const factualPatterns = [
        /\b(is|are|was|were)\s+\w+/i, // "X is Y" structure
        /\b(causes?|leads?\s+to|results?\s+in)\b/i, // Causal claims
        /\b(research|studies?|data|statistics?|evidence|science|scientists?)\b/i, // Scientific claims
        /\b(percent|%|\d+\s*(million|billion|thousand|hundred))\b/i, // Numerical claims
        /\b(always|never|every|all|none|no\s+one)\b/i, // Universal claims
        /\b(fact|proven|true|false|myth|actually|reality)\b/i, // Truth claims
        /\b(history|historical|invented|discovered|founded|created|built|wrote)\b/i, // Historical claims
        /\b(country|nation|government|population|economy)\b/i, // Geopolitical claims
        /\b(died|born|lived|ruled|reigned|served)\b/i // Biographical claims
    ];
    
    let factualScore = 0;
    for (const pattern of factualPatterns) {
        if (pattern.test(message)) factualScore++;
    }
    
    // Also check if it's NOT purely opinion/feeling
    const opinionPatterns = /\b(i think|i feel|in my opinion|i believe|personally|for me)\b/i;
    if (opinionPatterns.test(message)) factualScore -= 1;
    
    return factualScore >= 2; // Needs at least 2 factual indicators
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Focus input on load
window.addEventListener('load', () => {
    userInput.focus();
});
