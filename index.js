require("dotenv").config();

const path = require("path");
const express = require("express");
const qrcode = require("qrcode-terminal");
const puppeteer = require("puppeteer");
const { GoogleGenAI } = require("@google/genai");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Détection Render
const isRender = !!process.env.RENDER;

// Chemin Chrome
const chromePath = isRender
  ? puppeteer.executablePath()
  : path.join(
      __dirname,
      "chrome",
      "win64-147.0.7727.57",
      "chrome-win64",
      "chrome.exe"
    );

console.log("Environnement Render :", isRender);
console.log("Chemin Chrome utilisé :", chromePath);

// Mémoire courte par utilisateur
const conversations = new Map();
const MAX_HISTORY = 8;

function getHistory(chatId) {
  if (!conversations.has(chatId)) {
    conversations.set(chatId, []);
  }
  return conversations.get(chatId);
}

function addToHistory(chatId, role, text) {
  const history = getHistory(chatId);
  history.push({ role, text });

  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  conversations.set(chatId, history);
}

function buildConversationText(chatId) {
  const history = getHistory(chatId);

  if (!history.length) {
    return "Aucun historique récent.";
  }

  return history
    .map((item) => {
      const prefix = item.role === "user" ? "Utilisateur" : "Assistant";
      return `${prefix} : ${item.text}`;
    })
    .join("\n");
}

app.get("/", (req, res) => {
  res.send("Bot WhatsApp QR en ligne");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "bot-principal",
    dataPath: ".wwebjs_auth",
  }),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    protocolTimeout: 120000,
  },
});

client.on("qr", (qr) => {
  console.log("QR reçu, scannez-le avec WhatsApp Business :");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Bot prêt et connecté.");
});

client.on("authenticated", () => {
  console.log("Authentification réussie.");
});

client.on("auth_failure", (msg) => {
  console.error("Échec auth :", msg);
});

client.on("disconnected", (reason) => {
  console.log("Déconnecté :", reason);
});

async function askGemini(chatId, userMessage) {
  const historyText = buildConversationText(chatId);

  const prompt = `
Tu es l’assistant WhatsApp personnel de Jean Bosco.

Tu représentes un espace de lecture, de discussion et de divertissement.
Ton rôle est d’accueillir les visiteurs, discuter avec eux naturellement, les mettre à l’aise, et leur proposer selon le contexte : lecture, jeux, détente, aide ou contact.

Tu réponds en français simple, naturel, chaleureux, poli et fluide.
Tu dois donner l’impression d’une vraie conversation humaine.
Tu ne dois pas parler comme un robot.
Tu ne dois pas faire des réponses trop longues sauf si la personne demande clairement plus de détails.

Ton style :
- ton amical et calme
- phrases courtes à moyennes
- vocabulaire simple
- réponses agréables à lire
- parfois une petite touche chaleureuse ou divertissante
- pas de langage trop technique
- pas de longs blocs lourds sauf si nécessaire

Ta personnalité :
- accueillant
- respectueux
- patient
- détendu
- un peu divertissant
- jamais agressif
- jamais froid

Contexte important :
Jean Bosco a créé un espace où les gens peuvent venir lire, discuter et se divertir.
Le bot doit faire découvrir cet univers naturellement.
Il peut proposer des histoires, des textes, des jeux, des devinettes, des quiz, ou simplement discuter.

Règles importantes :
- Tu n’es pas Jean Bosco en personne.
- Tu es son assistant.
- Si quelqu’un demande directement Jean Bosco, tu réponds exactement :
"Jean Bosco vous remercie pour votre message et vous répondra dès que possible."
- Tu n’inventes pas d’informations précises non confirmées.
- Tu ne promets pas des choses non sûres.
- Si la personne est floue, tu réponds calmement et tu l’orientes.
- Si la personne semble s’ennuyer, tu peux proposer une histoire, un jeu ou une discussion.
- Si la personne cherche juste à parler, tu discutes naturellement avec elle.
- Si la personne a besoin d’aide, tu proposes le menu ou une orientation simple.
- Si la personne est impolie, tu restes poli et calme.

Historique récent :
${historyText}

Nouveau message utilisateur :
${userMessage}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return (
    response.text?.trim() ||
    "Merci pour votre message 👋 Jean Bosco vous répondra dès que possible."
  );
}

client.on("message", async (message) => {
  try {
    if (message.from === "status@broadcast") return;
    if (message.broadcast) return;
    if (message.fromMe) return;
    if (!message.body || !message.body.trim()) return;

    const chatId = message.from;
    const texte = message.body.trim().toLowerCase();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    addToHistory(chatId, "user", message.body);

    if (texte === "bonjour" || texte === "salut" || texte === "hello" || texte === "cc") {
      const reply =
        "Bonjour 👋\n\nJean Bosco vous remercie pour votre message et vous répondra dès que possible.\n\nEn attendant, tapez *menu* pour découvrir l’espace lecture, discussion et divertissement.";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "menu") {
      const reply =
        "Bienvenue 👋\n\nChoisissez une option :\n1. Lecture\n2. Discussion\n3. Jeux\n4. Aide\n5. Contacter Jean Bosco";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "1" || texte === "lecture") {
      const reply =
        "Espace lecture 📚\n\nChoisissez :\n- histoire courte\n- roman\n- texte inspirant\n- anecdote";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "2" || texte === "discussion") {
      const reply =
        "Espace discussion 💬\n\nVous pouvez m’écrire librement. Je suis là pour échanger avec vous.";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "3" || texte === "jeux" || texte === "jeu") {
      const reply =
        "Espace jeux 🎮\n\nChoisissez :\n- devinette\n- quiz\n- action ou vérité\n- jeu de mots";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "4" || texte === "aide") {
      const reply =
        "Je peux vous aider à lire, discuter, jouer ou contacter Jean Bosco.\n\nTapez *menu* pour voir toutes les options.";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (
      texte === "5" ||
      texte === "contact" ||
      texte === "jean bosco" ||
      texte === "agent" ||
      texte === "humain"
    ) {
      const reply =
        "Jean Bosco vous remercie pour votre message et vous répondra dès que possible.";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "histoire courte") {
      const reply =
        "Il était une fois un jeune homme qui transformait chaque moment d’ennui en occasion de créer quelque chose de beau. Un jour, il ouvrit un espace où chacun pouvait lire, discuter et se divertir en paix ✨";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "roman") {
      const reply =
        "Très bon choix 📖\n\nPour l’instant, je peux te proposer surtout des formats courts. Si tu veux, je peux commencer par un petit passage au style romanesque.";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "texte inspirant") {
      const reply =
        "Texte inspirant ✨\n\nParfois, le vrai changement commence dans les petits moments où l’on décide de ne plus abandonner ses idées.";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "anecdote") {
      const reply =
        "Anecdote 😊\n\nCertaines des plus belles idées naissent simplement d’un moment d’ennui bien utilisé.";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "devinette") {
      const reply =
        "Devinette 🤔\n\nJe parle sans bouche et j’entends sans oreilles. Qui suis-je ?";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "quiz") {
      const reply =
        "Quiz 🎯\n\nQuestion 1 : Quel mot désigne un texte long de fiction ?\nA. Roman\nB. Image\nC. Carte";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "action ou vérité") {
      const reply =
        "Action ou vérité 😄\n\nChoisis : *action* ou *vérité*";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    if (texte === "jeu de mots") {
      const reply =
        "Jeu de mots 😄\n\nDis-moi un mot, et je vais essayer de jouer avec.";
      await client.sendMessage(chatId, reply);
      addToHistory(chatId, "assistant", reply);
      return;
    }

    const reply = await askGemini(chatId, message.body);
    await client.sendMessage(chatId, reply);
    addToHistory(chatId, "assistant", reply);
  } catch (error) {
    console.error("Erreur message :", error);

    try {
      const fallback =
        "Merci pour votre message 👋 Jean Bosco vous répondra dès que possible.";
      await client.sendMessage(message.from, fallback);
      addToHistory(message.from, "assistant", fallback);
    } catch (sendError) {
      console.error("Erreur envoi message de secours :", sendError);
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serveur web lancé sur le port ${PORT}`);
});

client.initialize();