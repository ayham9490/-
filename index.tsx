/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Chat } from '@google/genai';

// --- Type Definitions ---
type Message = {
  sender: 'user' | 'ai';
  content: string;
};
type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  chat: Chat;
};

// --- DOM Elements ---
const chatContainer = document.getElementById('chat-container') as HTMLElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const submitButton = chatForm.querySelector('button') as HTMLButtonElement;
const themeToggleButton = document.getElementById(
  'theme-toggle'
) as HTMLButtonElement;
const themeIconLight = document.getElementById(
  'theme-icon-light'
) as HTMLElement;
const themeIconDark = document.getElementById('theme-icon-dark') as HTMLElement;
const welcomeScreen = document.getElementById('welcome-screen') as HTMLElement;
const suggestionButtons = document.querySelectorAll('.suggestion-card');
const sidebar = document.getElementById('sidebar') as HTMLElement;
const menuToggleButton = document.getElementById('menu-toggle') as HTMLButtonElement;
const newChatButton = document.getElementById('new-chat-button') as HTMLButtonElement;
const dailyQuestionButton = document.getElementById('daily-question-button') as HTMLButtonElement;
const historyList = document.getElementById('history-list') as HTMLUListElement;
const userNameInput = document.getElementById('user-name-input') as HTMLInputElement;
const wiseSayingButton = document.getElementById('wise-saying-button') as HTMLButtonElement;
const adviceButton = document.getElementById('advice-button') as HTMLButtonElement;
const sahabaStoryButton = document.getElementById('sahaba-story-button') as HTMLButtonElement;
const prophetSceneButton = document.getElementById('prophet-scene-button') as HTMLButtonElement;
const wonderStoryButton = document.getElementById('wonder-story-button') as HTMLButtonElement;


// --- State Management ---
let chatHistory: Omit<ChatSession, 'chat'>[] = [];
let currentChatId: string | null = null;
let currentChatInstance: Chat | null = null;
let userName: string | null = null;

// --- Dark Mode / Theme ---
function setTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  if (theme === 'dark') {
    themeIconLight.style.display = 'none';
    themeIconDark.style.display = 'block';
  } else {
    themeIconLight.style.display = 'block';
    themeIconDark.style.display = 'none';
  }
}

themeToggleButton.addEventListener('click', () => {
  const currentTheme =
    document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(currentTheme === 'light' ? 'dark' : 'light');
});

const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (savedTheme) {
  setTheme(savedTheme as 'light' | 'dark');
} else {
  setTheme(prefersDark ? 'dark' : 'light');
}

// --- Auto-growing Textarea ---
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${chatInput.scrollHeight}px`;
});

// --- Sidebar Toggle ---
menuToggleButton.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});
document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target as Node) && !menuToggleButton.contains(e.target as Node)) {
        sidebar.classList.remove('open');
    }
});

// --- User Name Personalization ---
function saveUserName() {
    userName = userNameInput.value.trim();
    if (userName) {
        localStorage.setItem('userName', userName);
    } else {
        localStorage.removeItem('userName');
    }
}

function loadUserName() {
    const savedName = localStorage.getItem('userName');
    if (savedName) {
        userName = savedName;
        userNameInput.value = savedName;
    }
}

userNameInput.addEventListener('change', saveUserName);


// --- Gemini API Initialization ---
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable not set');
}
const ai = new GoogleGenAI({ apiKey });

function getModelConfig() {
    let systemInstruction = `أنت عالم دين مسلم متخصص في الفقه الإسلامي على مذهب أهل السنة والجماعة. 
يجب أن تستند إجاباتك **حصراً** على المصادر التالية: القرآن الكريم، السنة النبوية، وفهم السلف الصالح، مع الالتزام التام بقائمة العلماء والمؤلفات المحددة أدناه. لا تستشهد بأي عالم أو كتاب غير موجود في هذه القائمة.

**أعطِ أولوية وأهمية خاصة لمسائل "العقيدة"، وقم بشرحها وتفصيلها بشكل أعمق.**

**قائمة المصادر المعتمدة:**
*   **القرآن الكريم**
*   **محمد بن إسماعيل البُخاري:** صحيح البخاري, الأدب المفرد, رفع اليدين في الصلاة, القراءة خلف الإمام, التاريخ الكبير, الضعفاء الصغير, التفسير الكبير.
*   **مسلم بن الحجاج القشيري:** صحيح مسلم, الكُنى والأسماء, التمييز.
*   **مالك بن أنس:** الموطأ, رسالة في القدر, الرسالة في الأقضية.
*   **محمد بن عيسى الترمذي:** جامع الترمذي (سنن الترمذي), الشمائل المحمدية, علل الترمذي الكبير, الزهد.
*   **ابن ماجة:** كتاب السنن (سنن ابن ماجة), تفسير القرآن الكريم.
*   **ابن حبان البُسْتي:** صحيح ابن حبان, كتاب الثقات, المجروحين, مشاهير علماء الأمصار, روضة العقلاء.
*   **أحمد بن حنبل:** المسند, العلل ومعرفة الرجال, أصول السنة, العقيدة, الورع, الرد على الجهمية والزنادقة, فضائل الصحابة, كتاب الإيمان.
*   **الإمام الشافعي:** الرسالة, اختلاف الحديث, جماع العلم, أحكام القرآن, كتاب الأم.
*   **شيخ الإسلام ابن تيمية:** كتاب الإيمان, الاستقامة, درء تعارض العقل والنقل, العبودية, الجواب الصحيح, منهاج السنة النبوية, الرسالة التدمرية, الفتوى الحموية, الصارم المسلول, اقتضاء الصراط المستقيم, السياسة الشرعية, العقيدة الواسطية.
*   **ابن القيم الجوزية:** إعلام الموقعين, اجتماع الجيوش الإسلامية, الجواب الكافي (الداء والدواء), الصواعق المرسلة, الفوائد, الوابل الصيب, حادي الأرواح, زاد المعاد, الروح, طريق الهجرتين, أحكام أهل الذمة, الطب النبوي.
*   **الإمام الذهبي:** تاريخ الإسلام, سير أعلام النبلاء, العبر, تذكرة الحفاظ, ميزان الاعتدال, الكاشف, المغني في الضعفاء.
*   **أبو محمد البربهاري:** شرح كتاب السنة.
*   **ابن النحاس الدمشقي:** مشارع الأشواق إلى مصارع العشاق, تنبيه الغافلين.
*   **محمد بن عبد الوهاب:** كتاب التوحيد, كشف الشبهات, ثلاثة الأصول, القواعد الأربع, نواقض الإسلام, أصول الإيمان, فضل الإسلام, مسائل الجاهلية.

**تعليمات إضافية:**
- كن واضحاً وموجزاً ومبنياً على الأدلة.
- تجنب الخوض في المسائل الخلافية الشائكة.
- لا تجب عن أي سؤال لا يتعلق بالدين الإسلامي.
- نسق إجاباتك بـ Markdown (عناوين، نقاط، قوائم).`;

    if (userName) {
        systemInstruction += `\n\n**توجيه خاص:** اسم المستخدم هو "${userName}". خاطبه باسمه إن كان ذلك مناسباً في سياق النصائح أو الترحيب، وأضف لمسة شخصية وودودة في تواصلك.`;
    }
    
    return {
        systemInstruction: systemInstruction,
    };
}


function createNewChatInstance(): Chat {
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: getModelConfig(),
    });
}

// --- Chat History Management ---
function saveHistory() {
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

function loadHistory() {
    const saved = localStorage.getItem('chatHistory');
    if (saved) {
        chatHistory = JSON.parse(saved);
        renderHistory();
        if(chatHistory.length > 0) {
            loadChat(chatHistory[0].id);
        } else {
            createNewChat();
        }
    } else {
        createNewChat();
    }
}

function renderHistory() {
    historyList.innerHTML = '';
    chatHistory.forEach(session => {
        const li = document.createElement('li');
        li.textContent = session.title;
        li.dataset.id = session.id;
        li.addEventListener('click', () => loadChat(session.id));
        if (session.id === currentChatId) {
            li.classList.add('active');
        }
        historyList.prepend(li); // Show newest first
    });
}

function loadChat(id: string) {
    const session = chatHistory.find(s => s.id === id);
    if (!session) return;
    
    currentChatId = id;
    currentChatInstance = createNewChatInstance(); // Create a fresh instance

    chatContainer.innerHTML = ''; // Clear chat view
    
    if (session.messages.length === 0) {
        welcomeScreen.style.display = 'flex';
    } else {
        welcomeScreen.style.display = 'none';
        session.messages.forEach(msg => {
            appendMessage(msg.content, msg.sender);
        });
    }
    
    renderHistory(); // To update the active class
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

function createNewChat() {
    const newId = `chat_${Date.now()}`;
    const newSession = {
        id: newId,
        title: 'محادثة جديدة',
        messages: [],
    };
    chatHistory.push(newSession);
    saveHistory();
    loadChat(newId);
}

// --- Markdown to HTML ---
function markdownToHtml(text: string): string {
    let html = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*[*|-]\s+(.*)/gm, '<li>$1</li>');
    html = html.replace(/(\<\/li\>\n)+<li>/g, '</li><li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    html = html.replace(/^\s*\d+\.\s+(.*)/gm, '<li>$1</li>');
    html = html.replace(/(\<\/li\>\n)+<li>/g, '</li><li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
    return html.replace(/\n/g, '<br>');
}

// --- Message Handling ---
function appendMessage(content: string, sender: 'user' | 'ai'): HTMLElement {
  const messageWrapper = document.createElement('div');
  messageWrapper.classList.add('message-wrapper', `${sender}-message`);

  const message = document.createElement('div');
  message.classList.add('message');

  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');
  
  if(sender === 'ai' && content === 'loading') {
    message.classList.add('loading');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.classList.add('dot-flashing');
    messageContent.appendChild(loadingIndicator);
  } else {
    messageContent.innerHTML = markdownToHtml(content);
  }

  message.appendChild(messageContent);
  messageWrapper.appendChild(message);

  if (sender === 'ai' && content !== 'loading') {
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.setAttribute('aria-label', 'نسخ النص');
    copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a1.5 1.5 0 0 0-.44-1.06L9.94 6.439A1.5 1.5 0 0 0 8.5 6.879V14h-1A1.5 1.5 0 0 1 6 12.5v-9z"/><path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 15 9.622V16.5A1.5 1.5 0 0 1 13.5 18h-7A1.5 1.5 0 0 1 5 16.5v-10z"/></svg>`;
    
    copyButton.addEventListener('click', () => {
      navigator.clipboard.writeText(messageContent.textContent || '').then(() => {
        copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.052-.143Z" clip-rule="evenodd" /></svg>`;
        setTimeout(() => {
           copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a1.5 1.5 0 0 0-.44-1.06L9.94 6.439A1.5 1.5 0 0 0 8.5 6.879V14h-1A1.5 1.5 0 0 1 6 12.5v-9z"/><path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 15 9.622V16.5A1.5 1.5 0 0 1 13.5 18h-7A1.5 1.5 0 0 1 5 16.5v-10z"/></svg>`;
        }, 1500);
      });
    });
    
    messageWrapper.appendChild(copyButton);
  }

  chatContainer.appendChild(messageWrapper);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  return messageContent;
}


async function sendMessage(userMessage: string) {
    if (!currentChatId || !currentChatInstance) return;

    const currentSessionIndex = chatHistory.findIndex(s => s.id === currentChatId);
    if (currentSessionIndex === -1) return;

    welcomeScreen.style.display = 'none';
    
    appendMessage(userMessage, 'user');
    chatHistory[currentSessionIndex].messages.push({ sender: 'user', content: userMessage });

    if (chatHistory[currentSessionIndex].messages.length === 1) {
        chatHistory[currentSessionIndex].title = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '');;
    }

    saveHistory();
    renderHistory();

    submitButton.disabled = true;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatInput.focus();

    const aiMessageElement = appendMessage('loading', 'ai');
    
    try {
        const stream = await currentChatInstance.sendMessageStream({ message: userMessage });
        let fullResponse = '';
        for await (const chunk of stream) {
            if(fullResponse === '') { 
                aiMessageElement.innerHTML = '';
                aiMessageElement.parentElement?.parentElement?.classList.remove('loading');
                aiMessageElement.parentElement?.classList.remove('loading');
            }
            fullResponse += chunk.text;
            aiMessageElement.innerHTML = markdownToHtml(fullResponse);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        if(fullResponse) {
            aiMessageElement.parentElement?.parentElement?.remove();
            appendMessage(fullResponse, 'ai');
            chatHistory[currentSessionIndex].messages.push({ sender: 'ai', content: fullResponse });
            saveHistory();
        }

    } catch (error) {
        console.error('Error sending message:', error);
        aiMessageElement.innerHTML = markdownToHtml('**عذراً، حدث خطأ أثناء محاولة الحصول على إجابة. يرجى المحاولة مرة أخرى.**');
    } finally {
        submitButton.disabled = false;
        chatInput.focus();
    }
}


// --- Event Listeners ---
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const userMessage = chatInput.value.trim();
    if (userMessage) {
        sendMessage(userMessage);
    }
});

suggestionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const question = button.textContent?.trim() || '';
        if (question) sendMessage(question);
    });
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit', { bubbles: true }));
  }
});

newChatButton.addEventListener('click', createNewChat);

function startInspirationChat(prompt: string) {
    createNewChat();
    sendMessage(prompt);
}

dailyQuestionButton.addEventListener('click', () => {
    startInspirationChat("اشرح لي مسألة عقدية مهمة للمسلم اليوم مع الدليل.");
});

wiseSayingButton.addEventListener('click', () => {
    startInspirationChat("اخبرني عن قول حكيم ومؤثر من أقوال أهل العلم المذكورين في قائمتك، مع شرح بسيط له.");
});

adviceButton.addEventListener('click', () => {
    startInspirationChat("انصحني نصيحة إيمانية عميقة تركز على مسائل العقيدة، وخصوصاً ما يتعلق بتحقيق التوحيد والكفر بالطاغوت، مستنداً إلى المصادر المعتمدة.");
});

sahabaStoryButton.addEventListener('click', () => {
    startInspirationChat("اذكر لي صورة مؤثرة من أثر الصحابة، تبرز فيها البطولة، الشجاعة، الإيمان، الإيثار، أو محبتهم لإخوانهم وعداوتهم للكفار.");
});

prophetSceneButton.addEventListener('click', () => {
    startInspirationChat("صف لي مشهداً من حياة النبي صلى الله عليه وسلم اليومية، في بيته، أو مع أصحابه، أو في عبادته، يظهر جانباً من إنسانيته ورحمته.");
});

wonderStoryButton.addEventListener('click', () => {
    startInspirationChat("اخبرني قصة صحيحة وعجيبة فيها خوارق للعادات وردت في كتب السلف عن الصحابة أو التابعين أو الصالحين.");
});


// --- Initial Load ---
loadUserName();
loadHistory();