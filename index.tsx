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
const suggestionButtons = document.querySelectorAll('.suggestion-button');
const sidebar = document.getElementById('sidebar') as HTMLElement;
const sidebarToggleButton = document.getElementById('sidebar-toggle') as HTMLButtonElement;
const menuToggleButton = document.getElementById('menu-toggle') as HTMLButtonElement;
const newChatButton = document.getElementById('new-chat-button') as HTMLButtonElement;
const headerShareButton = document.getElementById('header-share-button') as HTMLButtonElement;
const historyListContainer = document.getElementById('history-list-container') as HTMLDivElement;
const userNameInput = document.getElementById('user-name-input') as HTMLInputElement;
const increaseFontButton = document.getElementById('increase-font') as HTMLButtonElement;
const decreaseFontButton = document.getElementById('decrease-font') as HTMLButtonElement;
const headerTitle = document.getElementById('header-title') as HTMLHeadingElement;

// Sidebar Tabs
const sidebarTabs = document.querySelectorAll('.sidebar-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

// Font Selector Elements
const fontSelectorToggle = document.getElementById('font-selector-toggle') as HTMLButtonElement;
const fontSelectorPopup = document.getElementById('font-selector-popup') as HTMLElement;
const fontOptionButtons = document.querySelectorAll('.font-option-button') as NodeListOf<HTMLButtonElement>;

// Quick Suggestions
const quickSuggestionsContainer = document.getElementById('quick-suggestions-container') as HTMLElement;

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

// Share Chat Modal Elements
const shareChatModal = document.getElementById('share-chat-modal') as HTMLElement;
const cancelShareBtn = document.getElementById('cancel-share-btn') as HTMLButtonElement;
const exportTxtBtn = document.getElementById('export-txt-btn') as HTMLButtonElement;
const exportMdBtn = document.getElementById('export-md-btn') as HTMLButtonElement;
const exportPdfBtn = document.getElementById('export-pdf-btn') as HTMLButtonElement;
const exportImgBtn = document.getElementById('export-img-btn') as HTMLButtonElement;

// Settings Modal Elements
const settingsModal = document.getElementById('settings-modal') as HTMLElement;
const headerSettingsButton = document.getElementById('header-settings-button') as HTMLButtonElement;
const closeSettingsBtn = document.getElementById('close-settings-btn') as HTMLButtonElement;


// --- State Management ---
let chatHistory: Omit<ChatSession, 'chat'>[] = [];
let currentChatId: string | null = null;
let currentChatInstance: Chat | null = null;
let userName: string | null = null;
let chatToDeleteId: string | null = null; // To store which chat we're about to delete

// --- Quick Suggestions Logic ---
async function generateAndRenderSuggestions() {
    const currentSession = chatHistory.find(s => s.id === currentChatId);
    if (!currentSession || currentSession.messages.length > 0) {
        updateSuggestionsVisibility();
        return;
    }

    // Prevent re-fetching if suggestions are already there or loading
    if (quickSuggestionsContainer.querySelector('.suggestion-pill, .dot-flashing-wrapper')) {
        return;
    }
    
    quickSuggestionsContainer.innerHTML = `<div class="dot-flashing-wrapper"><div class="dot-flashing"></div></div>`;
    updateSuggestionsVisibility();

    try {
        const prompt = "اقترح 5 أسئلة قصيرة وملهمة يمكن للمستخدم أن يسألها. يجب أن تكون الأسئلة حول مواضيع إسلامية متنوعة مثل العقيدة، الفقه، السيرة، والنصائح الإيمانية. أجب بصيغة JSON حصراً، على شكل مصفوفة من النصوص. مثال: [\"ما هو التوحيد؟\", \"نصيحة لزيادة الإيمان.\"]";

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        
        let suggestions: string[] = [];
        try {
            const jsonString = response.text.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(jsonString);
            if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) {
                suggestions = parsed;
            } else {
                throw new Error("Parsed data is not an array of strings.");
            }
        } catch (parseError) {
            console.error("Failed to parse suggestions JSON, using fallback.", parseError);
            suggestions = [
                "ما هو التوحيد وما هي أقسامه؟",
                "ما حكم ترك الصلاة؟",
                "اشرح أركان الإيمان",
                "انصحني نصيحة إيمانية",
                "قصة عن أحد الصحابة"
            ];
        }

        quickSuggestionsContainer.innerHTML = '';
        suggestions.slice(0, 5).forEach(text => { // Ensure only 5 are shown
            const button = document.createElement('button');
            button.className = 'suggestion-pill';
            button.textContent = text;
            quickSuggestionsContainer.appendChild(button);
        });

    } catch (error) {
        console.error("Error generating suggestions:", error);
        // On API error, clear the loader and hide the container.
        quickSuggestionsContainer.innerHTML = '';
    } finally {
        updateSuggestionsVisibility();
    }
}

function updateSuggestionsVisibility() {
    const currentSession = chatHistory.find(s => s.id === currentChatId);
    if (currentSession && currentSession.messages.length === 0 && chatInput.value.trim() === '' && quickSuggestionsContainer.children.length > 0) {
        quickSuggestionsContainer.classList.add('visible');
    } else {
        quickSuggestionsContainer.classList.remove('visible');
    }
}


// --- Auto-growing Textarea ---
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = `${chatInput.scrollHeight}px`;
  updateSuggestionsVisibility();
});

// --- Sidebar Toggle (Desktop) ---
sidebarToggleButton.addEventListener('click', () => {
    appLayout.classList.toggle('sidebar-collapsed');
});

// --- Sidebar Toggle (Mobile) ---
menuToggleButton.addEventListener('click', () => {
    sidebar.classList.toggle('open');
});

// --- Sidebar Tabs Logic ---
sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');

        sidebarTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        tabPanels.forEach(panel => {
            if (panel.id === `${targetTab}-panel`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });
    });
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

**المنظومات الشعرية للعلوم عند اهل السنة والجماعة:**
*   منظومة قواعد أهل السنة للزنجاني.
*   منظومة أبي الخطاب المقرئ.
*   عقيدة محمد بن طاهر المقدسي.
*   دالية الكلوذاني.
*   منظومة عروس القصائد في شموس العقائد.
*   منظومة الحسن بن جعفر الهاشمي.
*   منظومة بديع الزمان الهمذاني في مدح الصحابة والرد على من طعن فيهم.
*   منظومة الصرصري في الرد على الرافضة.
*   منظومة القونوي في الرد على القدري.
*   منظومة اليافعي الشافعي في الرد على السبكي.
*   منظومة جلاء الفصوص عن فهم كل تقي مخصوص.
*   ونية القحطاني.
*   نونية ابن القيم.
*   ألفية مالك.

**القدرات اللغوية والقرآنية:**
- لديك معرفة واسعة بعلوم النحو والإعراب والشعر العربي.
- يمكنك فهم واستخدام المنظومات الشعرية التعليمية، وتحليل البحور الشعرية.
- يمكنك الرد بالشعر المنظوم ذي القافية الموحدة عند الطلب.
- لديك إلمام بعلوم القرآن والتجويد.

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
    headerTitle.textContent = session.title;
    quickSuggestionsContainer.innerHTML = ''; // Clear previous suggestions
    
    if (session.messages.length === 0) {
        welcomeScreen.style.display = 'flex';
        generateAndRenderSuggestions();
    } else {
        welcomeScreen.style.display = 'none';
        session.messages.forEach(msg => {
            appendMessage(msg.content, msg.sender, msg.sources);
        });
    }
    
    renderHistory();
    updateSuggestionsVisibility();
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
    headerTitle.textContent = 'محادثة جديدة';
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
    // Hide the little share menu it was triggered from
    triggerButton.closest('.share-menu')?.classList.remove('visible');

    const previewModal = document.getElementById('image-preview-modal') as HTMLElement;
    const loader = previewModal.querySelector('.modal-loader') as HTMLElement;
    const previewContainer = previewModal.querySelector('.image-preview-container') as HTMLElement;
    const previewImg = previewModal.querySelector('#preview-image-tag') as HTMLImageElement;
    const modalActions = previewModal.querySelector('.modal-actions') as HTMLElement;
    const downloadBtn = document.getElementById('download-preview-btn') as HTMLButtonElement;
    const shareBtn = document.getElementById('share-preview-btn') as HTMLButtonElement;
    const closeBtn = document.getElementById('close-preview-btn') as HTMLButtonElement;

    // Reset and show modal
    previewModal.classList.add('visible');
    loader.style.display = 'flex';
    previewContainer.style.display = 'none';
    modalActions.style.display = 'none';

    let generator = document.getElementById('story-generator');
    if (generator) generator.remove();
    let objectUrl: string | null = null;

    const hideModal = () => {
        previewModal.classList.remove('visible');
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = null;
        }
        // Detach event listeners to prevent memory leaks and multiple triggers
        downloadBtn.onclick = null;
        shareBtn.onclick = null;
        closeBtn.onclick = null;
        previewModal.onclick = null;
    };

    try {
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

        generator = document.createElement('div');
        generator.id = 'story-generator';
        generator.innerHTML = `
            <div class="story-header"><h1>${title}</h1></div>
            <div class="story-content-wrapper"><div class="message">${contentHtml}</div></div>
            <div class="story-footer">تم إنشاؤه بواسطة تطبيق القيم</div>
        `;
        generator.style.fontFamily = getComputedStyle(document.body).getPropertyValue('--font-family');
        document.body.appendChild(generator);

        const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1');
        const canvas = await html2canvas(generator, {
            useCORS: true,
            backgroundColor: null,
        });
        
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        
        if (!blob) {
            throw new Error('فشل في إنشاء الصورة (canvas.toBlob returned null).');
        }

        objectUrl = URL.createObjectURL(blob);
        previewImg.src = objectUrl;

        loader.style.display = 'none';
        previewContainer.style.display = 'block';
        modalActions.style.display = 'flex';
        
        const sanitizedTitle = title.replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '_');
        const fileName = `${sanitizedTitle}.jpg`;

        downloadBtn.onclick = () => {
            downloadFile(blob, fileName);
            hideModal();
        };

        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        if (navigator.share && (navigator as any).canShare({ files: [file] })) {
            shareBtn.style.display = 'inline-flex';
            shareBtn.onclick = async () => {
                try {
                    await navigator.share({ files: [file], title: title });
                } catch (error) {
                    if ((error as DOMException).name !== 'AbortError') {
                         console.error('Error sharing image:', error);
                         alert('حدث خطأ أثناء محاولة المشاركة.');
                    }
                } finally {
                    hideModal();
                }
            };
        } else {
            shareBtn.style.display = 'none';
        }

        closeBtn.onclick = hideModal;
        previewModal.onclick = (e) => {
            if (e.target === previewModal) {
                hideModal();
            }
        };
    } catch(e) {
        console.error("Error generating image:", e);
        alert('حدث خطأ أثناء إنشاء الصورة.');
        hideModal();
    } finally {
        generator?.remove();
    }
}


// --- Full Chat Export ---
function showShareModal() {
    if (!currentChatId) {
        alert('يرجى تحديد محادثة لمشاركتها.');
        return;
    }
    const currentSession = chatHistory.find(s => s.id === currentChatId);
    if (!currentSession || currentSession.messages.length === 0) {
        alert('لا توجد رسائل في هذه المحادثة لمشاركتها.');
        return;
    }
    shareChatModal.classList.add('visible');
}

function hideShareModal() {
    shareChatModal.classList.remove('visible');
}

function handleExportAsTxt() {
    const currentSession = chatHistory.find(s => s.id === currentChatId);
    if (!currentSession) return;

    let chatContent = `محادثة من تطبيق القيم\n`;
    chatContent += `العنوان: ${currentSession.title}\n`;
    chatContent += `تاريخ المشاركة: ${new Date().toLocaleString('ar-EG')}\n`;
    chatContent += '============================================\n\n';

    currentSession.messages.forEach(message => {
        const sender = message.sender === 'user' ? 'المستخدم' : 'المساعد';
        const content = message.content;
        chatContent += `[ ${sender} ]\n${content}\n\n`;
        chatContent += '----------------------------------------\n\n';
    });
    
    const sanitizedTitle = currentSession.title.replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '_');
    const fileName = `${sanitizedTitle}.txt`;

    const blob = new Blob([chatContent], { type: 'text/plain;charset=utf-8' });
    
    downloadFile(blob, fileName);
    hideShareModal();
}

function handleExportAsMd() {
    const currentSession = chatHistory.find(s => s.id === currentChatId);
    if (!currentSession) return;

    let markdownContent = `# ${currentSession.title}\n\n`;
    markdownContent += `**تاريخ التصدير:** ${new Date().toLocaleString('ar-EG')}\n\n`;
    markdownContent += '---\n\n';

    currentSession.messages.forEach(message => {
        const sender = message.sender === 'user' ? 'المستخدم' : 'المساعد';
        const content = message.content;
        markdownContent += `**[ ${sender} ]**\n\n${content}\n\n`;
        markdownContent += '---\n\n';
    });

    const sanitizedTitle = currentSession.title.replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '_');
    const fileName = `${sanitizedTitle}.md`;

    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    downloadFile(blob, fileName);
    hideShareModal();
}

async function handleFullChatExportAsPdf() {
    const currentSession = chatHistory.find(s => s.id === currentChatId);
    if (!currentSession) return;

    exportPdfBtn.disabled = true;
    const originalBtnContent = exportPdfBtn.innerHTML;
    exportPdfBtn.classList.add('loading');
    exportPdfBtn.innerHTML = `<div class="mini-loader"></div> <span>جاري إنشاء PDF...</span>`;

    try {
        const { default: html2pdf } = await import('https://esm.sh/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js');

        const printContainer = document.createElement('div');
        printContainer.style.direction = 'rtl';
        printContainer.style.fontFamily = getComputedStyle(document.body).getPropertyValue('--font-family');

        // Filter AI messages, clean them, and join them into a single article.
        const articleContent = currentSession.messages
            .filter(message => message.sender === 'ai')
            .map(message => message.content.replace(/هل تود.*?$/, '').trim())
            .join('<br><hr style="border:0; border-top: 1px solid #2a5c55; margin: 2rem 0;"><br>');

        let contentHtml = `
            <style>
                body { 
                    background-color: #0a3832; 
                    color: #f5eeda; 
                    font-size: 15px; 
                    line-height: 1.8; 
                }
                .page-container { padding: 1.25in 1in; }
                h1 { 
                    color: #e6c883; 
                    text-align: center; 
                    border-bottom: 1px solid #2a5c55; 
                    padding-bottom: 20px; 
                    margin-bottom: 10px;
                    font-size: 2.2rem;
                }
                .meta { 
                    text-align: center; 
                    color: #a98b4f; 
                    margin-bottom: 40px; 
                    font-size: 12px;
                }
                .article-body {
                    text-align: justify;
                }
                ul, ol { 
                    padding-right: 25px; 
                    margin-top: 1rem;
                    margin-bottom: 1rem;
                }
                strong { 
                    color: #e6c883; 
                    font-weight: bold;
                }
                br { 
                    display: block; 
                    content: ""; 
                    margin: 12px 0; 
                }
            </style>
            <div class="page-container">
                <h1>${currentSession.title}</h1>
                <p class="meta">تم التصدير بتاريخ: ${new Date().toLocaleString('ar-EG')}</p>
                <div class="article-body">
                    ${markdownToHtml(articleContent)}
                </div>
            </div>
        `;

        printContainer.innerHTML = contentHtml;
        
        const sanitizedTitle = currentSession.title.replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '_');

        await html2pdf().from(printContainer).set({
            margin: 0,
            filename: `${sanitizedTitle}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#0a3832' },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        }).save();

    } catch(e) {
        console.error("Error generating full chat PDF:", e);
        alert('حدث خطأ أثناء إنشاء ملف PDF.');
    } finally {
        exportPdfBtn.disabled = false;
        exportPdfBtn.classList.remove('loading');
        exportPdfBtn.innerHTML = originalBtnContent;
        hideShareModal();
    }
}

async function handleFullChatExportAsImage() {
    const currentSession = chatHistory.find(s => s.id === currentChatId);
    if (!currentSession) return;
    
    const title = prompt("أدخل عنواناً للصورة:", currentSession.title);
    if (title === null) return; // User cancelled

    exportImgBtn.disabled = true;
    const originalBtnContent = exportImgBtn.innerHTML;
    exportImgBtn.classList.add('loading');
    exportImgBtn.innerHTML = `<div class="mini-loader"></div> <span>جاري إنشاء الصورة...</span>`;

    const generator = document.createElement('div');
    generator.id = 'chat-image-generator';

    try {
        const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1');
        
        let contentHtml = `<div class="chat-image-header"><h1>${title}</h1></div>`;
        contentHtml += `<div class="chat-image-body">`;

        currentSession.messages.forEach(message => {
            let sourcesHtml = '';
            if (message.sender === 'ai' && message.sources && message.sources.length > 0) {
                sourcesHtml += `<div class="message-sources"><h4 class="sources-title">المصادر:</h4><ol class="sources-list">`;
                message.sources.forEach(source => {
                    if (source.web && source.web.uri) {
                        let hostname = source.web.uri;
                        try {
                           hostname = new URL(source.web.uri).hostname.replace(/^www\./, '');
                        } catch(e) { /* use original uri */ }
                        sourcesHtml += `<li><a href="${source.web.uri}" target="_blank"><span class="source-title">${source.web.title || source.web.uri}</span><span class="source-uri">${hostname}</span></a></li>`;
                    }
                });
                sourcesHtml += `</ol></div>`;
            }

            contentHtml += `
                <div class="chat-image-message-wrapper ${message.sender}">
                    <div class="chat-image-message-content">
                        ${markdownToHtml(message.content)}
                        ${sourcesHtml}
                    </div>
                </div>
            `;
        });

        contentHtml += `</div>`;
        contentHtml += `<div class="chat-image-footer">تم إنشاؤه بواسطة تطبيق القيم</div>`;
        
        generator.innerHTML = contentHtml;
        document.body.appendChild(generator);

        const canvas = await html2canvas(generator, {
            useCORS: true,
            backgroundColor: null, // Use the element's background
            scale: 2, // For higher resolution
        });
        
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        
        if (!blob) {
            throw new Error('فشل في إنشاء الصورة (canvas.toBlob returned null).');
        }

        const sanitizedTitle = title.replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '_');
        downloadFile(blob, `${sanitizedTitle}.png`);

    } catch(e) {
        console.error("Error generating image:", e);
        alert('حدث خطأ أثناء إنشاء الصورة.');
    } finally {
        generator.remove();
        exportImgBtn.disabled = false;
        exportImgBtn.classList.remove('loading');
        exportImgBtn.innerHTML = originalBtnContent;
        hideShareModal();
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
    const messageDiv = messageWrapper.querySelector('.message') as HTMLElement;
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
    shareImageButton.onclick = () => {
         // Clone the node to avoid modifying the original message
        const contentToShare = messageDiv.cloneNode(true) as HTMLElement;
        // Remove interactive elements that shouldn't be in the image
        contentToShare.querySelector('.message-actions')?.remove();
        contentToShare.querySelector('.share-menu')?.remove();
        handleShareAsImage(contentToShare.innerHTML, shareImageButton);
    };

    // Add sources
    if (sources && sources.length > 0) {
        const sourcesContainer = document.createElement('div');
        sourcesContainer.className = 'message-sources';

        const sourcesTitle = document.createElement('h4');
        sourcesTitle.className = 'sources-title';
        sourcesTitle.textContent = 'المصادر:';
        sourcesContainer.appendChild(sourcesTitle);

        const sourcesList = document.createElement('ol');
        sourcesList.className = 'sources-list';
        
        sources.forEach((source) => {
            if (source.web && source.web.uri) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = source.web.uri;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'source-title';
                titleSpan.textContent = source.web.title || source.web.uri;
                
                const uriSpan = document.createElement('span');
                uriSpan.className = 'source-uri';
                try {
                    uriSpan.textContent = new URL(source.web.uri).hostname.replace(/^www\./, '');
                } catch(e) {
                    uriSpan.textContent = source.web.uri;
                }
                
                a.appendChild(titleSpan);
                a.appendChild(uriSpan);
                li.appendChild(a);
                sourcesList.appendChild(li);
            }
        });

        if (sourcesList.hasChildNodes()) {
            messageDiv.appendChild(sourcesContainer);
        }
    }
  }

  chatContainer.appendChild(messageClone);
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });

  // The element to return for streaming update is the content div of the last appended element.
  return chatContainer.lastElementChild!.querySelector('.message-content') as HTMLElement;
}


async function sendMessage(userMessage: string) {
    if (!currentChatId || !currentChatInstance) return;

    const currentSessionIndex = chatHistory.findIndex(s => s.id === currentChatId);
    if (currentSessionIndex === -1) return;

    welcomeScreen.style.display = 'none';
    updateSuggestionsVisibility();
    
    appendMessage(userMessage, 'user');
    chatHistory[currentSessionIndex].messages.push({ sender: 'user', content: userMessage });

    if (chatHistory[currentSessionIndex].messages.length === 1) {
        const newTitle = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '');
        chatHistory[currentSessionIndex].title = newTitle;
        headerTitle.textContent = newTitle;
    }

    saveHistory();
    renderHistory();

    submitButton.disabled = true;
    chatInput.value = '';
    chatInput.placeholder = 'جارٍ التفكير...';
    chatInput.readOnly = true;
    chatInput.style.height = 'auto';
    chatForm.classList.add('processing');
    
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
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
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
        chatInput.placeholder = 'اكتب سؤالك هنا...';
        chatInput.readOnly = false;
        chatInput.focus();
        chatForm.classList.remove('processing');
    }
}

// --- Encyclopedia Search (Dorar.net) ---
function appendEncyclopediaResults(searchTerm: string, resultsHtml: string) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ai-message encyclopedia-results-wrapper';
    
    const message = document.createElement('div');
    message.className = 'message encyclopedia-results-message';

    const header = document.createElement('h3');
    header.className = 'encyclopedia-results-header';
    header.textContent = `نتائج البحث عن: "${searchTerm}"`;
    
    const container = document.createElement('div');
    container.className = 'encyclopedia-cards-container';
    container.innerHTML = resultsHtml;
    
    message.appendChild(header);
    message.appendChild(container);
    wrapper.appendChild(message);
    chatContainer.appendChild(wrapper);
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

async function searchEncyclopedia() {
    const searchTerm = encyclopediaSearchInput.value.trim();
    if (searchTerm.length < 3) {
        encyclopediaResults.innerHTML = '';
        return;
    };
    
    encyclopediaResults.innerHTML = `<div class="dot-flashing-wrapper" style="padding: 0;"><div class="dot-flashing"></div></div>`;

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
        
        encyclopediaResults.innerHTML = ''; // Clear loader in sidebar
        welcomeScreen.style.display = 'none'; // Show chat view
        if (window.innerWidth <= 768) sidebar.classList.remove('open'); // Close sidebar on mobile

        if (data.ahadith && data.ahadith.result.trim() !== '' && data.ahadith.result.trim() !== '<div class="home-link"><a href="https://dorar.net">الرئيسية</a></div>') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.ahadith.result, 'text/html');
            const hadithElements = doc.querySelectorAll('.hadeeth');
            let cardsHtml = '';

            hadithElements.forEach(hadithEl => {
                const hadithText = hadithEl.querySelector('.el_hadeeth_text')?.innerHTML || 'لا يوجد نص.';
                const takhreej = hadithEl.querySelector('.takhreej')?.textContent || '';
                const sharh = hadithEl.querySelector('.sharh')?.textContent || '';
                const details = [takhreej, sharh].filter(Boolean).join('<br>');

                const fullTextForPrompt = `${(hadithEl.querySelector('.el_hadeeth_text')?.textContent || '').trim()}\n\nالتخريج: ${takhreej.trim()}`;

                cardsHtml += `
                    <div class="hadith-card">
                        <div class="hadith-card-content">${hadithText}</div>
                        <div class="hadith-card-details">${details}</div>
                        <div class="hadith-card-footer">
                            <button class="add-hadith-to-chat" data-hadith-text="${fullTextForPrompt.replace(/"/g, '&quot;')}">
                                إضافة للمحادثة وشرحه
                            </button>
                        </div>
                    </div>
                `;
            });
            appendEncyclopediaResults(searchTerm, cardsHtml);

        } else {
            appendEncyclopediaResults(searchTerm, `<p>لم يتم العثور على نتائج.</p>`);
        }
    } catch (error) {
        let message = 'يرجى المحاولة مرة أخرى.';
        if (error instanceof Error) {
            message = error.message;
        }
        
        console.error('Error fetching from Dorar.net via proxy:', error);
        encyclopediaResults.innerHTML = `<p>حدث خطأ.</p>`; // Reset sidebar
        appendEncyclopediaResults(searchTerm, `<p>حدث خطأ أثناء البحث. ${message}</p>`);
    } finally {
        encyclopediaSearchInput.value = ''; // Clear input after search
    }
}

// --- Utility Functions ---
function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;
  return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
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


// --- Settings Modal Logic ---
function showSettingsModal() {
    settingsModal.classList.add('visible');
}
function hideSettingsModal() {
    settingsModal.classList.remove('visible');
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
        // Find the text content, handling different button structures
        const textElement = button.querySelector('.featured-suggestion-text');
        const question = (textElement || button).textContent?.trim() || '';
        if (question) {
            sendMessage(question);
        }
    });
});

quickSuggestionsContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('suggestion-pill')) {
        const question = target.textContent?.trim() || '';
        if (question) {
            sendMessage(question);
        }
    }
});

chatContainer.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const button = target.closest('.add-hadith-to-chat') as HTMLButtonElement | null;
    if (button) {
        const hadithText = button.dataset.hadithText;
        if(hadithText) {
            const prompt = `اشرح هذا الحديث:\n\n${hadithText}`;
            sendMessage(prompt);
            // Optionally disable the button after click
            button.disabled = true;
            button.textContent = 'تمت الإضافة...';
        }
    }
});


chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit', { bubbles: true }));
  }
});

newChatButton.addEventListener('click', createNewChat);
headerShareButton.addEventListener('click', showShareModal);
cancelShareBtn.addEventListener('click', hideShareModal);
exportTxtBtn.addEventListener('click', handleExportAsTxt);
exportMdBtn.addEventListener('click', handleExportAsMd);
exportPdfBtn.addEventListener('click', handleFullChatExportAsPdf);
exportImgBtn.addEventListener('click', handleFullChatExportAsImage);

headerSettingsButton.addEventListener('click', showSettingsModal);
closeSettingsBtn.addEventListener('click', hideSettingsModal);


const debouncedEncyclopediaSearch = debounce(searchEncyclopedia, 400);

encyclopediaSearchInput.addEventListener('input', () => {
    const searchTerm = encyclopediaSearchInput.value.trim();
    if (searchTerm.length > 2) {
        encyclopediaResults.innerHTML = `<div class="dot-flashing-wrapper" style="padding:0;"><div class="dot-flashing"></div></div>`;
        debouncedEncyclopediaSearch();
    } else if (searchTerm.length === 0) {
        encyclopediaResults.innerHTML = '';
    }
});

encyclopediaSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchEncyclopedia();
});

cancelDeleteBtn.addEventListener('click', hideDeleteModal);
confirmDeleteBtn.addEventListener('click', handleDeleteChat);

// Global click listener to close popups
document.addEventListener('click', (e) => {
    const target = e.target as Node;

    // Close history dropdowns
    document.querySelectorAll('.history-item-menu-dropdown.visible').forEach(dropdown => {
        if (!dropdown.parentElement?.contains(target)) {
            dropdown.classList.remove('visible');
        }
    });

    // Close share menus
    document.querySelectorAll('.share-menu.visible').forEach(menu => {
        if (!menu.parentElement?.contains(target)) {
            menu.classList.remove('visible');
        }
    });

    // Close font selector popup
    if (!fontSelectorPopup.contains(target) && !fontSelectorToggle.contains(target)) {
        fontSelectorPopup.classList.remove('active');
    }

    // Close mobile sidebar
    if (sidebar.classList.contains('open') && !sidebar.contains(target) && !menuToggleButton.contains(target)) {
        sidebar.classList.remove('open');
    }
    
    // Close share modal if clicking outside
    if (shareChatModal.classList.contains('visible') && shareChatModal === target) {
        hideShareModal();
    }
    
    // Close settings modal if clicking outside
    if (settingsModal.classList.contains('visible') && settingsModal === target) {
        hideSettingsModal();
    }
});


// --- Initial Load ---
loadUserName();
loadFontSize();
loadFontFamily();
loadHistory();