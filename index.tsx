/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Chat, GenerateContentResponse } from '@google/genai';

// --- Type Definitions ---
type WebGroundingChunk = {
    web: {
        uri: string;
        title: string;
    }
};

type Message = {
  sender: 'user' | 'ai';
  content: string;
  sources?: WebGroundingChunk[];
};

const CHAT_CATEGORIES = {
    'العقيدة': 'العقيدة',
    'الفقه': 'الفقه',
    'الحديث': 'الحديث',
    'السيرة': 'السيرة',
    'uncategorized': 'غير مصنف'
} as const;

type ChatCategory = keyof typeof CHAT_CATEGORIES;


type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  chat: Chat;
  category: ChatCategory;
};

// --- DOM Elements ---
const appLayout = document.getElementById('app-layout') as HTMLElement;
const chatContainer = document.getElementById('chat-container') as HTMLElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const submitButton = chatForm.querySelector('button[type="submit"]') as HTMLButtonElement;
const welcomeScreen = document.getElementById('welcome-screen') as HTMLElement;
const suggestionButtons = document.querySelectorAll('.suggestion-card');
const sidebar = document.getElementById('sidebar') as HTMLElement;
const sidebarToggleButton = document.getElementById('sidebar-toggle') as HTMLButtonElement;
const menuToggleButton = document.getElementById('menu-toggle') as HTMLButtonElement;
const newChatButton = document.getElementById('new-chat-button') as HTMLButtonElement;
const historyListContainer = document.getElementById('history-list-container') as HTMLDivElement;
const userNameInput = document.getElementById('user-name-input') as HTMLInputElement;
const increaseFontButton = document.getElementById('increase-font') as HTMLButtonElement;
const decreaseFontButton = document.getElementById('decrease-font') as HTMLButtonElement;

// Font Selector Elements
const fontSelectorToggle = document.getElementById('font-selector-toggle') as HTMLButtonElement;
const fontSelectorPopup = document.getElementById('font-selector-popup') as HTMLElement;
const fontOptionButtons = document.querySelectorAll('.font-option-button') as NodeListOf<HTMLButtonElement>;

const promptSuggestionsToggleButton = document.getElementById('prompt-suggestions-toggle') as HTMLButtonElement;
const promptSuggestionsPopup = document.getElementById('prompt-suggestions-popup') as HTMLElement;
const popupSuggestionButtons = document.querySelectorAll('.popup-suggestion-button');
const popupSuggestionTextButtons = document.querySelectorAll('.popup-suggestion-text-button');
const userMessageTemplate = document.getElementById('user-message-template') as HTMLTemplateElement;
const aiMessageTemplate = document.getElementById('ai-message-template') as HTMLTemplateElement;

// Encyclopedia Elements (in sidebar)
const encyclopediaSearchForm = document.getElementById('encyclopedia-search-form') as HTMLFormElement;
const encyclopediaSearchInput = document.getElementById('encyclopedia-search-input') as HTMLInputElement;
const encyclopediaResults = document.getElementById('encyclopedia-results') as HTMLElement;

// Delete Modal Elements
const deleteConfirmModal = document.getElementById('delete-confirm-modal') as HTMLElement;
const cancelDeleteBtn = document.getElementById('cancel-delete-btn') as HTMLButtonElement;
const confirmDeleteBtn = document.getElementById('confirm-delete-btn') as HTMLButtonElement;


// --- State Management ---
let chatHistory: Omit<ChatSession, 'chat'>[] = [];
let currentChatId: string | null = null;
let currentChatInstance: Chat | null = null;
let userName: string | null = null;
let chatToDeleteId: string | null = null; // To store which chat we're about to delete

// --- Auto-growing Textarea ---
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${chatInput.scrollHeight}px`;
});

// --- Sidebar Toggle (Desktop) ---
sidebarToggleButton.addEventListener('click', () => {
    appLayout.classList.toggle('sidebar-collapsed');
});

// --- Sidebar Toggle (Mobile) ---
menuToggleButton.addEventListener('click', () => {
    sidebar.classList.toggle('open');
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

**مهم جداً: أجب بإيجاز واختصار أولاً كقاعدة عامة. بعد تقديم الإجابة المختصرة، اسأل المستخدم دائماً إذا كان يرغب في شرح أوسع أو تفاصيل أكثر، على سبيل المثال: "هل تود المزيد من التفاصيل حول هذه المسألة؟".**

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
*   **الإمام الذهبي:** تاريخ الإسلام, سير أعلام النبولاء, العبر, تذكرة الحفاظ, ميزان الاعتدال, الكاشف, المغني في الضعفاء.
*   **أبو محمد البربهاري:** شرح كتاب السنة.
*   **ابن النحاس الدمشقي:** مشارع الأشواق إلى مصارع العشاق, تنبيه الغافلين.
*   **محمد بن عبد الوهاب:** كتاب التوحيد, كشف الشبهات, ثلاثة الأصول, القواعد الأربع, نواقض الإسلام, أصول الإيمان, فضل الإسلام, مسائل الجاهلية.

**تعليمات إضافية:**
- كن واضحاً ومبنياً على الأدلة.
- تجنب الخوض في المسائل الخلافية الشائكة.
- لا تجب عن أي سؤال لا يتعلق بالدين الإسلامي.
- نسق إجاباتك بـ Markdown (عناوين، نقاط، قوائم).`;

    if (userName) {
        systemInstruction += `\n\n**توجيه خاص:** اسم المستخدم هو "${userName}". خاطبه باسمه إن كان ذلك مناسباً في سياق النصائح أو الترحيب، وأضف لمسة شخصية وودودة في تواصلك.`;
    }
    
    return {
        systemInstruction: systemInstruction,
        tools: [{googleSearch: {}}],
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
        const parsedHistory = JSON.parse(saved);
        // Simple migration for old history without categories
        chatHistory = parsedHistory.map((session: any) => ({
            ...session,
            category: session.category || 'uncategorized'
        }));
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
    historyListContainer.innerHTML = '';
    
    const groupedByCategory = chatHistory.reduce((acc, session) => {
        const category = session.category || 'uncategorized';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(session);
        return acc;
    }, {} as Record<ChatCategory, typeof chatHistory>);

    Object.entries(groupedByCategory).forEach(([category, sessions]) => {
        if (sessions.length === 0) return;

        const details = document.createElement('details');
        details.className = 'history-category';
        details.open = true;

        const summary = document.createElement('summary');
        summary.className = 'history-category-title';
        summary.textContent = CHAT_CATEGORIES[category as ChatCategory];
        
        const ul = document.createElement('ul');

        sessions.sort((a,b) => parseInt(b.id.split('_')[1]) - parseInt(a.id.split('_')[1])).forEach(session => {
            const li = document.createElement('li');
            li.className = 'history-list-item';
            li.dataset.id = session.id;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'history-item-title';
            titleSpan.textContent = session.title;
            li.appendChild(titleSpan);
            
            li.addEventListener('click', (e) => {
                if((e.target as HTMLElement).closest('.history-item-menu')) return;
                loadChat(session.id)
            });

            if (session.id === currentChatId) {
                li.classList.add('active');
            }

            // Move menu
            const menuDiv = document.createElement('div');
            menuDiv.className = 'history-item-menu';
            
            const menuButton = document.createElement('button');
            menuButton.className = 'history-item-menu-button';
            menuButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" /></svg>`;
            
            const dropdown = document.createElement('div');
            dropdown.className = 'history-item-menu-dropdown';

            Object.keys(CHAT_CATEGORIES).filter(cat => cat !== category).forEach(catKey => {
                const moveButton = document.createElement('button');
                moveButton.textContent = `نقل إلى ${CHAT_CATEGORIES[catKey as ChatCategory]}`;
                moveButton.onclick = () => {
                    moveChatToCategory(session.id, catKey as ChatCategory);
                };
                dropdown.appendChild(moveButton);
            });

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.textContent = 'حذف';
            deleteButton.onclick = () => {
                chatToDeleteId = session.id;
                deleteConfirmModal.classList.add('visible');
            };
            dropdown.appendChild(deleteButton);

            menuDiv.appendChild(menuButton);
            menuDiv.appendChild(dropdown);
            li.appendChild(menuDiv);

            menuButton.addEventListener('click', () => {
                // Close other dropdowns first
                document.querySelectorAll('.history-item-menu-dropdown.visible').forEach(d => {
                    if (d !== dropdown) d.classList.remove('visible');
                });
                dropdown.classList.toggle('visible');
            });

            ul.appendChild(li);
        });

        details.appendChild(summary);
        details.appendChild(ul);
        historyListContainer.appendChild(details);
    });
}

function moveChatToCategory(chatId: string, newCategory: ChatCategory) {
    const chatIndex = chatHistory.findIndex(c => c.id === chatId);
    if(chatIndex > -1) {
        chatHistory[chatIndex].category = newCategory;
        saveHistory();
        renderHistory();
    }
}


function loadChat(id: string) {
    const session = chatHistory.find(s => s.id === id);
    if (!session) return;
    
    currentChatId = id;
    currentChatInstance = createNewChatInstance();

    chatContainer.innerHTML = '';
    
    if (session.messages.length === 0) {
        welcomeScreen.style.display = 'flex';
    } else {
        welcomeScreen.style.display = 'none';
        session.messages.forEach(msg => {
            appendMessage(msg.content, msg.sender, msg.sources);
        });
    }
    
    renderHistory();
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

function createNewChat() {
    const newId = `chat_${Date.now()}`;
    const newSession = {
        id: newId,
        title: 'محادثة جديدة',
        messages: [],
        category: 'uncategorized' as ChatCategory,
    };
    chatHistory.push(newSession);
    saveHistory();
    loadChat(newId);
}

// --- Delete Chat Logic ---
function hideDeleteModal() {
    deleteConfirmModal.classList.remove('visible');
    chatToDeleteId = null;
}

function handleDeleteChat() {
    if (!chatToDeleteId) return;

    const chatIndex = chatHistory.findIndex(c => c.id === chatToDeleteId);
    if (chatIndex > -1) {
        const wasCurrentChat = currentChatId === chatToDeleteId;
        chatHistory.splice(chatIndex, 1);
        saveHistory();

        if (wasCurrentChat) {
            if (chatHistory.length > 0) {
                // Load the most recent chat instead of the first one
                const mostRecentChat = chatHistory.slice().sort((a, b) => parseInt(b.id.split('_')[1]) - parseInt(a.id.split('_')[1]))[0];
                loadChat(mostRecentChat.id);
            } else {
                createNewChat();
            }
        } else {
            // If it wasn't the current chat, just re-render the history
            renderHistory();
        }
    }
    hideDeleteModal();
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

// --- Share Helpers ---
function downloadFile(blob: Blob, fileName: string) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

async function handleShareAsText(content: string) {
    try {
        if (navigator.share) {
            await navigator.share({
                title: 'مشاركة من تطبيق القيم',
                text: content,
            });
        } else {
            await navigator.clipboard.writeText(content);
            alert('المشاركة غير مدعومة على هذا المتصفح. تم نسخ النص إلى الحافظة.');
        }
    } catch (error) {
        if ((error as DOMException).name === 'AbortError') {
            return; // User cancelled the share, do nothing.
        }
        console.error('Error sharing or copying text:', error);
        alert('حدث خطأ أثناء المشاركة أو النسخ.');
    }
}

async function handleShareAsPdf(content: string, title: string, triggerButton: HTMLButtonElement) {
    if (triggerButton.disabled) return;
    const originalContent = triggerButton.innerHTML;
    triggerButton.disabled = true;
    triggerButton.innerHTML = `<div class="mini-loader"></div> <span>جاري التجهيز...</span>`;

    try {
        const { default: html2pdf } = await import('https://esm.sh/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js');
        const element = document.createElement('div');
        element.innerHTML = content;
        element.style.padding = '20px';
        element.style.fontFamily = getComputedStyle(document.body).getPropertyValue('--font-family');
        element.style.direction = 'rtl';
        element.style.fontSize = '16px';
        
        const blob = await html2pdf().from(element).set({
             margin: 1,
             filename: `${title}.pdf`,
             html2canvas: { scale: 2 },
             jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        }).output('blob');

        const file = new File([blob], `${title}.pdf`, { type: 'application/pdf' });
        
        if (navigator.share && (navigator as any).canShare({ files: [file] })) {
             try {
                await navigator.share({
                    files: [file],
                    title: title,
                });
            } catch (error) {
                if ((error as DOMException).name === 'NotAllowedError' || (error as DOMException).name === 'AbortError') {
                    console.warn('Share failed, falling back to download:', error);
                    alert('فشلت المشاركة المباشرة. سيتم تنزيل الملف بدلاً من ذلك.');
                    downloadFile(blob, `${title}.pdf`);
                } else {
                    console.error('Error sharing PDF:', error);
                    alert('حدث خطأ أثناء محاولة المشاركة.');
                }
            }
        } else {
            console.warn('Web Share API cannot share this file, falling back to download.');
            alert('المشاركة غير مدعومة. سيتم تنزيل الملف بدلاً من ذلك.');
            downloadFile(blob, `${title}.pdf`);
        }

    } catch(e) {
        console.error("Error generating PDF:", e);
        alert('حدث خطأ أثناء إنشاء ملف PDF.');
    } finally {
        triggerButton.disabled = false;
        triggerButton.innerHTML = originalContent;
    }
}

async function handleShareAsImage(contentHtml: string, triggerButton: HTMLButtonElement) {
    if (triggerButton.disabled) return;
    const originalContent = triggerButton.innerHTML;
    triggerButton.disabled = true;
    triggerButton.innerHTML = `<div class="mini-loader"></div> <span>جاري التجهيز...</span>`;

    let generator = document.getElementById('story-generator');
    if (generator) generator.remove();

    try {
        // 1. Clean content and generate title
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHtml;
        const textContent = (tempDiv.textContent || '').replace(/هل تود.*?$/, '').trim();

        let title = "مشاركة من تطبيق القيم";
        try {
            const titleResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `اقترح عنواناً موجزاً جداً (3 إلى 5 كلمات) للنص التالي:\n\n"${textContent.substring(0, 500)}"`,
            });
            const generatedTitle = titleResponse.text.trim();
            if (generatedTitle) {
                title = generatedTitle;
            }
        } catch (titleError) {
            console.warn("Could not generate title, using default.", titleError);
        }

        // 2. Create generator element
        generator = document.createElement('div');
        generator.id = 'story-generator';
        generator.innerHTML = `
            <div class="story-header"><h1>${title}</h1></div>
            <div class="story-content">${markdownToHtml(textContent)}</div>
            <div class="story-footer">تم إنشاؤه بواسطة تطبيق القيم</div>
        `;
        generator.style.fontFamily = getComputedStyle(document.body).getPropertyValue('--font-family');
        document.body.appendChild(generator);

        // 3. Generate image blob
        const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1');
        const canvas = await html2canvas(generator, {
            useCORS: true,
            backgroundColor: null,
        });
        
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        
        if (!blob) {
            throw new Error('فشل في إنشاء الصورة (canvas.toBlob returned null).');
        }

        const file = new File([blob], 'share.png', { type: 'image/png' });
        
        // 4. Attempt to share, with download fallback
        if (navigator.share && (navigator as any).canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: title,
                });
            } catch (error) {
                if ((error as DOMException).name === 'NotAllowedError' || (error as DOMException).name === 'AbortError') {
                    console.warn('Share failed, falling back to download:', error);
                    alert('فشلت المشاركة المباشرة. سيتم تنزيل الملف بدلاً من ذلك.');
                    downloadFile(blob, 'share.png');
                } else {
                    console.error('Error sharing image:', error);
                    alert('حدث خطأ أثناء محاولة المشاركة.');
                }
            }
        } else {
            console.warn('Web Share API cannot share this file, falling back to download.');
            alert('المشاركة غير مدعومة. سيتم تنزيل الملف بدلاً من ذلك.');
            downloadFile(blob, 'share.png');
        }

    } catch(e) {
        console.error("Error generating image:", e);
        alert('حدث خطأ أثناء إنشاء الصورة.');
    } finally {
        generator?.remove();
        triggerButton.disabled = false;
        triggerButton.innerHTML = originalContent;
    }
}


// --- Message Handling ---
function appendMessage(content: string, sender: 'user' | 'ai', sources?: WebGroundingChunk[]): HTMLElement {
  const template = sender === 'user' ? userMessageTemplate : aiMessageTemplate;
  const messageClone = template.content.cloneNode(true) as DocumentFragment;

  const messageWrapper = messageClone.firstElementChild as HTMLElement;
  const messageContent = messageClone.querySelector('.message-content') as HTMLElement;
  
  if(sender === 'ai' && content === 'loading') {
    messageWrapper.querySelector('.message')?.classList.add('loading');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.classList.add('dot-flashing');
    messageContent.appendChild(loadingIndicator);
  } else {
    messageContent.innerHTML = markdownToHtml(content);
  }

  if (sender === 'ai' && content !== 'loading') {
    const copyButton = messageClone.querySelector('.copy-button') as HTMLButtonElement;
    const [copyIcon, checkIcon] = copyButton.querySelectorAll('svg');

    copyButton.addEventListener('click', () => {
      navigator.clipboard.writeText(messageContent.textContent || '').then(() => {
        copyIcon.style.display = 'none';
        checkIcon.style.display = 'block';
        setTimeout(() => {
           copyIcon.style.display = 'block';
           checkIcon.style.display = 'none';
        }, 1500);
      });
    });

    const shareButton = messageClone.querySelector('.share-button') as HTMLButtonElement;
    const shareMenu = messageClone.querySelector('.share-menu') as HTMLDivElement;
    shareButton.addEventListener('click', (e) => {
      e.stopPropagation();
      shareMenu.classList.toggle('visible');
    });

    const shareTextButton = messageClone.querySelector('.share-text') as HTMLButtonElement;
    shareTextButton.onclick = () => handleShareAsText(messageContent.textContent || '');

    const sharePdfButton = messageClone.querySelector('.share-pdf') as HTMLButtonElement;
    sharePdfButton.onclick = () => {
        const currentSession = chatHistory.find(s => s.id === currentChatId);
        const title = currentSession?.title || 'محادثة من تطبيق القيم';
        handleShareAsPdf(messageContent.innerHTML, title, sharePdfButton);
    };

    const shareImageButton = messageClone.querySelector('.share-image') as HTMLButtonElement;
    shareImageButton.onclick = () => handleShareAsImage(messageContent.innerHTML, shareImageButton);

    // Add sources
    if (sources && sources.length > 0) {
        const sourcesContainer = document.createElement('div');
        sourcesContainer.className = 'message-sources';

        const sourcesTitle = document.createElement('h4');
        sourcesTitle.className = 'sources-title';
        sourcesTitle.textContent = 'المصادر:';
        sourcesContainer.appendChild(sourcesTitle);

        const sourcesList = document.createElement('ul');
        sourcesList.className = 'sources-list';
        
        sources.forEach((source, index) => {
            if (source.web && source.web.uri) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = source.web.uri;
                a.textContent = source.web.title || source.web.uri;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                
                const sourceNumber = document.createElement('span');
                sourceNumber.className = 'source-number';
                sourceNumber.textContent = `${index + 1}`;
                
                li.appendChild(sourceNumber);
                li.appendChild(a);
                sourcesList.appendChild(li);
            }
        });

        if (sourcesList.hasChildNodes()) {
            messageWrapper.querySelector('.message')?.appendChild(sourcesContainer);
            sourcesContainer.appendChild(sourcesList);
        }
    }
  }

  chatContainer.appendChild(messageClone);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // The element to return for streaming update is the content div of the last appended element.
  return chatContainer.lastElementChild!.querySelector('.message-content') as HTMLElement;
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
        let fullResponseText = '';
        let finalResponse: GenerateContentResponse | null = null;
        for await (const chunk of stream) {
            if(fullResponseText === '') { 
                aiMessageElement.innerHTML = '';
                const messageDiv = aiMessageElement.parentElement;
                messageDiv?.classList.remove('loading');
                messageDiv?.parentElement?.classList.remove('loading');
            }
            fullResponseText += chunk.text;
            finalResponse = chunk;
            aiMessageElement.innerHTML = markdownToHtml(fullResponseText);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        if(fullResponseText) {
            aiMessageElement.closest('.message-wrapper')?.remove();

            const groundingChunks = finalResponse?.candidates?.[0]?.groundingMetadata?.groundingChunks as WebGroundingChunk[] | undefined;

            appendMessage(fullResponseText, 'ai', groundingChunks);
            chatHistory[currentSessionIndex].messages.push({ 
                sender: 'ai', 
                content: fullResponseText,
                sources: groundingChunks,
            });
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

// --- Encyclopedia Search (Dorar.net) ---
async function searchEncyclopedia() {
    const searchTerm = encyclopediaSearchInput.value.trim();
    if (!searchTerm) return;

    encyclopediaResults.innerHTML = `<div class="dot-flashing-wrapper"><div class="dot-flashing"></div></div>`;

    // The Dorar.net API does not support CORS, so we use a reliable public proxy.
    const apiUrl = `https://dorar.net/dorar_api.json?skey=${encodeURIComponent(searchTerm)}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;

    try {
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`فشل الاتصال بالخادم الوكيل (Proxy) برمز الحالة: ${response.status}`);
        }
        
        const proxyData = await response.json();
        const dorarResponseText = proxyData.contents;
        
        if (proxyData.status.http_code !== 200 || !dorarResponseText) {
             throw new Error('لم يتمكن الخادم الوكيل من جلب البيانات. قد يكون موقع الدرر السنية غير متاح حالياً.');
        }

        const data = JSON.parse(dorarResponseText);

        encyclopediaResults.innerHTML = '';

        if (data.ahadith && data.ahadith.result.trim() !== '' && data.ahadith.result.trim() !== '<div class="home-link"><a href="https://dorar.net">الرئيسية</a></div>') {
            encyclopediaResults.innerHTML = data.ahadith.result;
        } else {
            encyclopediaResults.innerHTML = `<p>لم يتم العثور على نتائج.</p>`;
        }
    } catch (error) {
        let message = 'يرجى المحاولة مرة أخرى.';
        if (error instanceof Error) {
            message = error.message;
        }
        
        console.error('Error fetching from Dorar.net via proxy:', error);
        encyclopediaResults.innerHTML = `<p>حدث خطأ أثناء البحث. ${message}</p>`;
    }
}


// --- Font Size Controller ---
const FONT_SIZES = [14, 15, 16, 17, 18, 19, 20];
let currentFontSizeIndex = 3;

function applyFontSize() {
    const newSize = FONT_SIZES[currentFontSizeIndex];
    document.documentElement.style.setProperty('--base-font-size', `${newSize}px`);
    localStorage.setItem('fontSizeIndex', currentFontSizeIndex.toString());
    decreaseFontButton.disabled = currentFontSizeIndex === 0;
    increaseFontButton.disabled = currentFontSizeIndex === FONT_SIZES.length - 1;
}

function loadFontSize() {
    const savedIndex = localStorage.getItem('fontSizeIndex');
    if (savedIndex) {
        currentFontSizeIndex = parseInt(savedIndex, 10);
    }
    applyFontSize();
}

increaseFontButton.addEventListener('click', () => {
    if (currentFontSizeIndex < FONT_SIZES.length - 1) {
        currentFontSizeIndex++;
        applyFontSize();
    }
});

decreaseFontButton.addEventListener('click', () => {
    if (currentFontSizeIndex > 0) {
        currentFontSizeIndex--;
        applyFontSize();
    }
});


// --- Font Family Controller ---
const DEFAULT_FONT = "'Amiri', serif";

function applyFontFamily(family: string) {
    document.documentElement.style.setProperty('--font-family', family);
    localStorage.setItem('fontFamily', family);
    
    fontOptionButtons.forEach(btn => {
        if (btn.dataset.font === family) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function loadFontFamily() {
    const savedFamily = localStorage.getItem('fontFamily') || DEFAULT_FONT;
    applyFontFamily(savedFamily);
}

fontSelectorToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    fontSelectorPopup.classList.toggle('active');
});

fontOptionButtons.forEach(button => {
    button.addEventListener('click', () => {
        const fontFamily = button.dataset.font;
        if (fontFamily) {
            applyFontFamily(fontFamily);
            fontSelectorPopup.classList.remove('active');
        }
    });
});


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

const inspirationPrompts: { [key: number]: string } = {
    0: "اخبرني عن قول من أقوال أهل العلم الحكيمة ذات الدلالات العميقة في فهم الدين التي ذكروها في كتبهم.",
    1: "انصحني نصيحة إيمانية عميقة تركز على مسائل العقيدة، وما يجب على المسلم الموحد فعله أو اعتقاده بزمن الفتن، وخصص شيئاً من التركيز على مسائل الكفر بالطاغوت لتحقيق التوحيد (فتنة الحاكمية لغير الله)، بإيجاز.",
    2: "اذكر لي صورة من قصص الصحابة تبرز مواقفهم من بطولات وشجاعة وإيمان وإيثار وحب لإخوانهم ومعاداة للكفار من كتب أهل العلم. وفي بداية كل قصة اذكر نبذة عن الصحابي مثل: مولده، إسلامه، لقبه إن وجد، ووفاته.",
    3: "اذكر لي مشهداً من السيرة النبوية يصور حياة النبي صلى الله عليه وسلم في بيته، أو في الطريق، أو بين أصحابه، أو في الجهاد، أو في العبادة، أو في الأكل والنوم والضحك والحزن والغضب والسرور.",
    4: "اذكر لي قصة صحيحة وردت في كتب السلف فيها عجب وخوارق للعادات للصحابة أو التابعين أو العباد."
};

promptSuggestionsToggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    promptSuggestionsPopup.classList.toggle('active');
});

popupSuggestionButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
        const prompt = inspirationPrompts[index];
        if (prompt) {
            startInspirationChat(prompt);
            promptSuggestionsPopup.classList.remove('active');
        }
    });
});

popupSuggestionTextButtons.forEach(button => {
    button.addEventListener('click', () => {
        const question = button.textContent?.trim() || '';
        if (question) {
            sendMessage(question);
            promptSuggestionsPopup.classList.remove('active');
        }
    });
});


encyclopediaSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchEncyclopedia();
});

cancelDeleteBtn.addEventListener('click', hideDeleteModal);
confirmDeleteBtn.addEventListener('click', handleDeleteChat);

// Global click listener to close popups
document.addEventListener('click', (e) => {
    // Close history dropdowns
    document.querySelectorAll('.history-item-menu-dropdown.visible').forEach(dropdown => {
        if (!dropdown.parentElement?.contains(e.target as Node)) {
            dropdown.classList.remove('visible');
        }
    });

    // Close share menus
    document.querySelectorAll('.share-menu.visible').forEach(menu => {
        if (!menu.parentElement?.contains(e.target as Node)) {
            menu.classList.remove('visible');
        }
    });

    // Close font selector popup
    if (!fontSelectorPopup.contains(e.target as Node) && !fontSelectorToggle.contains(e.target as Node)) {
        fontSelectorPopup.classList.remove('active');
    }

    // Close prompt suggestions popup
    if (!promptSuggestionsPopup.contains(e.target as Node) && !promptSuggestionsToggleButton.contains(e.target as Node)) {
        promptSuggestionsPopup.classList.remove('active');
    }

    // Close mobile sidebar
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target as Node) && !menuToggleButton.contains(e.target as Node)) {
        sidebar.classList.remove('open');
    }
});


// --- Initial Load ---
loadUserName();
loadFontSize();
loadFontFamily();
loadHistory();