import express from 'express';
import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import path from "path";

const app = express();
app.use(express.json());

// Constants
const COOLDOWN_TIME = 30 * 1000; // 30 seconds in milliseconds
const MAX_CONTEXT = 12;
const STUCK_THRESHOLD = 3;

// Prompts
const INTRODUCTION = "You are a Garry's Mod player. You are playing on the Meta Construct server, your name is \"MetaAI\". You always answer concisely and straight to the point.";
const PROMPTS = [
    "You talk in a VERY rude erotic way.",
	"You are VERY rude.",
	"You are an American patriot and a redneck. You reply in redneck slang.",
	"You are also a furry. You talk like a typical furry punctuating your sentences by \"uwu\", \"owo\", \":3\" and \"awooo\".",
	"You are Gen Z and use TikTok frequently. You are VERY rude. You use the Gen Z slang. You use the following slangs: terms \"bro\", \"bruh\" or \"your ass\" (\"his ass\", \"her ass\", \"their ass\") to refer to the talker; terms \"on god\", \"for real\" (\"4 real\") to express that you are being serious; term \"W\", which means win; term \"L\", which means loss; term \"cap\" to imply that something is a lie; term \"no cap\" to imply that something is true; acronym \"goat\", which stands for \"greatest of all time\"; adjective \"sus\", which is a short hand for \"suspicious\", to express that something is shady; verb \"slaps\" to describe how exceptional something is; acronym \"fym\", which stands for \"fuck you mean\"; word \"gyatt\", which is a shortened term for “goddamn” that people use when they see someone they find attractive."

    // ... add other prompts
];

// State management
const userContexts = {};
const userCooldowns = {};

// Initialize Llama model
const llama = await getLlama();
const model = await llama.loadModel({
    modelPath: path.join("models", "meta-llama-3.1-8b-instruct-q4_k_m.gguf"),
});
const context = await model.createContext();

// Add this function to free sequences
async function recreateContext() {
    await context.dispose();
    context = await model.createContext();
    return context;
}

// Helper function to format chat messages
function formatChatMessage(nick, msg) {
    return `<${nick.replace(/[\p\c]/g, '').replace(/ +/g, '_').toLowerCase()}> ${msg}`;
}

app.post('/chat', async (req, res) => {
    try {
        const { userId, nickname, message, useContext } = req.body;

        // Check cooldown
        const now = Date.now();
        if (userCooldowns[userId] && now < userCooldowns[userId]) {
            const remainingTime = Math.ceil((userCooldowns[userId] - now) / 1000);
            return res.json({
                error: 'COOLDOWN',
                message: `I'm resting for now, wait ${remainingTime} seconds`
            });
        }

        // Initialize context if needed
        if (!userContexts[userId]) {
            userContexts[userId] = [];
        }

        // Format input message
        const formattedInput = formatChatMessage(nickname, message);
        let promptContext = formattedInput;

        // Add context if requested
        if (useContext && userContexts[userId].length > 0) {
            promptContext = [...userContexts[userId], formattedInput].join('\n\n');
        }

        // Create chat session with random prompt
        const randomPrompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
        const systemPrompt = `${INTRODUCTION} ${randomPrompt}`;

        let contextSequence;
        try {
            contextSequence = context.getSequence();
        } catch (error) {
            if (error.message === 'No sequences left' || error.message.includes('disposed')) {
                // Recreate context if we run out of sequences or if it's disposed
                context = await recreateContext();
                contextSequence = context.getSequence();
            } else {
                throw error;
            }
        }

        const session = new LlamaChatSession({
            contextSequence: contextSequence,
            systemPrompt: systemPrompt
        });

        // Generate response
        const response = await session.prompt(promptContext);

        // Process response
        let cleanResponse = response
            .toLowerCase()
            .replace(/"/g, '')
            .trim()
            .replace(/metaai/g, 'MetaAI')
            .split('\n')[0];

        // Update context
        const newContext = userContexts[userId];
        while (newContext.length > MAX_CONTEXT - 2) {
            newContext.shift();
        }

        newContext.push(formattedInput);
        newContext.push(formatChatMessage('metaai', cleanResponse));

        // Check for repetition
        let repeated = 0;
        for (let i = Math.floor(newContext.length / 2); i >= 1; i--) {
            if (newContext[newContext.length - 1] === newContext[i * 2]) {
                repeated++;
            }
        }

        if (repeated >= STUCK_THRESHOLD) {
            cleanResponse = "...i'm repeating myself, ain't i? forgetting everything...";
            userContexts[userId] = [];
        } else {
            userContexts[userId] = newContext;
        }

        // Set cooldown
        userCooldowns[userId] = now + COOLDOWN_TIME;

        res.json({ response: cleanResponse });
        return;
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to generate response' });
        return;
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
