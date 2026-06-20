// Socratic Method Chat Application
// Responds to user statements with probing questions to deepen understanding

const chatContainer = document.getElementById('chatContainer');
const inputForm = document.getElementById('inputForm');
const userInput = document.getElementById('userInput');

// Conversation history for context-aware responses
let conversationHistory = [];

// Categories of Socratic questioning techniques
const questioningStrategies = {
    clarification: [
        "What do you mean when you say '{keyword}'?",
        "Could you put that another way?",
        "What do you think is the main issue here?",
        "Can you give me an example of what you mean?",
        "How would you explain this to someone who disagrees?",
        "What is it about this that matters most to you?",
        "When you say that, what are you assuming to be true?"
    ],
    assumptions: [
        "What are you assuming when you say that?",
        "Is that always the case, or could there be exceptions?",
        "Why do you think you hold this belief?",
        "What would have to be true for your view to be wrong?",
        "Have you always thought this way, or did something change your mind?",
        "What if the opposite were true — what would that look like?",
        "Is this something you've reasoned through, or something you've absorbed from others?"
    ],
    evidence: [
        "What evidence supports this view?",
        "How do you know this to be true?",
        "What experiences led you to this conclusion?",
        "Is there anything that contradicts this belief?",
        "If you had to convince a skeptic, what would you say?",
        "Are there other explanations you haven't considered?",
        "What would change your mind about this?"
    ],
    perspectives: [
        "How might someone with a completely different background see this?",
        "What would a person who disagrees with you say?",
        "Are there other ways to look at this?",
        "Who might be affected differently by this?",
        "If you were arguing the other side, what would your strongest point be?",
        "What might you be overlooking?",
        "How does this look from a perspective other than your own?"
    ],
    consequences: [
        "If this is true, what follows from it?",
        "What are the implications of thinking this way?",
        "How does this belief influence your actions?",
        "If everyone believed this, what would the world look like?",
        "What are the risks of being wrong about this?",
        "Where does this line of thinking ultimately lead?",
        "What would be the practical effects of acting on this belief?"
    ],
    metaQuestions: [
        "Why do you think I'm asking you about this?",
        "How does this question make you feel, and what might that feeling reveal?",
        "What is it about this topic that draws your attention?",
        "Do you find it easy or difficult to examine this belief? Why?",
        "What would it mean for you personally if your view changed?",
        "Is this something you want to be true, or something you've concluded is true?",
        "What's the deeper question behind what you're asking?"
    ]
};

// Topic detection patterns for more relevant responses
const topicPatterns = {
    belief: /\b(believe|think|feel|opinion|view|sure|certain|know|truth)\b/i,
    morality: /\b(right|wrong|good|bad|evil|moral|ethical|should|ought|fair|just)\b/i,
    identity: /\b(i am|i'm|my identity|who i|myself|self|personality|character)\b/i,
    knowledge: /\b(know|learn|understand|wise|wisdom|ignorant|education|truth|fact)\b/i,
    purpose: /\b(purpose|meaning|why|reason|goal|point|matter|worth|value)\b/i,
    emotion: /\b(happy|sad|angry|fear|love|hate|anxious|depressed|joy|content)\b/i,
    relationship: /\b(friend|family|love|partner|people|social|trust|together|alone)\b/i,
    success: /\b(success|fail|achieve|goal|ambition|career|money|rich|poor)\b/i,
    change: /\b(change|different|new|old|transform|grow|evolve|stuck|same)\b/i,
    freedom: /\b(free|freedom|choice|decide|control|power|liberty|constrain)\b/i
};

// Generate Socratic response based on user input
function generateSocraticResponse(userMessage) {
    const message = userMessage.toLowerCase().trim();
    
    // Detect what topics are present
    const detectedTopics = [];
    for (const [topic, pattern] of Object.entries(topicPatterns)) {
        if (pattern.test(message)) {
            detectedTopics.push(topic);
        }
    }

    // Select questioning strategy based on conversation depth and topics
    let strategy = selectStrategy(detectedTopics, message);
    
    // Build a thoughtful multi-question response
    let response = buildResponse(strategy, message, detectedTopics);
    
    return response;
}

function selectStrategy(topics, message) {
    const turnCount = conversationHistory.length;
    
    // Early in conversation: focus on clarification
    if (turnCount <= 2) {
        return 'clarification';
    }
    
    // If user seems certain: probe assumptions
    if (/\b(obviously|clearly|everyone knows|of course|always|never|definitely)\b/i.test(message)) {
        return 'assumptions';
    }
    
    // If making a claim: ask for evidence
    if (/\b(because|since|therefore|proves|shows that|evidence)\b/i.test(message)) {
        return 'evidence';
    }
    
    // If discussing people or society: explore perspectives
    if (topics.includes('relationship') || topics.includes('morality')) {
        return 'perspectives';
    }
    
    // If discussing actions or future: explore consequences
    if (topics.includes('purpose') || topics.includes('change') || topics.includes('success')) {
        return 'consequences';
    }
    
    // Deeper in conversation: use meta-questions
    if (turnCount > 5) {
        return 'metaQuestions';
    }
    
    // Default: rotate through strategies
    const strategies = Object.keys(questioningStrategies);
    return strategies[turnCount % strategies.length];
}

function buildResponse(strategy, message, topics) {
    const questions = questioningStrategies[strategy];
    
    // Pick 1-2 questions that feel relevant
    let selectedQuestions = [];
    let shuffled = [...questions].sort(() => Math.random() - 0.5);
    
    // Take first question
    selectedQuestions.push(shuffled[0]);
    
    // Sometimes add a follow-up from a different strategy (30% chance)
    if (Math.random() > 0.7 && conversationHistory.length > 1) {
        const otherStrategies = Object.keys(questioningStrategies).filter(s => s !== strategy);
        const otherStrategy = otherStrategies[Math.floor(Math.random() * otherStrategies.length)];
        const otherQuestions = questioningStrategies[otherStrategy];
        selectedQuestions.push(otherQuestions[Math.floor(Math.random() * otherQuestions.length)]);
    }

    // Build contextual preamble
    let preamble = getContextualPreamble(message, topics);
    
    // Compose final response
    let response = preamble;
    selectedQuestions.forEach((q, i) => {
        // Replace {keyword} placeholder with a relevant word from user message
        q = personalizeQuestion(q, message);
        response += (i > 0 ? '\n\n' : '') + q;
    });
    
    return response;
}

function getContextualPreamble(message, topics) {
    const preambles = {
        belief: [
            "Interesting — you hold this as a conviction. Let me ask: ",
            "A belief worth examining. Consider this: ",
            "You speak with conviction. But I wonder: "
        ],
        morality: [
            "Matters of right and wrong deserve careful thought. ",
            "Ethics is a territory where few have firm ground. ",
            "You touch on something deeply human. "
        ],
        identity: [
            "The self is perhaps the hardest thing to know. ",
            "Who we are is a question we never fully answer. ",
            "You speak of yourself — that takes courage. "
        ],
        knowledge: [
            "The wisest among us know how little they know. ",
            "Knowledge is a peculiar thing. ",
            "Ah, the pursuit of understanding. "
        ],
        purpose: [
            "Purpose — the question that haunts us all. ",
            "You seek meaning. That itself is meaningful. ",
            "The 'why' is always harder than the 'what.' "
        ],
        emotion: [
            "Feelings are data, not directives. ",
            "Your emotions are telling you something. ",
            "There's wisdom in what you feel, if you examine it. "
        ],
        default: [
            "Let us examine this together. ",
            "An interesting thought. Let me probe further: ",
            "I hear you. Now consider: ",
            "There's something worth unpacking here. ",
            "Let's go deeper. "
        ]
    };
    
    // Pick a relevant preamble
    let category = 'default';
    for (const topic of topics) {
        if (preambles[topic]) {
            category = topic;
            break;
        }
    }
    
    const options = preambles[category];
    return options[Math.floor(Math.random() * options.length)];
}

function personalizeQuestion(question, message) {
    if (question.includes('{keyword}')) {
        // Extract a meaningful word from the user's message
        const words = message.split(/\s+/).filter(w => w.length > 4);
        const keyword = words.length > 0 
            ? words[Math.floor(Math.random() * words.length)] 
            : 'that';
        question = question.replace('{keyword}', keyword.replace(/[^a-zA-Z]/g, ''));
    }
    return question;
}

// UI Functions

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
    
    // Simulate thinking time (varies by message length)
    const thinkTime = Math.min(800 + message.length * 15, 2500);
    
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
