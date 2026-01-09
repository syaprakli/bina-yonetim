console.log("APP_LOADED_BUILD_2026_01_07_1115_PREMIUM_UI");
window.APP_VERSION = "BUILD_2026_01_07_1115";

const app = {
    data: {
        residents: [],
        transactions: [],
        settings: {
            monthlyDues: 500
        },
        savedAnnouncements: []
    },

    init: function () {
        console.log("Uygulama başlatılıyor...");
        this.checkAuth();
        this.cleanupDuplicates(); // Run cleanup on start
    },

    cleanupDuplicates: function () {
        // 0. SPECIFIC FIX: Rename "Ihsan DInc" to "İHSAN DİNÇ" (Door 39)
        let renameOccurred = false;
        app.data.residents.forEach(r => {
            if (r.doorNumber === "39" || r.doorNumber === 39) {
                // Check for loose match or just force it if it's not correct
                if (r.fullName !== "İHSAN DİNÇ") {
                    r.fullName = "İHSAN DİNÇ";
                    renameOccurred = true;
                    console.log("Fixed: İHSAN DİNÇ");
                }
            }
        });
        if (renameOccurred) app.saveData();

        // 1. Fix Duplicate Residents (Same Door + Name Normalized)
        const tracker = {};
        const toDeleteIds = [];
        const replacementMap = {}; // oldId -> newId

        app.data.residents.forEach(r => {
            // Normalize: 14-ZEKERIYABOYNUUZUN
            // Remove all whitespace and convert to upper tr-TR
            const cleanName = r.fullName ? r.fullName.replace(/\s+/g, '').toLocaleUpperCase('tr-TR') : '';
            const key = `${r.doorNumber}-${cleanName}`;

            if (tracker[key]) {
                // Duplicate found!
                toDeleteIds.push(r.id);
                replacementMap[r.id] = tracker[key].id; // Point to the first one found
            } else {
                tracker[key] = r;
            }
        });

        if (toDeleteIds.length > 0) {
            console.warn("Duplicate residents found. Cleaning up...", toDeleteIds);

            // Remove duplicates
            app.data.residents = app.data.residents.filter(r => !toDeleteIds.includes(r.id));

            // Reassign transactions from deleted resident to the kept one
            app.data.transactions.forEach(t => {
                if (replacementMap[t.residentId]) {
                    t.residentId = replacementMap[t.residentId];
                }
            });

            app.saveData();
        }

        // 2. Fix Duplicate Transactions (Double Click issues)
        // Same Resident, Same Amount, Same Date, Same Description, Created within 2000ms (check ID difference)
        const transToDelete = [];
        const seenTrans = {}; // key -> t

        // Sort by ID to process in order of creation
        const sortedTrans = [...app.data.transactions].sort((a, b) => a.id - b.id);

        sortedTrans.forEach(t => {
            if (t.type === 'debt' && t.category === 'Aidat') {
                const key = `${t.residentId}-${t.amount}-${t.date}-${t.description}`;

                if (seenTrans[key]) {
                    // Check time difference (ID is usually timestamp based)
                    // If created within 5 seconds, assume double click
                    if ((t.id - seenTrans[key].id) < 5000) {
                        transToDelete.push(t.id);
                        return; // Don't update seenTrans, keep the first one
                    }
                }
                seenTrans[key] = t;
            }
        });

        if (transToDelete.length > 0) {
            console.warn("Duplicate transactions found. Cleaning up...", transToDelete);
            app.data.transactions = app.data.transactions.filter(t => !transToDelete.includes(t.id));
            app.saveData();
            alert("Sistem: Çift kayıtlar (Mükerrer Daire/Borç) tespit edildi ve temizlendi.");
        }
    },

    helpers: {
        getResidentBalance: function (residentId) {
            // "Smart Balance":
            // Income (payments) -> Always counts (decreases debt/increases balance)
            // Expense/Debt -> Only counts if date <= today

            // Format today as YYYY-MM-DD for string comparison
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;

            const trans = app.data.transactions.filter(t => t.residentId == residentId);

            let balance = 0;

            trans.forEach(t => {
                const amt = parseFloat(t.amount);

                if (t.type === 'income') {
                    // Payment received - increases balance (positive)
                    balance += amt;
                } else if (t.type === 'debt') {
                    // Personal Debt (Kişisel Borç) -> Immediate effect
                    balance -= amt;
                } else if (t.isDebt || (t.type === 'expense' && t.category === 'Aidat')) {
                    // Regular Dues (Aidat) -> Grace Period: Effective 1st of next month
                    const tDate = new Date(t.date);
                    const effectiveDate = new Date(tDate.getFullYear(), tDate.getMonth() + 1, 1);
                    const effectiveDateStr = effectiveDate.toISOString().split('T')[0];

                    if (todayStr >= effectiveDateStr) {
                        balance -= amt;
                    }
                }
            });

            return balance;
        }
    },

    checkAuth: function () {
        let user = null;
        try {
            user = JSON.parse(localStorage.getItem('app_user'));
        } catch (e) {
            // Corrupt data, user stays null
        }

        // Validate user object
        const isValidUser = user && user.username && user.password;

        if (!isValidUser) {
            // FIRST RUN / DATA CLEARED -> SHOW REGISTER
            if (this.handlers && this.handlers.switchAuthScreen) {
                this.handlers.switchAuthScreen('register');
            } else {
                document.getElementById('auth-register').style.display = 'block';
                document.getElementById('auth-login').style.display = 'none';
                document.getElementById('auth-forgot').style.display = 'none';
            }
        } else {
            // NORMAL START -> SHOW LOGIN
            if (this.handlers && this.handlers.switchAuthScreen) {
                this.handlers.switchAuthScreen('login');
            } else {
                document.getElementById('auth-login').style.display = 'block';
                document.getElementById('auth-register').style.display = 'none';
                document.getElementById('auth-forgot').style.display = 'none';
            }
            // Set security question
            const label = document.getElementById('forgot-question-label');
            if (label && user.question) label.innerText = `Güvenlik Sorusu: ${user.question}`;
        }
    },

    initializeAppContent: function () {
        this.loadData();

        // ---------------------------------------------------------
        // ONE-TIME MIGRATION: Update specific residents if they exist
        // ---------------------------------------------------------
        if (this.data.residents.length > 0) {
            let changed = false;

            // 1. Specific Fixes (Applied first)
            const updates = [
                { d: 3, n: "NUMAN BOLAT", p: "0530 098 63 60" },
                { d: 15, n: "İSMİ BİLİNMİYOR", p: "0530 666 76 65" },
                { d: 32, n: "HAKAN ARSLAN", p: "0531 897 30 04" },
                { d: 33, n: "NACİ ATEŞ", p: "0533 658 51 64" },
                { d: 35, n: "FATİH USLU", p: "0531 897 30 04" },
                { d: 39, n: "İHSAN DİNÇ", p: "0531 897 30 04" },
                { d: 41, n: "SEÇKİN ALAGÖZ", p: "0553 310 10 48" },
                { d: 42, n: "İSMAİL GÖRGÜL", p: "0536 290 85 91" },
                { d: 45, n: "FİRMA", p: "0531 897 30 04" },
                { d: 49, n: "FİRMA", p: "0531 897 30 04" },
                { d: 50, n: "FİRMA", p: "0531 897 30 04" },
                { d: 52, n: "GURBET YILDIZ", p: "0531 897 30 04" },
                { d: 53, n: "KEMAL YÜKSELEN", p: "0534 282 06 05" }
            ];

            updates.forEach(u => {
                const r = this.data.residents.find(x => x.doorNumber == u.d);
                if (r && (r.fullName !== u.n || r.phone !== u.p)) {
                    r.fullName = u.n;
                    r.phone = u.p;
                    changed = true;
                }
            });

            // 2. Global Uppercase Enforcement
            this.data.residents.forEach(r => {
                const upperName = r.fullName.toLocaleUpperCase('tr-TR');
                if (r.fullName !== upperName) {
                    r.fullName = upperName;
                    changed = true;
                }
            });

            if (changed) {
                console.log("Resident info updated via migration (Uppercase & Specifics).");
                this.saveData();
            }
        }
        // ---------------------------------------------------------

        // Ensure Maintenance Data Exists
        if (!this.data.maintenance) {
            this.data.maintenance = [];
        }
        if (!this.data.decisions) {
            this.data.decisions = [];
        }

        /* Theme logic removed - forced light mode */

        // Seed initial data if empty
        if (this.data.residents.length === 0) {
            this.seedInitialData();
        }
        this.setupEventListeners();
        this.router.init();
        this.renderDashboard();
    },

    toggleTheme: function () {
        const current = document.documentElement.getAttribute('data-theme');
        const btn = document.getElementById('theme-toggle');

        if (current === 'dark') {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-moon"></i> Karanlık Mod';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-sun"></i> Aydınlık Mod';
        }
    },

    seedInitialData: function () {
        const initialResidents = [
            { d: 1, n: "ENES ER", p: "0554 555 57 36" },
            { d: 2, n: "ERSAN KESKİN", p: "0506 707 92 27" },
            { d: 3, n: "NUMAN BOLAT", p: "0530 098 63 60" },
            { d: 4, n: "ATİLLA DİNÇEL", p: "0542 727 31 66" },
            { d: 5, n: "DOĞAN SAVAS", p: "0507 849 67 69" },
            { d: 6, n: "İSMAİL AYTEKİN", p: "+49 163 608 41 63" },
            { d: 7, n: "SEFA YAPRAKLI", p: "0536 831 88 46" },
            { d: 8, n: "EMRE SARSILMAZ", p: "0544 281 17 55" },
            { d: 9, n: "MESUT TAŞDEMİR", p: "0507 203 92 78" },
            { d: 10, n: "MEHMET EVİRGEN", p: "0531 230 41 20" },
            { d: 11, n: "HÜSEYİN ÜNVANLI", p: "0537 334 20 04" },
            { d: 12, n: "SELAHATTİN ŞİŞMAN", p: "0544 897 40 34" },
            { d: 13, n: "MUSTAFA (Sezai) GENÇ", p: "0555 031 61 71" },
            { d: 14, n: "ZEKERİYA BOYNUUZUN", p: "0538 388 04 02" },
            { d: 15, n: "İSMİ BİLİNMİYOR", p: "0530 666 76 65" },
            { d: 16, n: "TANER POLAT", p: "0534 262 67 53" },
            { d: 17, n: "MUSTAFA ALBAYRAK", p: "0507 291 50 23" },
            { d: 18, n: "İBRAHİM AYVA", p: "0532 471 68 07" },
            { d: 19, n: "MUSTAFA ATAŞ", p: "0533 036 20 96" },
            { d: 20, n: "ZEYNEP ERYİĞİT", p: "0537 792 79 96" },
            { d: 21, n: "SEFA AKBAY", p: "0544 934 89 99" },
            { d: 22, n: "HÜSEYİN SARISAKALOĞLU", p: "0542 304 96 46" },
            { d: 23, n: "TAYYİP DOĞAN", p: "0533 355 59 38" },
            { d: 24, n: "ÖZKAN YILDIRIM", p: "0536 931 00 82" },
            { d: 25, n: "BURHAN DİNÇ (KARDEŞİ)", p: "0531 897 30 04" },
            { d: 26, n: "MUSTAFA AYDINALP", p: "0533 397 54 04" },
            { d: 27, n: "MEVLÜT CAN DANACI", p: "0533 517 47 09" },
            { d: 28, n: "KAHRAMAN ARSLAN", p: "0505 594 69 06" },
            { d: 29, n: "ERCAN ÇETİNKAYA", p: "0554 786 79 92" },
            { d: 30, n: "ABDULKADİR AYDINALP", p: "0553 886 14 15" },
            { d: 31, n: "ERCAN ÇETİNKAYA", p: "0554 786 79 92" },
            { d: 32, n: "HAKAN ARSLAN", p: "0531 897 30 04" },
            { d: 33, n: "NACİ ATEŞ", p: "0533 658 51 64" },
            { d: 34, n: "ENGİN KABAKÇI", p: "0530 500 01 26" },
            { d: 35, n: "FATİH USLU", p: "0531 897 30 04" },
            { d: 36, n: "REGAİP YILMAZ", p: "0506 604 30 84" },
            { d: 37, n: "MUSTAFA ARSLAN", p: "+49 177 505 10 07" },
            { d: 38, n: "ENVER UZUN", p: "0532 688 12 22" },
            { d: 39, n: "İHSAN DİNÇ", p: "0531 897 30 04" },
            { d: 40, n: "BURHAN DİNÇ", p: "0531 897 30 04" },
            { d: 41, n: "SEÇKİN ALAGÖZ", p: "0553 310 10 48" },
            { d: 42, n: "İSMAİL GÖRGÜL", p: "0536 290 85 91" },
            { d: 43, n: "FATİH USLU", p: "0544 897 69 71" },
            { d: 44, n: "FATİH ERDOĞAN", p: "0532 764 00 06" },
            { d: 45, n: "FİRMA", p: "0531 897 30 04" },
            { d: 46, n: "FATİH KOCAOĞLU", p: "0507 188 58 15" },
            { d: 47, n: "EJDER YETER", p: "0507 188 58 15" },
            { d: 48, n: "YUNUS EMRE YETER", p: "0507 188 58 15" },
            { d: 49, n: "FİRMA", p: "0531 897 30 04" },
            { d: 50, n: "FİRMA", p: "0531 897 30 04" },
            { d: 51, n: "ADNAN GEZER", p: "0532 726 33 49" },
            { d: 52, n: "GURBET YILDIZ", p: "0531 897 30 04" },
            { d: 53, n: "KEMAL YÜKSELEN", p: "0534 282 06 05" }
        ];

        this.data.residents = initialResidents.map(r => ({
            id: Date.now() + Math.random(),
            doorNumber: r.d,
            fullName: r.n,
            phone: r.p,
            balance: 0
        }));
        this.saveData();
        alert("53 Sakin Listesi Yüklendi!");
        // Refresh page if we are on residents page
        if (document.querySelector('.nav-item[data-page="residents"]').classList.contains('active')) {
            app.ui.renderPage('residents');
        }
    },

    recalculateBalances: function () {
        if (!confirm("Tüm sakinlerin bakiyeleri mevcut işlemlere göre yeniden hesaplanacak. Silinen hatalı borçlar bakiyeden düşecek. Onaylıyor musunuz?")) return;

        // 1. Reset all balances to 0
        this.data.residents.forEach(r => r.balance = 0);

        // 2. Re-apply all existing transactions
        this.data.transactions.forEach(t => {
            if (!t.residentId) return;
            const r = this.data.residents.find(x => x.id === t.residentId);
            if (!r) return;

            if (t.type === 'income') {
                r.balance += parseFloat(t.amount);
            } else if (t.type === 'debt' || t.isDebt === true) {
                // Debt reduces balance (makes it negative)
                r.balance -= parseFloat(t.amount);
            }
        });

        this.saveData();
        alert("Bakiyeler başarıyla yeniden hesaplandı.");
        location.reload();
    },

    setupEventListeners: function () {
        // Navigation clicks
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.router.navigate(page);

                // Close sidebar on mobile after selection
                if (window.innerWidth <= 768) {
                    document.querySelector('.sidebar').classList.remove('active');
                    const overlay = document.querySelector('.sidebar-overlay');
                    if (overlay) overlay.classList.remove('active');
                }
            });
        });

        // Mobile Sidebar Toggle
        const toggleBtn = document.getElementById('sidebar-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                sidebar.classList.toggle('active');

                // Create overlay if not exists
                let overlay = document.querySelector('.sidebar-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'sidebar-overlay';
                    document.body.appendChild(overlay);

                    overlay.addEventListener('click', () => {
                        sidebar.classList.remove('active');
                        overlay.classList.remove('active');
                    });
                }
                overlay.classList.toggle('active');
            });
        }
    },

    formatCurrency: function (value) {
        return parseFloat(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
    },

    // Simple Obfuscation/Encryption Helper (Added for V3.1)
    crypto: {
        _key: "BINA_YONETIM_SECURE_KEY_2024", // Simple static key for obfuscation
        encrypt: function (text) {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(text);
                const keyBytes = encoder.encode(this._key);
                const result = new Uint8Array(data.length);
                for (let i = 0; i < data.length; i++) {
                    result[i] = data[i] ^ keyBytes[i % keyBytes.length];
                }
                let binary = '';
                for (let i = 0; i < result.length; i++) {
                    binary += String.fromCharCode(result[i]);
                }
                return btoa(binary);
            } catch (e) {
                console.error("Encryption failed", e);
                return text;
            }
        },
        decrypt: function (ciphertext) {
            try {
                const binary = atob(ciphertext);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                const keyBytes = new TextEncoder().encode(this._key);
                const result = new Uint8Array(bytes.length);
                for (let i = 0; i < bytes.length; i++) {
                    result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
                }
                return new TextDecoder().decode(result);
            } catch (e) {
                // If decryption fails, it might be plain JSON from older versions
                return ciphertext;
            }
        }
    },

    loadData: function () {
        const load = (key) => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;

            // Try decrypting
            try {
                // Heuristic: If it starts with { or [, it's likely OLD unencrypted JSON.
                // If it looks like base64 characters (alphanumeric+/=), try decrypt.
                if (raw.trim().startsWith('[') || raw.trim().startsWith('{')) {
                    return JSON.parse(raw);
                }

                const decrypted = this.crypto.decrypt(raw);
                return JSON.parse(decrypted);
            } catch (e) {
                // If decryption failed or parse failed, try raw parse as fallback
                try {
                    return JSON.parse(raw);
                } catch (e2) {
                    return null;
                }
            }
        };

        this.data.residents = load('residents') || [];
        this.data.transactions = load('transactions') || [];
        this.data.savedAnnouncements = load('savedAnnouncements') || [];
    },

    saveData: function () {
        const save = (key, data) => {
            const json = JSON.stringify(data);
            const encrypted = this.crypto.encrypt(json);
            localStorage.setItem(key, encrypted);
        };

        save('residents', this.data.residents);
        save('transactions', this.data.transactions);
        save('savedAnnouncements', this.data.savedAnnouncements);

        // Only render dashboard if we are on dashboard to prevent overwriting other views
        if (!document.querySelector('.nav-item.active') || document.querySelector('.nav-item.active').dataset.page === 'dashboard') {
            this.renderDashboard();
        }
    },

    router: {
        init: function () {
            // Default to dashboard
            this.navigate('dashboard');
        },
        navigate: function (pageId) {
            // Update Menu
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.toggle('active', el.dataset.page === pageId);
            });

            // Update Page Title
            const titles = {
                'dashboard': 'Özet Durum',
                'residents': 'Sakinler Yönetimi',
                'transactions': 'Hesap Hareketleri',
                'reports': 'Raporlar',
                'monthly-report': 'Aylık Gelir/Gider Tablosu',
                'assistant': 'Yönetici Asistanı',
                'settings': 'Ayarlar',
                'maintenance': 'Bakım Takvimi',
                'decisions': 'Karar Defteri'
            };
            document.getElementById('page-title').innerText = titles[pageId] || 'Sayfa';

            // Show/Hide Content Areas (For now, we simply re-render the content area based on page)
            app.ui.renderPage(pageId);
        }
    },

    ui: {
        openModal: function (modalId) {
            document.getElementById(modalId).style.display = 'flex';
        },
        closeModal: function (modalId) {
            document.getElementById(modalId).style.display = 'none';
        },
        renderPage: function (pageId) {
            const contentArea = document.getElementById('content-area');
            contentArea.innerHTML = ''; // Clear current content

            if (pageId === 'dashboard') {
                app.renderDashboard(); // Re-render dashboard html
            } else if (pageId === 'residents') {
                app.ui.renderResidentsPage(contentArea);
            } else if (pageId === 'transactions') {
                app.ui.renderTransactionsPage(contentArea);
            } else if (pageId === 'reports') {
                app.ui.renderReportsPage(contentArea);
            } else if (pageId === 'monthly-report') {
                app.ui.renderMonthlyReportPage(contentArea);
            } else if (pageId === 'assistant') {
                app.ui.renderAssistantPage(contentArea);
            } else if (pageId === 'settings') {
                app.ui.renderSettingsPage(contentArea);
            } else if (pageId === 'maintenance') {
                if (app.handlers.renderMaintenancePage) app.handlers.renderMaintenancePage(contentArea);
            } else if (pageId === 'decisions') {
                if (app.handlers.renderDecisionsPage) app.handlers.renderDecisionsPage(contentArea);
            }
        },
        renderSettingsPage: function (container) {
            const apiKey = localStorage.getItem('openai_api_key') || '';

            container.innerHTML = `
                <div class="assistant-container" style="width: 100%;">
                    <div class="assistant-card" style="flex: 0 0 100%; margin-bottom: 2rem; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                        <div class="card-header" style="border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
                            <i class="fa-solid fa-key" style="font-size: 1.5rem; color: var(--primary-color);"></i>
                            <h3 style="font-size: 1.3rem; margin-left: 10px; color: #333;">API Ayarları</h3>
                        </div>
                        <div class="card-body" style="flex-direction: column; gap: 20px;">
                           
                           <!-- Top Row: API Key & Model Select Side-by-Side -->
                           <div style="display:flex; gap:20px;">
                               <div style="flex:1;">
                                    <label style="display:block; margin-bottom:8px; font-weight:600; font-size: 1rem; color:#444;">API Anahtarı</label>
                                    <input type="password" id="api-key-input" class="form-control" style="width: 100%; height: 50px; font-size: 1rem;" placeholder="OpenAI / DeepSeek / Gemini Key (AIza...)" value="${apiKey}">
                               </div>
                               
                               <div style="flex:1;">
                                    <label style="display:block; margin-bottom:8px; font-weight:600; font-size: 1rem; color:#444;">Google Gemini Modeli</label>
                                    <select id="gemini-model-select" class="form-control" style="width: 100%; height: 50px; font-size: 1rem;">
                                        <option value="gemini-flash-latest">gemini-flash-latest (Listenizde Var)</option>
                                        <option value="gemini-2.0-flash-exp">gemini-2.0-flash-exp (Deneysel)</option>
                                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                                        <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                                        <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                                    </select>
                                    <small class="text-muted" style="display:block; margin-top: 5px; font-size: 0.9rem;">"Not found" hatası alırsanız modeli değiştirip deneyin.</small>
                               </div>
                           </div>

                           <!-- Bottom Row: Buttons -->
                           <div style="display:flex; gap:20px; margin-top: 10px;">
                                <button class="btn btn-secondary" style="flex:1; height: 45px; font-size: 1rem;" onclick="app.handlers.testApiKey()">Bağlantıyı Test Et</button>
                                <button class="btn btn-primary" style="flex:1; height: 45px; font-size: 1rem;" onclick="app.handlers.saveApiKey()">Kaydet</button>
                           </div>
                        </div>
                         <div style="margin-top: 15px; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #6c757d;">
                            <p class="text-muted" style="font-size: 0.95rem; margin: 0;">
                                <i class="fa-solid fa-circle-info"></i> Not: Ücretsiz Gemini üyelikleri ile tüm modeller çalışmayabilir. Genellikle 'flash' veya 'pro' modelleri ücretsiz planda açıktır.
                            </p>
                        </div>
                    </div>

                    <!-- Data Management Section -->
                    <div class="assistant-card" style="flex: 0 0 100%; margin-bottom: 2rem; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 4px solid var(--danger-color);">
                        <div class="card-header" style="border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px; color: var(--danger-color);">
                            <i class="fa-solid fa-database" style="font-size: 1.5rem;"></i>
                            <h3 style="font-size: 1.3rem; margin-left: 10px;">Veri Yönetimi</h3>
                        </div>
                        <div class="card-body" style="flex-direction: column; gap: 20px;">
                            <p style="font-size: 1.05rem; color: #555;">Verilerinizi yedekleyebilir veya hatalı durumlarda tamamen sıfırlayabilirsiniz.</p>
                            
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                                <input type="file" id="backup-upload" accept=".json" style="display:none" onchange="app.handlers.importBackup(this)">
                                
                                <button class="btn btn-secondary" style="height: 50px; font-size: 1rem;" onclick="app.handlers.exportData()">
                                    <i class="fa-solid fa-download"></i> Yedek İndir (PC)
                                </button>
                                <button class="btn" style="height: 50px; font-size: 1rem; background-color:#34a853; color:white; border:none;" onclick="app.handlers.backupToDrive()">
                                    <i class="fa-brands fa-google-drive"></i> Google Drive'a Yedekle
                                </button>

                                <button class="btn btn-secondary" style="height: 50px; font-size: 1rem;" onclick="document.getElementById('backup-upload').click()">
                                    <i class="fa-solid fa-upload"></i> Yedek Yükle
                                </button>
                                
                                <button class="btn btn-warning" style="height: 50px; font-size: 1rem; color:white;" onclick="app.handlers.deleteAllTransactions()">
                                    <i class="fa-solid fa-filter-circle-xmark"></i> Sadece İşlemleri Sil
                                </button>
                                <button class="btn btn-danger" style="height: 50px; font-size: 1rem; grid-column: span 2;" onclick="app.handlers.clearAllData()">
                                    <i class="fa-solid fa-trash-can"></i> Tüm Verileri Sil
                                </button>
                            </div>
                             <button class="btn btn-info full-width" style="height: 50px; font-size: 1rem; margin-top: 10px;" onclick="app.handlers.recalculateBalances()">
                                <i class="fa-solid fa-calculator"></i> Bakiyeleri Yeniden Hesapla (Düzelt)
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Setup Real-time Resident Search
            const filterInput = document.getElementById('resident-filter');
            const residentSelect = document.getElementById('trans-resident');

            if (filterInput && residentSelect) {
                filterInput.addEventListener('input', function (e) {
                    const term = e.target.value.toLocaleUpperCase('tr-TR');
                    const options = residentSelect.options;

                    for (let i = 0; i < options.length; i++) {
                        const opt = options[i];
                        const text = opt.text.toLocaleUpperCase('tr-TR');
                        // Always show the first "Select" or "External" option if it has empty value
                        if (opt.value === "") {
                            opt.style.display = "";
                            continue;
                        }

                        if (text.includes(term)) {
                            opt.style.display = "";
                        } else {
                            opt.style.display = "none";
                        }
                    }
                    // Optional: Auto-select first visible
                    // if (residentSelect.selectedIndex === -1) ...
                });
            }

            // Load saved data
            setTimeout(() => {
                const savedModel = localStorage.getItem('gemini_model') || 'gemini-1.5-flash';
                const select = document.getElementById('gemini-model-select');
                if (select) select.value = savedModel;
            }, 0);
        },

        renderAssistantPage: function (container) {
            const apiKey = localStorage.getItem('openai_api_key') || '';
            const showChat = !!apiKey;

            container.innerHTML = `
                <div class="assistant-container">
                    ${!showChat ? `
                    <div style="width:100%; background:#fef3c7; color:#92400e; padding:1rem; border-radius:var(--radius-md); margin-bottom:1rem; display:flex; align-items:center; justify-content:between;">
                        <span><i class="fa-solid fa-triangle-exclamation"></i> AI özellikleri için API anahtarı gerekli.</span>
                        <button class="btn btn-secondary" style="margin-left:auto;" onclick="app.router.navigate('settings')">Ayarlara Git</button>
                    </div>` : ''}

                    <div class="assistant-card">
                        <div class="card-header">
                            <i class="fa-solid fa-bullhorn"></i>
                            <h3>Duyuru Oluşturucu</h3>
                        </div>
                        <div class="card-body">
                            <p>Hazır şablonlar ile hızlıca duyuru oluşturun.</p>
                            <div class="form-group">
                                <label>Konu Seçin</label>
                                <select id="announce-type" class="form-control" onchange="app.handlers.updateAnnouncementTemplate()">
                                    <option value="">Seçiniz...</option>
                                    <optgroup label="Hazır Şablonlar">
                                        <option value="aidat">Aidat Hatırlatması</option>
                                        <option value="toplanti">Toplantı Çağrısı</option>
                                        <option value="ariza">Arıza/Bakım Bilgisi</option>
                                        <option value="kural">Bina Kural İhlali</option>
                                    </optgroup>
                                    <optgroup label="Kaydedilen Taslaklar">
                                        ${app.data.savedAnnouncements ? app.data.savedAnnouncements.map((item, index) => `<option value="saved_${index}">${item.title}</option>`).join('') : ''}
                                    </optgroup>
                                </select>
                            </div>
                            <div class="form-group" id="group-ann-main-subject" style="display:none;">
                                <label>Konu Başlığı</label>
                                <input type="text" id="announce-main-subject" class="form-control" placeholder="Duyuru Başlığı" oninput="app.handlers.generateText()">
                            </div>

                            <!-- Sola doğru uzatıldı -> Tek Sütun (Full Width) Yapıldı -->
                            <div class="announcement-grid" style="display: flex; flex-direction: column; gap: 20px; margin-bottom: 20px;">
                                <div id="announce-inputs-container">
                                    <div id="announce-inputs" style="display:none;">
                                        <!-- Dynamic Inputs -->
                                    </div>
                                </div>
                                
                                <div id="announce-result-container" style="display: flex; flex-direction: column;">
                                     <label style="display:block; margin-bottom:5px; font-weight:500;">Önizleme / Sonuç</label>
                                    <textarea id="announce-result" class="form-control" style="width: 100%; height: 500px; font-size: 1.1rem; padding: 15px; resize: none; background-color:#f8f9fa;" placeholder="Metin burada oluşturulacak..."></textarea>
                                </div>
                            </div>

                            <!-- Bottom Actions Row -->
                            <div class="assistant-actions" style="display: flex; gap: 10px;">
                                <button class="btn btn-secondary" style="flex:1; background-color: var(--warning-color); color:white; border:none;" onclick="app.handlers.saveAnnouncement()">
                                    <i class="fa-solid fa-floppy-disk"></i> Taslak Kaydet
                                </button>
                                <button class="btn btn-secondary" style="flex:1; background-color: var(--danger-color); color:white; border:none;" onclick="app.handlers.deleteAnnouncement()">
                                    <i class="fa-solid fa-trash-can"></i> Taslağı Sil
                                </button>
                                <button class="btn btn-primary" style="flex:1;" onclick="app.handlers.copyAnnouncement()">
                                    <i class="fa-solid fa-copy"></i> Kopyala
                                </button>
                                <button class="btn btn-secondary" style="flex:1; color: #128c7e; border-color: #128c7e;" onclick="app.handlers.shareAnnouncement()">
                                    <i class="fa-brands fa-whatsapp"></i> WhatsApp
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="assistant-card">
                        <div class="card-header">
                            <i class="fa-solid fa-robot"></i>
                            <h3>Yönetici AI Asistanı</h3>
                        </div>
                        <div class="card-body">
                            <div id="chat-history" class="chat-placeholder">
                                <div class="chat-bubble bot">Merhaba! Ben bina yönetim asistanınızım. Hukuki süreçler, aidat toplama stratejileri veya komşuluk ilişkileri hakkında bana soru sorabilirsiniz.</div>
                            </div>
                            <div class="chat-input-area">
                                <input type="text" id="chat-input" placeholder="Bir soru sorun..." ${!showChat ? 'disabled' : ''} onkeypress="if(event.key === 'Enter') app.handlers.sendChatMessage()">
                                <button onclick="app.handlers.sendChatMessage()" ${!showChat ? 'disabled' : ''}>
                                    <i class="fa-solid fa-paper-plane"></i>
                                </button>
                            </div>
                            ${!showChat ? '<small class="text-danger" style="margin-top:5px;">* Sohbeti kullanmak için yukarıdan API Anahtarı girmelisiniz.</small>' : ''}
                        </div>
                    </div>
                </div>
            `;
        },
        renderResidentsPage: function (container) {
            let html = `
                <div class="section-container">
                    <div class="section-header">
                        <h3>Daire Sahipleri</h3>
                        <div>
                            <button class="btn btn-secondary" onclick="app.handlers.triggerImport()">
                                <i class="fa-solid fa-file-import"></i> Yükle (Yedek)
                            </button>
                            <button class="btn btn-success" onclick="app.helpers.downloadResidentsXLS()" style="background-color: #1D6F42; color: white;">
                                <i class="fa-solid fa-file-excel"></i> Excel'e Aktar
                            </button>
                            <button class="btn btn-primary" onclick="app.handlers.openResidentModal()">
                                <i class="fa-solid fa-plus"></i> Yeni Ekle
                            </button>
                        </div>
                    </div>
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th>Daire</th>
                                <th>Daire Sahibi</th>
                                <th>Telefon</th>
                                <th>Bakiye</th>
                                <th>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>`;

            if (app.data.residents.length === 0) {
                html += `<tr><td colspan="5" class="empty-state">Kayıtlı sakin yok.</td></tr>`;
            } else {
                app.data.residents.sort((a, b) => a.doorNumber - b.doorNumber).forEach(res => {
                    const balance = app.helpers.getResidentBalance(res.id);
                    const balanceClass = balance < 0 ? 'text-danger' : 'text-success';
                    html += `
                        <tr>
                            <td>Daire ${res.doorNumber}</td>
                            <td>
                                <div style="cursor:pointer; color:var(--primary-color); font-weight:bold;" onclick="app.handlers.showResidentDetail(${res.id})">${res.fullName}</div>
                                ${res.type === 'tenant' ? `<small style="color:var(--text-muted); font-size:0.75rem;"><i class="fa-solid fa-house-user"></i> Ev Sahibi: ${res.ownerName || '-'}</small>` : ''}
                            </td>
                            <td>
                                <div>${res.phone || '-'}</div>
                                ${res.type === 'tenant' && res.ownerPhone ? `<small style="color:var(--text-muted); font-size:0.75rem;">(Ev Sahibi: ${res.ownerPhone})</small>` : ''}
                            </td>
                            <td class="${balanceClass}"><strong>${app.formatCurrency(balance)}</strong></td>
                            <td>
                                <button class="btn-icon" style="color:#25D366;" onclick="app.handlers.sendWhatsappReminder(${res.id})" title="WhatsApp Hatırlatma">
                                    <i class="fa-brands fa-whatsapp"></i>
                                </button>
                                <button class="btn-icon" onclick="app.handlers.editResident(${res.id})" title="Düzenle">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button class="btn-icon delete" onclick="app.handlers.deleteResident(${res.id})" title="Sil">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        },
        renderTransactionsPage: function (container) {
            let html = `
                <div class="section-container">
                    <div class="section-header">
                        <h3>Tüm Hareketler</h3>
                        <div style="display:flex; gap:10px; align-items:center;">
                             <button id="btn-delete-selected" class="btn btn-warning" onclick="app.handlers.deleteSelectedTransactions()" style="display:none;">
                                <i class="fa-solid fa-trash-can"></i> Seçilenleri Sil <span id="selected-count" class="badge">0</span>
                            </button>
                             <button class="btn btn-success" onclick="app.helpers.downloadTransactionsXLS()" title="Excel Olarak İndir" style="background-color: #1D6F42; color: white;">
                                <i class="fa-solid fa-file-excel"></i> Excel'e Aktar
                            </button>
                             <button class="btn btn-secondary" onclick="app.handlers.triggerPdfImport()" title="Banka PDF veya Excel yükle">
                                <i class="fa-solid fa-file-pdf"></i> <i class="fa-solid fa-file-excel"></i> PDF / Excel Yükle
                            </button>
                        </div>
                    </div>
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align:center;"><input type="checkbox" id="select-all-checkbox" onchange="app.handlers.toggleAllTransactions(this)"></th>
                                <th>Tarih</th>
                                <th>Kimden/Nereye</th>
                                <th>Açıklama</th>
                                <th>Tutar</th>
                                <th>-</th>
                            </tr>
                        </thead>
                        <tbody>`;

            // Sort by date desc
            const sortedTrans = [...app.data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

            if (sortedTrans.length === 0) {
                html += `<tr><td colspan="6" class="empty-state">İşlem yok.</td></tr>`;
            } else {
                sortedTrans.forEach(t => {
                    const isIncome = t.type === 'income';
                    const amountClass = isIncome ? 'text-success' : 'text-danger';
                    const sign = isIncome ? '+' : '-';
                    // Find resident name if linked
                    let entityName = 'Bina Gideri';
                    if (t.residentId) {
                        const r = app.data.residents.find(x => x.id == t.residentId);
                        entityName = r ? `Daire ${r.doorNumber} - ${r.fullName}` : 'Silinmiş Sakin';
                    }

                    html += `
                        <tr>
                            <td style="text-align:center;"><input type="checkbox" class="trans-checkbox" value="${t.id}" onchange="app.handlers.updateDeleteButtonState()"></td>
                            <td>${t.date}</td>
                            <td>${entityName}</td>
                            <td>${t.description}</td>
                            <td class="${amountClass}"><strong>${sign}${app.formatCurrency(t.amount)}</strong></td>
                            <td>
                                <button class="btn-icon delete" onclick="app.handlers.deleteTransaction(${t.id})"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>
                    `;
                });
            }
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        },

        renderReportsPage: function (container) {
            // Default to summary if no tab selected
            if (!this.activeReportTab) this.activeReportTab = 'summary';

            container.innerHTML = `
                <div class="report-tabs">
                    <button class="report-tab ${this.activeReportTab === 'summary' ? 'active' : ''}" onclick="app.ui.switchReportTab('summary')">
                        <i class="fa-solid fa-chart-pie"></i> Özet ve Borçlular
                    </button>
                     <button class="report-tab ${this.activeReportTab === 'grid' ? 'active' : ''}" onclick="app.ui.switchReportTab('grid')">
                        <i class="fa-solid fa-table-cells"></i> Aylık Aidat Çizelgesi
                    </button>
                    <button class="report-tab ${this.activeReportTab === 'monthly' ? 'active' : ''}" onclick="app.ui.switchReportTab('monthly')">
                        <i class="fa-solid fa-file-invoice-dollar"></i> Detaylı Gelir/Gider
                    </button>
                </div>
                <div id="report-content"></div>
            `;

            this.renderActiveReportTab();
        },

        switchReportTab: function (tabName) {
            this.activeReportTab = tabName;
            // Update Tab UI
            document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
            // 0: Summary, 1: Grid, 2: Monthly
            const tabs = document.querySelectorAll('.report-tab');
            if (tabName === 'summary' && tabs[0]) tabs[0].classList.add('active');
            if (tabName === 'grid' && tabs[1]) tabs[1].classList.add('active');
            if (tabName === 'monthly' && tabs[2]) tabs[2].classList.add('active');

            this.renderActiveReportTab();
        },

        renderActiveReportTab: function () {
            const container = document.getElementById('report-content');
            if (!container) return;

            if (this.activeReportTab === 'summary') {
                this.renderReportSummary(container);
            } else if (this.activeReportTab === 'grid') {
                this.renderDuesGrid(container);
            } else if (this.activeReportTab === 'monthly') {
                this.renderMonthlyReportPage(container);
            }
        },

        renderReportSummary: function (container) {
            // 1. Calculate Debtors Stats
            // 1. Calculate Debtors Stats
            let totalDebt = 0;
            let debtorsCount = 0;

            // Map residents to include dynamic balance
            const residentsWithBalance = app.data.residents.map(r => {
                return { ...r, dynamicBalance: app.helpers.getResidentBalance(r.id) };
            });

            const debtors = residentsWithBalance.filter(r => r.dynamicBalance < -1).sort((a, b) => a.dynamicBalance - b.dynamicBalance); // < -1 tolerance
            debtors.forEach(r => totalDebt += Math.abs(r.dynamicBalance));
            debtorsCount = debtors.length;

            // Recalculate Safe Balance (Cash in Hand) correctly
            // Cash = Total Income - Total Expense (Actual)
            let safeBalance = 0;
            app.data.transactions.forEach(t => {
                if (t.type === 'income') safeBalance += parseFloat(t.amount);
                else if (t.type === 'expense') safeBalance -= parseFloat(t.amount);
            });

            // 2. Calculate Monthly Stats
            const monthlyStats = {};
            app.data.transactions.forEach(t => {
                const monthKey = t.date.substring(0, 7); // 2024-01
                if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { income: 0, expense: 0 };

                // Correction: our system logic says 'income' increases balance (payment), 'expense' decreases (spending).
                // However, for REPORTING, we want to know how much money entered the system vs left.
                // Transactions with 'isDebt' true are technically 'accruals', not real money movements for cashflow, 
                // but usually considered 'Revenue/Income' in accrual accounting. 
                // For cash accounting (simple):
                // Real Income = type 'income' (Residents paying dues)
                // Real Expense = type 'expense' AND !isDebt (Buying cleaning supplies)
                // Debts (Accruals) are just potential income.

                // Let's separate Real Cashflow vs Accrual if possible, or keep it simple.
                // User asked for "Income - Expense Report".

                if (t.type === 'income') {
                    monthlyStats[monthKey].income += parseFloat(t.amount);
                } else if (!t.isDebt) {
                    // Only count real expenses, not debt accruals
                    monthlyStats[monthKey].expense += parseFloat(t.amount);
                }
            });

            const monthlyReport = Object.keys(monthlyStats).map(k => ({
                month: k,
                income: monthlyStats[k].income,
                expense: monthlyStats[k].expense,
                net: monthlyStats[k].income - monthlyStats[k].expense
            })).sort((a, b) => b.month.localeCompare(a.month));

            container.innerHTML = `
                <div class="dashboard-grid">
                    <div class="stat-card" style="border-left: 4px solid var(--danger-color);">
                        <div class="icon-wrapper expense">
                            <i class="fa-solid fa-user-xmark"></i>
                        </div>
                        <div class="stat-info">
                            <h3>Borçlu Daireler</h3>
                            <p class="stat-value text-danger">${debtorsCount}</p>
                        </div>
                    </div>
                    <div class="stat-card" style="border-left: 4px solid var(--warning-color);">
                        <div class="icon-wrapper" style="background:#fffbeb; color:var(--warning-color);">
                            <i class="fa-solid fa-hand-holding-dollar"></i>
                        </div>
                        <div class="stat-info">
                            <h3>Toplam Alacak</h3>
                            <p class="stat-value">${app.formatCurrency(totalDebt)}</p>
                        </div>
                    </div>
                     <div class="stat-card">
                         <div class="icon-wrapper income">
                            <i class="fa-solid fa-scale-balanced"></i>
                        </div>
                        <div class="stat-info">
                            <h3>Kasa Durumu</h3>
                            <p class="stat-value">${app.formatCurrency(safeBalance)}</p>
                        </div>
                    </div>
                </div>

                <!-- Borçlandırma Section Removed per user request -->\n

                <!-- Detailed Report moved to separate page -->

                <div class="section-container" style="margin-top: 2rem;">
                    <div class="section-header">
                        <h3>Borçlu Listesi (Ödemeyenler)</h3>
                        <button class="btn btn-secondary" onclick="window.print()"><i class="fa-solid fa-print"></i> Yazdır</button>
                    </div>
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th>Daire</th>
                                <th>Sakin / Ev Sahibi</th>
                                <th>Telefon</th>
                                <th>Güncel Bakiye (Borç)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${debtors.length === 0 ? '<tr><td colspan="4" class="empty-state">Borçlu daire bulunmamaktadır. Harika!</td></tr>' : ''}
                            ${debtors.map(r => `
                                <tr>
                                    <td>Daire ${r.doorNumber}</td>
                                    <td>
                                        <strong>${r.fullName}</strong><br>
                                        ${r.type === 'tenant' ? `<small class="text-muted">Ev S.: ${r.ownerName}</small>` : ''}
                                    </td>
                                    <td>
                                        <div>${r.phone || '-'}</div>
                                        ${r.type === 'tenant' && r.ownerPhone ? `<small class="text-muted">${r.ownerPhone}</small>` : ''}
                                    </td>
                                    <td class="text-danger"><strong>${app.formatCurrency(r.dynamicBalance)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        },

        renderDuesGrid: function (container) {
            // Get selected year or default to current
            let year = new Date().getFullYear();
            const yearSelect = document.getElementById('dues-grid-year');
            if (yearSelect) year = parseInt(yearSelect.value);

            // Months Array
            const months = [
                'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
            ];

            // 1. Prepare Data: Resident -> [JanAmnt, FebAmnt, ...]
            const dataMap = {};
            // Initialize
            app.data.residents.forEach(r => {
                dataMap[r.id] = new Array(12).fill(0);
            });

            // 2. Fill Data from Payments (Income)
            app.data.transactions.forEach(t => {
                if (t.type === 'income' && t.residentId) {
                    const d = new Date(t.date);
                    if (d.getFullYear() === year) {
                        const mIndex = d.getMonth(); // 0-11
                        if (dataMap[t.residentId]) {
                            dataMap[t.residentId][mIndex] += parseFloat(t.amount);
                        }
                    }
                }
            });

            // 3. Render HTML
            // Sort residents by Door Number
            const sortedResidents = [...app.data.residents].sort((a, b) => a.doorNumber - b.doorNumber);

            const tableRows = sortedResidents.map(r => {
                const tds = dataMap[r.id].map(amount => {
                    if (amount > 0) {
                        // Fully paid or partial? 
                        // We don't know the exact due but let's assume > 0 is green. 
                        // Or we can check if it matches dues settings.
                        return `<td class="dues-cell-paid">${app.formatCurrency(amount)}</td>`;
                    } else {
                        return `<td class="dues-cell-empty">-</td>`;
                    }
                }).join('');

                return `
                    <tr>
                        <td style="font-weight:600;">
                            <div>Daire ${r.doorNumber}</div>
                            <div style="font-weight:400; font-size:0.8rem; color:#64748b;">${r.fullName}</div>
                        </td>
                        ${tds}
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div class="section-container">
                    <div class="section-header" style="justify-content: space-between;">
                         <h3>Aylık Aidat/Ödeme Çizelgesi (${year})</h3>
                         <div style="display:flex; gap:10px; align-items:center;">
                            <select id="dues-grid-year" class="form-control" style="width:auto;" onchange="app.ui.renderDuesGrid(document.getElementById('report-content'))">
                                <option value="2024" ${year === 2024 ? 'selected' : ''}>2024</option>
                                <option value="2025" ${year === 2025 ? 'selected' : ''}>2025</option>
                                <option value="2026" ${year === 2026 ? 'selected' : ''}>2026</option>
                            </select>
                            <button class="btn btn-secondary" onclick="window.print()"><i class="fa-solid fa-print"></i> Yazdır</button>
                         </div>
                    </div>
                    
                    <div class="dues-grid-wrapper">
                        <table class="dues-table">
                            <thead>
                                <tr>
                                    <th>DAİRE / SAKİN</th>
                                    ${months.map(m => `<th>${m} ${year}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top:10px; font-size:0.85rem; color:#64748b;">
                        * Bu tablo <strong>ödeme tarihine</strong> göre oluşturulmuştur. Ödeme hangi ay yapıldıysa o ayın sütununda görünür.
                    </div>
                </div>
            `;
        },

        renderMonthlyReportPage: function (container) {
            container.innerHTML = `
                <div class="section-container">
                    <div class="section-header" style="align-items: center; justify-content: space-between;">
                        <h3>Detaylı Aylık Gelir/Gider Tablosu</h3>
                        <div style="display:flex; gap:10px; align-items:center;">
                             <label>Dönem Seç:</label>
                             <input type="month" id="report-month-picker" class="form-control" style="width: auto;" onchange="app.handlers.renderMonthlyDetail()">
                             <button class="btn btn-secondary" onclick="window.print()"><i class="fa-solid fa-print"></i> Yazdır</button>
                        </div>
                    </div>
                    <div class="help-text" style="background:var(--bg-light); padding:10px; border-radius:8px; margin-bottom:20px; font-size:0.9rem;">
                        <i class="fa-solid fa-info-circle"></i> Bu sayfada seçtiğiniz aya ait tüm gelir ve gider kalemlerini detaylı döküm olarak görebilirsiniz.
                    </div>
                    
                    <div id="monthly-detail-container">
                        <!-- Report content will be injected here -->
                    </div>
                </div>
            `;

            // Set default month to current and render initial report
            setTimeout(() => {
                const now = new Date();
                const monthStr = now.toISOString().slice(0, 7); // YYYY-MM
                const picker = document.getElementById('report-month-picker');
                if (picker) {
                    picker.value = monthStr;
                    app.handlers.renderMonthlyDetail();
                }
            }, 0);
        },
    },

    handlers: {
        renderMonthlyDetail: function () {
            const selectedMonth = document.getElementById('report-month-picker').value; // YYYY-MM
            const container = document.getElementById('monthly-detail-container');

            if (!selectedMonth) {
                container.innerHTML = '<p class="empty-state">Lütfen bir dönem seçin.</p>';
                return;
            }

            const [year, month] = selectedMonth.split('-');
            const monthNames = [
                'OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
                'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'
            ];
            const currentMonthName = monthNames[parseInt(month) - 1];
            const formattedDate = `${currentMonthName} ${year}`;
            const buildingName = "YEŞİLVADİ KONUTLARI-2";

            const filteredTransactions = app.data.transactions.filter(t => t.date.startsWith(selectedMonth));

            const incomeList = filteredTransactions.filter(t => t.type === 'income');
            const expenseList = filteredTransactions.filter(t => t.type === 'expense');

            let totalIncome = incomeList.reduce((sum, t) => sum + parseFloat(t.amount), 0);
            let totalExpense = expenseList.reduce((sum, t) => sum + parseFloat(t.amount), 0);
            const netDifference = totalIncome - totalExpense;
            const fmt = (v) => parseFloat(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            let html = `
                <div class="refined-grid-report" style="background:#fff; padding:30px; border-radius:12px; font-family:'Inter', sans-serif; color:#333; max-width:900px; margin:20px auto; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border:1px solid #eee;">
                    
                    <!-- Clean Professional Header -->
                    <div style="text-align:center; padding-bottom:20px; border-bottom:2px solid #333; margin-bottom:25px;">
                        <h2 style="margin:0; font-size:1.3rem; font-weight:800; letter-spacing:1px; color:#111;">YEŞİLVADİ KONUTLARI-2 SİTESİ</h2>
                        <h3 style="margin:5px 0 0; font-size:1.1rem; color:#666; font-weight:600;">GELİR / GİDER ÇİZELGESİ - ${currentMonthName} ${year}</h3>
                    </div>

                    <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                        <!-- GELİRLER -->
                        <thead>
                            <tr style="background:#f8fafc;">
                                <th colspan="3" style="border:1px solid #333; padding:10px; text-align:center; font-weight:800; font-size:1rem; color:#1e293b;">${currentMonthName} AYI GELİRLER</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="background:#f0fdf4;">
                                <td style="border:1px solid #333; padding:10px; width:40px;"></td>
                                <td style="border:1px solid #333; padding:10px; font-weight:600;">${currentMonthName} AYI TOPLAM AİDAT VE DİĞER GELİRLER</td>
                                <td style="border:1px solid #333; padding:10px; text-align:right; width:150px; font-weight:800; font-family:'JetBrains Mono', 'Courier New', monospace; font-size:1.05rem;">${fmt(totalIncome)}</td>
                            </tr>
                            <tr style="background:#dcfce7; font-weight:900;">
                                <td colspan="2" style="border:1px solid #333; padding:10px; text-align:right; text-transform:uppercase;">GELİRLER TOPLAMI</td>
                                <td style="border:2px solid #333; padding:10px; text-align:right; font-family:'JetBrains Mono', 'Courier New', monospace; font-size:1.1rem;">${fmt(totalIncome)}</td>
                            </tr>

                            <!-- GİDERLER -->
                            <tr><td colspan="3" style="border:none; height:25px;"></td></tr>
                            <tr style="background:#f8fafc;">
                                <th colspan="3" style="border:1px solid #333; padding:10px; text-align:center; font-weight:800; font-size:1rem; color:#1e293b;">${currentMonthName} AYI GİDERLER</th>
                            </tr>
                            ${expenseList.length === 0 ? `
                                <tr><td colspan="3" style="border:1px solid #333; padding:20px; text-align:center; color:#888; font-style:italic;">Bu ay için bir gider kaydı bulunmamaktadır.</td></tr>
                            ` : (() => {
                    // Standard categories in the exact order requested
                    const standardCategories = [
                        "PERSONEL MAAŞ", "PERSONEL SGK", "ELEKTRİK", "SU",
                        "ASANSÖR BAKIM", "TEMİZLİK", "BAHÇE PEYZAJ",
                        "BAKIM ONARIM", "YÖNETİM KIRTASİYE", "BÖCEK İLAÇLAMA", "DİĞER"
                    ];

                    // Group and normalize
                    const grouped = {};
                    const digerDetails = []; // To collect sub-items for DİĞER
                    standardCategories.forEach(c => grouped[c] = 0);

                    expenseList.forEach(t => {
                        // Normalize case for matching
                        let cat = (t.category || "DİĞER").toLocaleUpperCase('tr-TR').trim();

                        // Exact-match Renames (NO automatic description guessing anymore)
                        if (cat === "PERSONEL MAAŞI") cat = "PERSONEL MAAŞ";
                        if (cat === "SGK PRİMLERİ" || cat === "PERSEONEL SGK") cat = "PERSONEL SGK";
                        if (cat === "BAHÇE/ÇEVRE") cat = "BAHÇE PEYZAJ";
                        if (cat === "YÖNETİM/KIRTASIYE" || cat === "YÖNETİM/KIRTASIYE") cat = "YÖNETİM KIRTASİYE";

                        // Final Routing
                        if (standardCategories.includes(cat)) {
                            grouped[cat] += parseFloat(t.amount);
                            if (cat === "DİĞER") {
                                digerDetails.push({
                                    name: (t.subCategory || t.description || 'Detay Yok').toLocaleUpperCase('tr-TR'),
                                    amount: parseFloat(t.amount)
                                });
                            }
                        } else {
                            // Map any non-standard categories to "DİĞER" gracefully
                            grouped["DİĞER"] += parseFloat(t.amount);
                            digerDetails.push({
                                name: (cat + " - " + (t.subCategory || t.description || 'Detay Yok')).toLocaleUpperCase('tr-TR'),
                                amount: parseFloat(t.amount)
                            });
                        }
                    });

                    let rowIndex = 1; // Sequential numbering for visible categories
                    return standardCategories.map((cat) => {
                        const amount = grouped[cat] || 0;
                        if (amount === 0) return '';

                        const currentIdx = rowIndex++; // Use and increment

                        // Main Row
                        let rows = `
                                        <tr style="background:${currentIdx % 2 === 1 ? '#fff' : '#fef2f2'};">
                                            <td style="border:1px solid #333; padding:10px; text-align:center; font-weight:bold;">${currentIdx}</td>
                                            <td style="border:1px solid #333; padding:10px; color:#444; ${cat === 'DİĞER' ? 'font-weight:bold;' : ''}">${cat}</td>
                                            <td style="border:1px solid #333; padding:10px; text-align:right; font-family:'JetBrains Mono', 'Courier New', monospace; font-weight:600;">${fmt(amount)}</td>
                                        </tr>
                                    `;

                        // If DİĞER, add sub-rows for alt kırılım
                        if (cat === "DİĞER" && digerDetails.length > 0) {
                            digerDetails.forEach(d => {
                                rows += `
                                                <tr style="background:#fff; font-size:0.85rem; color:#666;">
                                                    <td style="border:1px solid #333; padding:6px 10px;"></td>
                                                    <td style="border:1px solid #333; padding:6px 10px; padding-left:30px; font-style:italic;">↳ ${d.name}</td>
                                                    <td style="border:1px solid #333; padding:6px 10px; text-align:right; font-family:'JetBrains Mono', 'Courier New', monospace;">${fmt(d.amount)}</td>
                                                </tr>
                                            `;
                            });
                        }

                        return rows;
                    }).join('');
                })()}
                            <tr style="background:#fee2e2; font-weight:900;">
                                <td colspan="2" style="border:1px solid #333; padding:10px; text-align:right; text-transform:uppercase;">GİDERLER TOPLAMI</td>
                                <td style="border:2px solid #333; padding:10px; text-align:right; font-family:'JetBrains Mono', 'Courier New', monospace; font-size:1.1rem; color:#b91c1c;">${fmt(totalExpense)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- GENEL ÖZET -->
                    <table style="width:100%; border-collapse:collapse; margin-top:30px; border:2px solid #333;">
                        <tr style="background:#f9fafb;">
                            <td style="border:1px solid #333; padding:12px; font-weight:800; text-align:center; width:65%; background:#fff;">${currentMonthName} AYI TOPLAM GELİR</td>
                            <td style="border:1px solid #333; padding:12px; text-align:right; font-family:'JetBrains Mono', 'Courier New', monospace; font-weight:800;">${fmt(totalIncome)}</td>
                        </tr>
                        <tr style="background:#f9fafb;">
                            <td style="border:1px solid #333; padding:12px; font-weight:800; text-align:center; background:#fff;">${currentMonthName} AYI TOPLAM GİDER</td>
                            <td style="border:1px solid #333; padding:12px; text-align:right; font-family:'JetBrains Mono', 'Courier New', monospace; font-weight:800; color:#b91c1c;">${fmt(totalExpense)}</td>
                        </tr>
                        <tr style="background:#f1f5f9; color:#1e293b;">
                            <td style="border:1px solid #333; padding:12px; font-weight:900; text-align:center; font-size:1.2rem; letter-spacing:2px; background:#f1f5f9;">FARK (BAKİYE)</td>
                            <td style="border:1px solid #333; padding:12px; text-align:right; font-family:'JetBrains Mono', 'Courier New', monospace; font-weight:900; font-size:1.3rem; background:#f1f5f9; color:${netDifference >= 0 ? '#15803d' : '#b91c1c'};">${fmt(netDifference)} ₺</td>
                        </tr>
                    </table>

                    <div style="margin-top:20px; display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:#777;">
                         <span>Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}</span>
                         <span style="font-weight:700; color:#333;"><i class="fa fa-check-circle" style="color:#2563eb;"></i> YÖNETİM TASDİKLİ RESMİ ÇİZELGE</span>
                    </div>
                </div>
            `;
            container.innerHTML = html;
        },

        openResidentModal: function () {
            // Reset for new entry
            document.getElementById('form-resident').reset();
            document.getElementById('res-id').value = '';
            document.getElementById('res-type').value = 'owner';
            // Default: Main input is resident(owner)
            app.handlers.toggleResidentType();

            document.querySelector('#modal-add-resident h2').innerText = 'Yeni Daire Sahibi/Sakin Ekle';
            app.ui.openModal('modal-add-resident');
        },

        toggleResidentType: function () {
            const type = document.getElementById('res-type').value;
            const tenantGroup = document.getElementById('group-tenant-name');

            if (type === 'tenant') {
                tenantGroup.style.display = 'block';
            } else {
                tenantGroup.style.display = 'none';
            }
        },

        editResident: function (id) {
            const r = app.data.residents.find(x => x.id === id);
            if (!r) return;

            document.getElementById('res-id').value = r.id;
            document.getElementById('res-door').value = r.doorNumber;
            // Phone logic handled below based on type

            document.getElementById('res-type').value = r.type || 'owner';

            // Logic: 
            // If Owner type: res-name is r.fullName. res-owner-phone is r.phone
            // If Tenant type: res-name is r.ownerName. res-owner-phone is r.ownerPhone. res-tenant-name is r.fullName. res-tenant-phone is r.phone
            if (r.type === 'tenant') {
                document.getElementById('res-name').value = r.ownerName || '';
                document.getElementById('res-owner-phone').value = r.ownerPhone || '';
                document.getElementById('res-tenant-name').value = r.fullName || '';
                document.getElementById('res-tenant-phone').value = r.phone || '';
            } else {
                document.getElementById('res-name').value = r.fullName || '';
                document.getElementById('res-owner-phone').value = r.phone || '';
                document.getElementById('res-tenant-name').value = '';
                document.getElementById('res-tenant-phone').value = '';
            }

            app.handlers.toggleResidentType();

            document.querySelector('#modal-add-resident h2').innerText = 'Sakin Düzenle';
            app.ui.openModal('modal-add-resident');
        },

        sendWhatsappReminder: function (id) {
            const r = app.data.residents.find(x => x.id === id);
            if (!r) return;

            const balance = app.helpers.getResidentBalance(r.id);
            // Allow sending reminder even if balance is 0? Maybe just warn.
            if (balance <= 0 && !confirm("Bu kişinin borcu görünmüyor. Yine de mesaj atmak istiyor musunuz?")) {
                return;
            }

            let phone = r.phone || '';
            // Turn "0536 831 88 46" -> "905368318846"
            phone = phone.replace(/\D/g, '');
            if (phone.startsWith('0')) phone = '9' + phone;
            else if (phone.length === 10) phone = '90' + phone;


            const text = `Sayın ${r.fullName},\n\nBina yönetim kayıtlarımıza göre güncel bakiyeniz: ${app.formatCurrency(balance)} (Borç)'dur.\n\nÖdemenizi en kısa sürede yapmanızı rica ederiz.\n\nSaygılarımızla,\nSite Yönetimi`;

            const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        },

        submitResident: function (e) {
            e.preventDefault();
            const id = document.getElementById('res-id').value;
            const door = document.getElementById('res-door').value;
            const type = document.getElementById('res-type').value;

            // Inputs
            const primaryNameInput = document.getElementById('res-name').value; // Usually Owner
            const primaryPhoneInput = document.getElementById('res-owner-phone').value;
            const tenantNameInput = document.getElementById('res-tenant-name').value;
            const tenantPhoneInput = document.getElementById('res-tenant-phone').value;

            // Determine Full Name (Resident), Owner Name, and Phones based on Type
            let finalFullName = primaryNameInput;
            let finalPhone = primaryPhoneInput;
            let finalOwnerName = '';
            let finalOwnerPhone = '';

            if (type === 'tenant') {
                finalFullName = tenantNameInput; // Tenant determines the Resident Name
                finalPhone = tenantPhoneInput;   // Resident Phone is Tenant Phone

                finalOwnerName = primaryNameInput;
                finalOwnerPhone = primaryPhoneInput;
            } else {
                finalFullName = primaryNameInput;
                finalPhone = primaryPhoneInput;

                finalOwnerName = '';
                finalOwnerPhone = '';
            }

            if (id) {
                // Update existing
                const resident = app.data.residents.find(r => r.id == id);
                if (resident) {
                    resident.doorNumber = parseInt(door);
                    resident.fullName = finalFullName;
                    resident.phone = finalPhone;
                    resident.type = type;
                    resident.ownerName = finalOwnerName;
                    resident.ownerPhone = finalOwnerPhone;
                    alert('Bilgiler güncellendi.');
                }
            } else {
                // Create new
                const newResident = {
                    id: Date.now(),
                    doorNumber: parseInt(door),
                    fullName: finalFullName,
                    phone: finalPhone,
                    type: type,
                    ownerName: finalOwnerName,
                    ownerPhone: finalOwnerPhone,
                    balance: 0
                };
                app.data.residents.push(newResident);
                alert('Daire Sahibi/Sakin eklendi!');
            }

            app.saveData();
            app.ui.closeModal('modal-add-resident');

            if (document.querySelector('.nav-item[data-page="residents"]').classList.contains('active')) {
                app.router.navigate('residents');
            }
        },

        submitBulkAccrual: function (e) {
            e.preventDefault();
            const desc = document.getElementById('bulk-desc').value;
            const amount = parseFloat(document.getElementById('bulk-amount').value);
            const date = document.getElementById('bulk-date').value;

            if (!desc || !amount || !date) {
                alert("Lütfen tüm alanları doldurun.");
                return;
            }

            const countInput = document.getElementById('bulk-count');
            const monthCount = countInput ? parseInt(countInput.value) : 1;
            const baseDate = new Date(date);

            if (confirm(`Toplam ${app.data.residents.length} daireye, ${monthCount} ay boyunca her ay ${amount} TL borç eklenecek.\n\nToplam İşlem Sayısı: ${app.data.residents.length * monthCount}\n\nOnaylıyor musunuz?`)) {

                // Disable button to prevent double-click
                const btn = e.target.querySelector('button[type="submit"]');
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';
                }

                // Small timeout to allow UI to update
                setTimeout(() => {
                    app.data.residents.forEach(r => {
                        for (let i = 0; i < monthCount; i++) {
                            // Calculate date for this month iteration
                            const nextDate = new Date(baseDate);
                            nextDate.setMonth(baseDate.getMonth() + i);
                            const dateStr = nextDate.toISOString().split('T')[0];

                            // FAILSAFE: Check if this specific debt already exists to prevent duplicates
                            const exists = app.data.transactions.some(tr =>
                                tr.residentId === r.id &&
                                tr.date === dateStr &&
                                tr.amount === amount &&
                                tr.type === 'debt' &&
                                tr.category === 'Aidat'
                            );

                            if (exists) continue; // Skip if already exists

                            const t = {
                                id: Date.now() + Math.random(),
                                residentId: r.id,
                                date: dateStr,
                                description: desc + (monthCount > 1 ? ` (${i + 1}. Taksit)` : ''),
                                type: 'debt', // NEW TYPE: Accrual
                                amount: amount,
                                category: 'Aidat'
                            };
                            app.data.transactions.push(t);
                        }
                    });

                    app.saveData();
                    app.ui.closeModal('modal-bulk');
                    alert("Toplu borçlandırma işlemi tamamlandı.");
                    app.renderDashboard();

                    // Reset button
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Herkese Borç Ekle';
                    }
                }, 100);
            }
        },

        openAddTransactionModal: function (type, residentId = null) {
            const modal = document.getElementById('modal-transaction');
            const titleElem = document.getElementById('modal-trans-title'); // Renamed variable
            document.getElementById('form-transaction').reset();

            // Default date today
            const now = new Date();
            const day = ("0" + now.getDate()).slice(-2);
            const month = ("0" + (now.getMonth() + 1)).slice(-2);
            document.getElementById('trans-date').value = now.getFullYear() + "-" + month + "-" + day;

            // Residents dropdown
            let options = '<option value="">(Bina Ortak Gideri / Dış Gelir)</option>';
            app.data.residents.sort((a, b) => a.doorNumber - b.doorNumber).forEach(r => {
                options += `<option value="${r.id}">Daire ${r.doorNumber} - ${r.fullName}</option>`;
            });
            document.getElementById('trans-resident').innerHTML = options;

            // Auto Select Resident if passed
            if (residentId) {
                document.getElementById('trans-resident').value = residentId;
            }

            // Type handling
            let realType = type;
            let displayTitle = ''; // Renamed variable
            let defaultDesc = '';

            if (type === 'income') {
                displayTitle = 'Gelir Ekle (Aidat vb.)';
                defaultDesc = 'Aidat Ödemesi';
            } else if (type === 'expense') {
                displayTitle = 'Gider Ekle';
                realType = 'expense';
            } else if (type === 'fixture') {
                realType = 'income'; // Fixture fees are income
                displayTitle = 'Demirbaş / Ek Ücret Topla';
                defaultDesc = 'Demirbaş Ödemesi';
            } else if (type === 'debt') {
                realType = 'debt';
                displayTitle = 'Kişisel Borç Ekle (Devir / Ek Borç)';
                defaultDesc = 'Geçmiş Dönem Borcu';
            }

            document.getElementById('trans-type').value = realType;
            document.getElementById('trans-desc').value = defaultDesc;
            titleElem.innerText = displayTitle;

            // Handle Category Selector
            const catGroup = document.getElementById('group-category-select');
            const catSelect = document.getElementById('trans-category');
            const subCatGroup = document.getElementById('group-sub-category');
            const resGroup = document.getElementById('group-resident-select');

            // Clear previous categories and hide sub-category
            catSelect.innerHTML = '<option value="">-- Kategori Seçiniz --</option>';
            subCatGroup.style.display = 'none';

            if (realType === 'expense') {
                catGroup.style.display = 'block';
                resGroup.style.display = 'none'; // Expenses usually don't need resident selection (unless refund)

                const categories = [
                    "PERSONEL MAAŞ", "PERSONEL SGK", "ELEKTRİK", "SU",
                    "ASANSÖR BAKIM", "TEMİZLİK", "BAHÇE PEYZAJ",
                    "BAKIM ONARIM", "YÖNETİM KIRTASİYE", "BÖCEK İLAÇLAMA", "DİĞER"
                ];

                categories.forEach(c => {
                    catSelect.innerHTML += `<option value="${c}">${c}</option>`;
                });

                // Auto-fill description on change
                catSelect.onchange = function () {
                    const val = this.value;
                    if (val) document.getElementById('trans-desc').value = val + " Ödemesi";

                    // Show/Hide sub-category field if "DİĞER" is selected
                    if (val === 'DİĞER') {
                        subCatGroup.style.display = 'block';
                    } else {
                        subCatGroup.style.display = 'none';
                    }
                };

            } else {
                catGroup.style.display = 'none';
                resGroup.style.display = 'block';
                catSelect.onchange = null;

                // Hint for individual debt
                if (realType === 'debt') {
                    // Could add a small hint text to modal if needed, but placeholder is fine for now
                    document.getElementById('trans-desc').placeholder = "Örn: 2024 Devir Bakiyesi";
                }
            }

            app.ui.openModal('modal-transaction');
        },

        submitTransaction: function (e) {
            e.preventDefault();
            const type = document.getElementById('trans-type').value;
            const residentId = document.getElementById('trans-resident').value; // String
            const amount = parseFloat(document.getElementById('trans-amount').value);
            const desc = document.getElementById('trans-desc').value;
            const date = document.getElementById('trans-date').value;
            const category = document.getElementById('trans-category').value;
            const subCategory = document.getElementById('trans-sub-category').value;

            // Find resident to ensure validity and get correct type (number/string)
            const inputResidentId = document.getElementById('trans-resident').value;
            let finalResidentId = null;

            if (type === 'income' || type === 'debt') {
                if (!inputResidentId) {
                    alert(type === 'income' ? "Lütfen bir daire seçin." : "Lütfen borçlandırılacak daireyi seçin.");
                    return;
                }
                const resident = app.data.residents.find(r => r.id == inputResidentId); // Loose equality for string/number match
                if (!resident) {
                    alert("Seçilen daire bulunamadı.");
                    return;
                }
                finalResidentId = resident.id; // Use the actual ID type from data
            }

            const newTrans = {
                id: Date.now(),
                type: type,
                residentId: finalResidentId,
                category: type === 'expense' ? category : 'Borç', // Default category for debt
                subCategory: (type === 'expense' && category === 'Diğer') ? subCategory : null,
                amount: amount,
                description: desc,
                date: date,
                // For debt type, mark as debt explicitly if needed, though 'type: debt' is enough for our logic
                isDebt: (type === 'debt')
            };

            app.data.transactions.push(newTrans);

            // Manual balance update removed - using dynamic calculation

            app.saveData();
            app.ui.closeModal('modal-transaction');
            app.renderDashboard();
            alert('İşlem kaydedildi.');
        },

        deleteResident: function (id) {
            if (confirm('Bu sakini silmek istediğinize emin misiniz?')) {
                app.data.residents = app.data.residents.filter(r => r.id !== id);
                app.saveData();
                app.router.navigate('residents');
            }
        },

        deleteTransaction: function (id) {
            if (confirm('İşlemi geri almak üzeresiniz. Emin misiniz?')) {
                const t = app.data.transactions.find(x => x.id === id);
                if (!t) return;

                // Manual balance revert removed - using dynamic calculation

                app.data.transactions = app.data.transactions.filter(x => x.id !== id);
                app.saveData();
                app.router.navigate('transactions');
            }
        },

        updateAnnouncementTemplate: function () {
            const type = document.getElementById('announce-type').value;
            const inputArea = document.getElementById('announce-inputs');
            const resultArea = document.getElementById('announce-result');

            const subjectInputGroup = document.getElementById('group-ann-main-subject');
            const subjectInput = document.getElementById('announce-main-subject');

            inputArea.style.display = 'block';
            inputArea.innerHTML = '';
            resultArea.value = '';
            subjectInputGroup.style.display = 'block';

            // Check if saved draft
            if (type.startsWith('saved_')) {
                const index = parseInt(type.split('_')[1]);
                const item = app.data.savedAnnouncements[index];
                if (item) {
                    subjectInput.value = item.subject || '';
                    resultArea.value = item.text || '';
                    inputArea.style.display = 'none'; // No inputs for static draft
                }
                return; // Stop generation for saved items
            }

            let defaultSubject = '';



            if (type === 'aidat') {
                defaultSubject = '📢 AİDAT HATIRLATMASI';
                inputArea.innerHTML = `
                    <input type="text" id="ann-month" class="form-control" placeholder="Hangi Ay? (Örn: Ocak)" oninput="app.handlers.generateText()">
                    <input type="number" id="ann-amount" class="form-control" style="margin-top:5px;" value="${app.data.settings.monthlyDues}" placeholder="Tutar" oninput="app.handlers.generateText()">
                `;
            } else if (type === 'toplanti') {
                defaultSubject = '📣 TOPLANTI ÇAĞRISI';
                inputArea.innerHTML = `
                    <input type="date" id="ann-date" class="form-control" onchange="app.handlers.generateText()">
                    <input type="time" id="ann-time" class="form-control" style="margin-top:5px;" onchange="app.handlers.generateText()">
                    <input type="text" id="ann-topic" class="form-control" style="margin-top:5px;" placeholder="Gündem Maddesi" oninput="app.handlers.generateText()">
                `;
            } else if (type === 'ariza') {
                defaultSubject = '⚠️ BAKIM/ONARIM BİLGİLENDİRMESİ';
                inputArea.innerHTML = `
                    <input type="text" id="ann-subject" class="form-control" placeholder="Arıza Konusu (Örn: Asansör)" oninput="app.handlers.generateText()">
                    <input type="text" id="ann-duration" class="form-control" style="margin-top:5px;" placeholder="Tahmini Süre" oninput="app.handlers.generateText()">
                `;
            } else if (type === 'kural') {
                defaultSubject = '⚠️ ÖNEMLİ DUYURU';
                inputArea.style.display = 'none';
            } else {
                subjectInputGroup.style.display = 'none';
                inputArea.style.display = 'none';
            }

            if (defaultSubject) subjectInput.value = defaultSubject;

            app.handlers.generateText();
        },





        generateText: function () {
            const type = document.getElementById('announce-type').value;
            const result = document.getElementById('announce-result');
            const mainSubject = document.getElementById('announce-main-subject').value;

            if (type === 'aidat') {
                const month = document.getElementById('ann-month')?.value || '...';
                const amount = document.getElementById('ann-amount')?.value || '...';
                result.value = `${mainSubject}\n\nSayın Bina Sakinleri,\n\n${month} ayı aidat ödemeleri başlamıştır. Binasımızın genel giderlerinin aksamaması için ödemelerinizi zamanında yapmanız rica olunur.\n\nAidat Tutarı: ${amount} TL\n\nÖdeme yapmayan dairelerin listesi panoda ilan edilecektir.\n\nYönetim`;
            } else if (type === 'toplanti') {
                const date = document.getElementById('ann-date')?.value || '...';
                const time = document.getElementById('ann-time')?.value || '...';
                const topic = document.getElementById('ann-topic')?.value || 'Genel Kurul';
                result.value = `${mainSubject}\n\nSayın Kat Malikleri,\n\nBina yönetim toplantısı yapılacaktır. Katılımınız önemle rica olunur.\n\nTarih: ${date}\nSaat: ${time}\nGündem: ${topic}\n\nYer: Bina Sığınağı/Toplantı Salonu\n\nYönetim`;
            } else if (type === 'ariza') {
                const subject = document.getElementById('ann-subject')?.value || '...';
                const duration = document.getElementById('ann-duration')?.value || '...';
                result.value = `${mainSubject}\n\nBinamızdaki ${subject} ile ilgili bakım çalışması yapılacaktır.\n\nBu süreçte ${subject} kullanım dışı kalabilir.\nTahmini Süre: ${duration}\n\nAnlayışınız için teşekkür ederiz.\n\nYönetim`;
            } else if (type === 'kural') {
                result.value = `${mainSubject}\n\nSayın Sakinler,\n\nBina ortak alanlarında (koridorlar, kapı önleri) ayakkabı, çöp vb. eşyaların bırakılmaması kurallar gereği yasaktır.\n\nTemizlik ve düzen açısından bu kurala uyulmasını önemle rica ederiz.\n\nYönetim`;
            }
        },

        copyAnnouncement: function () {
            const copyText = document.getElementById("announce-result");
            copyText.select();
            copyText.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(copyText.value).then(() => {
                alert("Metin kopyalandı!");
            });
        },

        shareAnnouncement: function () {
            const text = document.getElementById("announce-result").value;
            const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        },

        saveAnnouncement: function () {
            const text = document.getElementById("announce-result").value;
            const subject = document.getElementById("announce-main-subject").value || 'Konusuz Duyuru';

            if (!text) {
                alert("Kaydedilecek metin yok.");
                return;
            }

            const title = prompt("Taslak adı girin:", subject);
            if (!title) return;

            if (!app.data.savedAnnouncements) app.data.savedAnnouncements = [];

            app.data.savedAnnouncements.push({
                title: title,
                text: text,
                subject: subject,
                date: new Date().toLocaleDateString('tr-TR')
            });

            app.saveData();
            app.ui.renderPage('assistant'); // Refresh list
            alert("Taslak kaydedildi!");
        },

        loadAnnouncement: function (index) {
            // Helper if needed, but logic is mainly in updateAnnouncementTemplate now
            const select = document.getElementById('announce-type');
            if (select) {
                select.value = `saved_${index}`;
                app.handlers.updateAnnouncementTemplate();
            }
        },

        deleteAnnouncement: function () {
            const select = document.getElementById('announce-type');
            const type = select.value;

            if (!type || !type.startsWith('saved_')) {
                alert("Silmek için lütfen listeden 'Kaydedilen Taslaklar' altından bir seçim yapın.");
                return;
            }

            const index = parseInt(type.split('_')[1]);

            if (confirm("Seçili taslağı silmek istediğinize emin misiniz?")) {
                app.data.savedAnnouncements.splice(index, 1);
                app.saveData();
                alert('Taslak silindi.');
                app.ui.renderPage('assistant');
            }
        },

        triggerImport: function () {
            document.getElementById('import-file').click();
        },

        handleFileSelect: function (event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (importedData.residents && importedData.transactions) {
                        app.data = importedData;
                        app.saveData();
                        alert('Veriler başarıyla yüklendi!');
                        location.reload(); // Reload to refresh all views securely
                    } else {
                        alert('Geçersiz veri dosyası.');
                    }
                } catch (error) {
                    console.error(error);
                    alert('Dosya okuma hatası! JSON formatında olduğundan emin olun.');
                }
            };
            reader.readAsText(file);
        },

        triggerPdfImport: function () {
            const input = document.getElementById('import-pdf');
            if (input) {
                input.click();
            } else {
                alert("Hata: PDF yükleme aracı (import-pdf) bulunamadı! Lütfen sayfayı yenileyin.");
            }
        },

        showResidentDetail: function (id) {
            const r = app.data.residents.find(x => x.id === id);
            if (!r) return;

            // Header
            document.getElementById('detail-res-title').innerText = r.fullName;

            // Set Add Debt Button Action
            const addDebtBtn = document.getElementById('detail-add-debt-btn');
            if (addDebtBtn) {
                addDebtBtn.onclick = function () {
                    // Close detail modal first if needed, or just open on top. 
                    // Let's close detail to avoid z-index issues or confusion, or keep it open?
                    // Better close detail, then open transaction.
                    app.ui.closeModal('modal-resident-detail');
                    app.handlers.openAddTransactionModal('debt', r.id);
                };
            }

            // Logic Fix: If type is tenant, show 'Kiracı'. Else 'Ev Sahibi'
            // Also corrected display text
            const roleText = r.type === 'tenant' ? 'Kiracı' : 'Ev Sahibi';
            document.getElementById('detail-res-subtitle').innerText = `Daire ${r.doorNumber} • ${roleText}`;

            // Calculate Stats from Transactions
            // Sort trans for this user
            // Fix: Parse residentId to int for safe comparison if stored as string
            // CORRECT FIX: Use Number() (float) instead of parseInt(). 
            // Residents created in same batch share Date.now(), uniqueness is in the decimal!
            const trans = app.data.transactions.filter(t => Number(t.residentId) === Number(id)).sort((a, b) => new Date(b.date) - new Date(a.date));

            let totalDebt = 0; // Accruals
            let totalPaid = 0; // Payments

            trans.forEach(t => {
                const amt = parseFloat(t.amount);
                if (t.type === 'income') {
                    totalPaid += amt;
                } else {
                    totalDebt += amt;
                }
            });

            document.getElementById('detail-total-debt').innerText = app.formatCurrency(totalDebt);
            document.getElementById('detail-total-paid').innerText = app.formatCurrency(totalPaid);
            const currentBalance = app.helpers.getResidentBalance(r.id);
            const balanceElem = document.getElementById('detail-balance');
            balanceElem.innerText = app.formatCurrency(currentBalance);
            balanceElem.className = 'stat-value ' + (currentBalance < 0 ? 'text-danger' : 'text-success');

            // Render History
            const tbody = document.getElementById('detail-history-body');
            tbody.innerHTML = '';

            if (trans.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Henüz işlem geçmişi yok.</td></tr>';
            } else {
                trans.forEach(t => {
                    const isIncome = t.type === 'income';
                    const colorClass = isIncome ? 'text-success' : 'text-danger';
                    const sign = isIncome ? 'Ödeme' : 'Borç/Gider';

                    tbody.innerHTML += `
                        <tr>
                            <td>${t.date}</td>
                            <td><span class="badge ${isIncome ? 'success' : 'danger'}">${sign}</span></td>
                            <td>${t.description}</td>
                            <td class="text-right ${colorClass}"><strong>${app.formatCurrency(t.amount)}</strong></td>
                            <td style="text-align:center;">
                                <button class="btn-icon delete" onclick="app.handlers.deleteTransaction(${t.id})" title="Sil">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                     `;
                });
            }

            app.ui.openModal('modal-resident-detail');
        },

        handleReceiptUpload: async function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const loading = document.getElementById('receipt-loading');
            loading.style.display = 'block';
            loading.innerText = 'Yapay zeka fişi okuyor...';

            // Convert to Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Image = reader.result.split(',')[1];
                const mimeType = file.type;

                // Check API Key
                const apiKey = localStorage.getItem('openai_api_key'); // We store all keys here now
                if (!apiKey) {
                    alert("Fiş okuma için Ayarlar sayfasından API Anahtarını girmeniz gerekir.");
                    loading.style.display = 'none';
                    return;
                }

                // Vision features strictly require Gemini for now (free and easy)
                if (!apiKey.startsWith('AIza')) {
                    alert("Fiş/Fatura okuma özelliği (Görsel Analiz) şu an için sadece Google Gemini anahtarı ile çalışmaktadır.\n\nLütfen Ayarlar sayfasından 'AIza' ile başlayan Google Gemini anahtarınızı giriniz.");
                    loading.style.display = 'none';
                    return;
                }

                try {
                    const prompt = `
                    Analyze this receipt image and extract these 4 fields in strict JSON format:
                    {
                        "amount": number (total amount in currency, numbers only),
                        "description": string (short summary, e.g. "Migros Market"),
                        "date": string (YYYY-MM-DD format),
                        "category": string (One of: "Elektrik", "Su", "Temizlik", "Asansör", "Bakım Onarım", "Personel", "Diğer")
                    }
                    If you can't be sure, guess the most likely.
                    `;

                    const model = localStorage.getItem('gemini_model') || 'gemini-1.5-flash';

                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    { text: prompt },
                                    { inline_data: { mime_type: mimeType, data: base64Image } }
                                ]
                            }]
                        })
                    });

                    const data = await response.json();

                    if (data.error) {
                        throw new Error(data.error.message);
                    }

                    const text = data.candidates[0].content.parts[0].text;
                    const jsonMatch = text.match(/\{[\s\S]*\}/);

                    if (jsonMatch) {
                        const res = JSON.parse(jsonMatch[0]);

                        document.getElementById('trans-amount').value = res.amount || '';
                        document.getElementById('trans-desc').value = res.description || '';
                        document.getElementById('trans-date').value = res.date || new Date().toISOString().split('T')[0];
                        if (res.category) {
                            document.getElementById('trans-category').value = res.category;
                        }

                        loading.innerText = '✅ Başarıyla okundu!';
                        setTimeout(() => { loading.style.display = 'none'; }, 2000);
                    } else {
                        throw new Error("JSON bulunamadı");
                    }

                } catch (err) {
                    console.error(err);
                    loading.innerText = '⚠️ Okuma başarısız.';
                    alert('Fiş okunamadı: ' + err.message);
                }
            };
        },

        handlePdfSelect: async function (event) {
            const file = event.target.files[0];
            if (!file) return;

            // Reset input so same file can be selected again
            const input = event.target;

            // EXCEL handling
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Array of arrays

                        if (!jsonData || jsonData.length === 0) {
                            alert("Excel dosyası boş veya okunamadı.");
                            return;
                        }

                        // Simple Heuristic Mapper
                        // Assume headers are in row 0
                        const headers = jsonData[0].map(h => String(h).toLowerCase());
                        const rows = jsonData.slice(1);

                        // Find column indices
                        const dateIdx = headers.findIndex(h => h.includes('tarih') || h.includes('date'));
                        const descIdx = headers.findIndex(h => h.includes('açıklama') || h.includes('desc') || h.includes('işlem'));
                        const amountIdx = headers.findIndex(h => h.includes('tutar') || h.includes('amount') || h.includes('borç') || h.includes('alacak'));

                        if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
                            // Fallback: If 3 columns, assume Date, Desc, Amount
                            // Or ask user? For now, try fallback only if exactly 3 cols?
                            // Keep it simple: alert user to fix headers if creating new
                            // Be robust: try generic indices 0, 1, 2 if headers fail
                            // Let's rely on mapping logic or just prompt.
                            // Implementing auto-detection based on content types could be overkill but better.
                        }

                        let transactions = [];

                        rows.forEach(row => {
                            if (!row || row.length === 0) return;

                            // Get values based on indices or default positions
                            let dateRaw = dateIdx !== -1 ? row[dateIdx] : row[0];
                            let descRaw = descIdx !== -1 ? row[descIdx] : row[1];
                            let amountRaw = amountIdx !== -1 ? row[amountIdx] : (row[2] || row[3]); // Try 3rd or 4th col

                            if (!dateRaw || !amountRaw) return;

                            // Format Date (Excel date number or string)
                            let dateStr = "";
                            if (typeof dateRaw === 'number') {
                                // Excel date number
                                const d = new Date(Math.round((dateRaw - 25569) * 86400 * 1000));
                                dateStr = d.toISOString().split('T')[0];
                            } else {
                                // Try parsing string "DD.MM.YYYY" or standard
                                // Simple impl for now
                                try {
                                    // "01.01.2024" -> "2024-01-01"
                                    if (String(dateRaw).includes('.')) {
                                        const parts = String(dateRaw).split('.');
                                        if (parts.length === 3) dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                    } else {
                                        dateStr = new Date(dateRaw).toISOString().split('T')[0];
                                    }
                                } catch (e) { dateStr = new Date().toISOString().split('T')[0]; }
                            }

                            // Format Amount
                            let amount = parseFloat(String(amountRaw).replace(/[^0-9.,-]/g, '').replace(',', '.'));
                            if (isNaN(amount)) return;

                            let type = 'income';
                            if (amount < 0) {
                                type = 'expense';
                                amount = Math.abs(amount);
                            } else {
                                // Heuristic: specific keywords -> expense
                                const d = String(descRaw).toLowerCase();
                                if (d.includes('fatura') || d.includes('ödeme') || d.includes('gider')) {
                                    // Ambiguous... let's assume positive is income unless context says otherwise
                                    // Bank extracts: negative usually expense.
                                    // Does the user upload bank extract? Yes.
                                }
                            }

                            transactions.push({
                                date: dateStr,
                                description: String(descRaw),
                                amount: amount,
                                type: type,
                                residentId: null, // AI/Auto match will fill
                                category: 'Diğer'
                            });
                        });

                        // Post-Process: Client-Side Auto Match
                        transactions = app.handlers.autoMatchTransactions(transactions);

                        if (transactions && transactions.length > 0) {
                            app.data.tempTransactions = transactions;
                            app.handlers.showImportReview(app.data.tempTransactions);
                        } else {
                            alert("Excel'den işlem okunamadı.");
                        }

                    } catch (e) {
                        alert("Excel hatası: " + e.message);
                        console.error(e);
                    } finally {
                        input.value = '';
                    }
                };
                reader.readAsArrayBuffer(file);
                return;
            }

            // Reset input so same file can be selected again (using existing reference)
            // const input = event.target; // Already defined above

            let apiKey = localStorage.getItem('openai_api_key');
            if (!apiKey) {
                alert("PDF analizi için Ayarlar sayfasından API Anahtarı girmelisiniz.");
                input.value = '';
                return;
            }

            apiKey = apiKey.trim();

            // Create loading overlay
            const loadingMsg = document.createElement('div');
            loadingMsg.id = 'pdf-loading';
            loadingMsg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);color:white;display:flex;flex-direction:column;gap:15px;align-items:center;justify-content:center;z-index:9999;font-size:1.2rem;backdrop-filter:blur(5px);';
            loadingMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:3rem;"></i> <span>PDF Okunuyor ve Analiz Ediliyor...</span><small>(Bu işlem biraz sürebilir)</small>';
            document.body.appendChild(loadingMsg);

            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

                let allTransactions = [];
                let chunkText = "";
                const CHUNK_SIZE = 15000; // ~15k chars per AI call to stay safe

                // Prepare Resident Data Context
                const residentsData = (app.data.residents || []).map(r => {
                    const names = [r.fullName];
                    if (r.ownerName) names.push(r.ownerName);
                    return `(Apt: ${r.doorNumber || r.apartmentNo}) ${names.join(', ')}`;
                }).join(' | ');

                for (let i = 1; i <= pdf.numPages; i++) {
                    // Update Loading UI
                    const loadingText = document.querySelector('#pdf-loading span');
                    if (loadingText) loadingText.innerText = `PDF Okunuyor... Sayfa ${i} / ${pdf.numPages}`;

                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    chunkText += pageText + "\n";

                    // If chunk is large enough or last page
                    if (chunkText.length > CHUNK_SIZE || i === pdf.numPages) {
                        if (loadingText) loadingText.innerText = `Yapay Zeka Analiz Ediyor... (Sayfa ${i}'e kadar)`;

                        try {
                            const partialTrans = await app.handlers.analyzeWithAI(chunkText, apiKey, residentsData);
                            if (Array.isArray(partialTrans)) {
                                allTransactions = allTransactions.concat(partialTrans);
                            }
                        } catch (chunkErr) {
                            console.error(`Chunk analysis failed at page ${i}`, chunkErr);
                            // Optionally warn user, but continue to try other chunks
                        }
                        chunkText = ""; // Reset chunk
                    }
                }

                document.body.removeChild(loadingMsg);

                if (allTransactions.length === 0) {
                    alert("İşlem bulunamadı veya analiz edilemedi.");
                    return;
                }

                // Deep Copy & Clean
                let transactions = JSON.parse(JSON.stringify(allTransactions));

                // Post-Process: Client-Side Auto Match
                transactions = app.handlers.autoMatchTransactions(transactions);

                if (transactions && transactions.length > 0) {
                    app.data.tempTransactions = transactions;
                    app.handlers.showImportReview(app.data.tempTransactions);
                } else {
                    alert("İşlem bulunamadı (Filtreleme sonrası).");
                }

            } catch (err) {
                if (document.getElementById('pdf-loading')) document.body.removeChild(document.getElementById('pdf-loading'));
                console.error(err);
                alert("Hata: " + err.message);
            } finally {
                input.value = '';
            }
        },

        analyzeWithAI: async function (text, apiKey, residentsData) {
            try {
                let url, body;
                apiKey = apiKey.trim();

                const systemPrompt = `You are a financial assistant for an apartment management system. 
                Task 1: Extract bank transactions from the provided text.
                Task 2: Classify each transaction as "income" (positive amounts) or "expense" (negative amounts). 
                Task 3: Match the transaction to a resident. List of residents: [${residentsData}].
                
                CRITICAL RULES:
                1. Return ONLY a single valid JSON array. Do not use markdown formatting. 
                2. Use valid JSON syntax. All keys must be double-quoted.
                3. Escape double quotes inside strings with backslash.
                4. Do NOT output trailing commas.
                5. Format: [{ "date": "YYYY-MM-DD", "description": "...", "amount": 100.50, "type": "income", "apartmentNo": 5 }].
                6. IMPORTANT: If you find an apartment number (Kapı No / Daire No) in the description or text, put it in "apartmentNo" as a number.
                7. If unsure about apartmentNo, set it to null.
                8. Convert amounts to positive numbers.
                `;

                if (apiKey.startsWith('AIza')) {
                    const model = localStorage.getItem('gemini_model') || 'gemini-1.5-flash';
                    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    body = JSON.stringify({
                        contents: [{
                            parts: [{
                                text: systemPrompt + "\n\nText to analyze:\n" + text
                            }]
                        }],
                        generationConfig: {
                            responseMimeType: "application/json" // Force JSON mode for Gemini
                        }
                    });
                } else {
                    // Default to OpenAI
                    url = 'https://api.openai.com/v1/chat/completions';
                    body = JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [
                            { "role": "system", "content": systemPrompt },
                            { "role": "user", "content": text }
                        ],
                        response_format: { type: "json_object" } // Force JSON mode for OpenAI
                    });
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(apiKey.startsWith('AIza') ? {} : { 'Authorization': `Bearer ${apiKey}` })
                    },
                    body: body
                });

                const data = await response.json();

                if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

                let content = '';
                if (apiKey.startsWith('AIza')) {
                    content = data.candidates[0].content.parts[0].text;
                } else {
                    content = data.choices[0].message.content;
                }

                // Cleanup Content
                content = content.replace(/```json/gi, '').replace(/```/g, '').trim();

                // Extract Array part
                const firstOpen = content.indexOf('[');
                const lastClose = content.lastIndexOf(']');
                if (firstOpen !== -1 && lastClose !== -1) {
                    content = content.substring(firstOpen, lastClose + 1);
                }

                try {
                    return JSON.parse(content);
                } catch (parseError) {
                    console.error("Raw AI Response:", content);
                    // Minimal fallback fix for common issues
                    // 1. Try to fix unquoted keys
                    let fixedContent = content.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
                    // 2. Try to fix trailing commas
                    fixedContent = fixedContent.replace(/,(\s*[}\]])/g, '$1');

                    try {
                        return JSON.parse(fixedContent);
                    } catch (e2) {
                        // Final desperate attempt: manual extraction if JSON is FUBAR
                        console.warn("Deep recovery mode activated for JSON");
                        const recovered = [];
                        const matches = content.match(/\{.*?\}/gs); // Match objects
                        if (matches) {
                            matches.forEach(m => {
                                try { recovered.push(JSON.parse(m)); } catch (e) { }
                            });
                        }
                        if (recovered.length > 0) return recovered;

                        throw new Error("AI yanıtı okunamadı (JSON hatası). Hata: " + parseError.message);
                    }
                }
            } catch (e) {
                // Fallback for non-JSON response from AI - try regex extraction
                console.warn("JSON Parse Failed. Attempting Regex Fallback...", e);
                const jsonMatch = text.match(/\[.*\]/s);
                if (jsonMatch) {
                    try {
                        return JSON.parse(jsonMatch[0]);
                    } catch (e2) {
                        console.error("Regex Fallback failed", e2);
                    }
                }
                throw e;
            }
        },

        // Helper: Deterministic Client-Side Matching
        autoMatchTransactions: function (transactions) {
            if (!app.data.residents || app.data.residents.length === 0) return transactions;

            // Helper: Extract Surname robustly (handles parentheses)
            const getSurname = (fullName) => {
                if (!fullName) return "";
                // Remove content in parentheses and trim (e.g., "Burhan DİNÇ (Kardeşi)" -> "Burhan DİNÇ")
                let clean = fullName.replace(/\(.*\)/g, '').trim();
                let parts = clean.split(' ').filter(x => x.length > 0);
                if (parts.length > 0) {
                    return parts[parts.length - 1].toLocaleUpperCase('tr-TR');
                }
                return "";
            };

            // Helper: Get Clean Full Name for exact matching
            const getCleanFullName = (fullName) => {
                if (!fullName) return "";
                return fullName.replace(/\(.*\)/g, '').trim().toLocaleUpperCase('tr-TR');
            };

            // 1. Pre-process Residents
            const surnameMap = {}; // surname -> [residentId]
            const fullNameMap = {}; // FULL NAME (UPPER) -> residentId
            const doorMap = {}; // doorNumber -> residentId

            app.data.residents.forEach(r => {
                // A. Index Full Names (High Confidence)
                if (r.fullName) fullNameMap[getCleanFullName(r.fullName)] = r.id;
                if (r.ownerName) fullNameMap[getCleanFullName(r.ownerName)] = r.id;

                // B. Index Door Numbers (Very High Confidence if AI found it)
                if (r.doorNumber) doorMap[String(r.doorNumber)] = r.id;

                // C. Index Surnames (Medium Confidence)
                const surnames = [];
                const s1 = getSurname(r.fullName);
                if (s1.length > 2) surnames.push(s1);

                const s2 = getSurname(r.ownerName);
                if (s2.length > 2) surnames.push(s2);

                surnames.forEach(s => {
                    if (!surnameMap[s]) surnameMap[s] = [];
                    surnameMap[s].push(r.id);
                });
            });

            // 2. Iterate Transactions
            transactions.forEach(t => {
                // If already matched by ID, skip
                if (t.residentId) return;

                // STRATEGY 0: Apartment Number Match (AI or Excel provided)
                if (t.apartmentNo) {
                    const cleanDoor = String(t.apartmentNo).replace(/[^0-9]/g, '');
                    if (doorMap[cleanDoor]) {
                        t.residentId = doorMap[cleanDoor];
                        t._autoMatchReason = "Daire No Eşleşmesi: " + cleanDoor;
                        return;
                    }
                }

                const desc = t.description.toLocaleUpperCase('tr-TR');

                // ------------------------------------------
                // STRATEGY 4: Custom Manual Mappings (User Requests)
                // ------------------------------------------
                const customMatches = [
                    { key: "YAVUZ DİNÇEL", targetName: "ATİLLA DİNÇEL" },
                    { key: "ESAT KAAN", targetName: "ABDULKADİR AYDINALP" },
                    { key: "ESAT KAAN AYDINALP", targetName: "ABDULKADİR AYDINALP" }
                ];

                for (const cm of customMatches) {
                    if (desc.includes(cm.key)) {
                        const r = app.data.residents.find(x => x.fullName.toLocaleUpperCase('tr-TR') === cm.targetName.toLocaleUpperCase('tr-TR'));
                        if (r) {
                            t.residentId = r.id;
                            t.apartmentNo = r.doorNumber || r.apartmentNo;
                            t._autoMatchReason = "Özel Eşleşme: " + cm.key;
                            return; // Match found, skip others
                        }
                    }
                }

                // STRATEGY 1: Full Name Match (High Confidence)
                // Check every resident name against description
                for (const [name, id] of Object.entries(fullNameMap)) {
                    if (name.length < 3) continue; // CRITICAL FIX: Ignore short/empty names to prevent wildcard match

                    if (desc.includes(name)) {
                        const r = app.data.residents.find(x => x.id === id);
                        if (r) {
                            t.residentId = r.id;
                            t.apartmentNo = r.doorNumber || r.apartmentNo;
                            t._autoMatchReason = "İsim Eşleşmesi: " + name;
                            return;
                        }
                    }
                }

                // STRATEGY 3: Token-Based Match (High Confidence)
                // Checks for "AHMET" match AND "YILMAZ" match (any order)
                if (!t.residentId) {
                    const getTokens = (str) => {
                        if (!str) return [];
                        return str.replace(/\(.*\)/g, '')
                            .trim()
                            .split(/\s+/)
                            .filter(x => x.length > 2)
                            .map(x => x.toLocaleUpperCase('tr-TR'));
                    };

                    for (const r of app.data.residents) {
                        const tokens = getTokens(r.fullName);
                        // Only apply if we have at least 2 significant name parts (e.g. Name + Surname)
                        if (tokens.length >= 2) {
                            const allFound = tokens.every(token => desc.includes(token));
                            if (allFound) {
                                t.residentId = r.id;
                                t.apartmentNo = r.doorNumber || r.apartmentNo;
                                t._autoMatchReason = "Kelime Eşleşmesi: " + r.fullName;
                                return; // Match found
                            }
                        }

                        // Also check Owner Name if exists
                        if (r.ownerName) {
                            const ownerTokens = getTokens(r.ownerName);
                            if (ownerTokens.length >= 2) {
                                const allFoundOw = ownerTokens.every(token => desc.includes(token));
                                if (allFoundOw) {
                                    t.residentId = r.id;
                                    t.apartmentNo = r.doorNumber || r.apartmentNo;
                                    t._autoMatchReason = "Kelime Eşleşmesi (Ev Sahibi): " + r.ownerName;
                                    return;
                                }
                            }
                        }
                    }
                }

                // STRATEGY 2: Unique Surname Match (Medium Confidence)
                // We iterate all known surnames. If exactly ONE appears in the description, match it.
                let matchedResidentId = null;
                let foundSurnamesCount = 0;
                let lastFoundSurname = "";

                for (const [surname, ids] of Object.entries(surnameMap)) {
                    // Check if surname length is valid to prevent noise
                    if (surname.length < 3) continue;

                    if (desc.includes(surname)) {
                        foundSurnamesCount++;
                        lastFoundSurname = surname;
                        if (ids.length === 1) {
                            matchedResidentId = ids[0];
                        } else {
                            matchedResidentId = null;
                        }
                    }
                }

                // Only apply if exactly one surname was found in the text AND that surname belongs to exactly one resident
                if (foundSurnamesCount === 1 && matchedResidentId) {
                    const r = app.data.residents.find(x => x.id === matchedResidentId);
                    if (r) {
                        t.residentId = r.id;
                        t.apartmentNo = r.doorNumber || r.apartmentNo;
                        t._autoMatchReason = "Soyisim Eşleşmesi: " + lastFoundSurname;
                    }
                }
            });

            return transactions;
        },

        // --- EXPORT HELPERS ---
        exportToCSV: function (filename, headers, rows) {
            // 1. Add BOM for Excel UTF-8 compatibility
            let csvContent = "\uFEFF";

            // 2. Add Headers
            csvContent += headers.join(";") + "\r\n";

            // 3. Add Rows
            rows.forEach(rowArray => {
                const row = rowArray.map(cell => {
                    // Escape quotes and wrap in quotes if necessary
                    let cellStr = String(cell === null || cell === undefined ? "" : cell);
                    if (cellStr.includes(";") || cellStr.includes("\"") || cellStr.includes("\n")) {
                        cellStr = "\"" + cellStr.replace(/"/g, "\"\"") + "\""; // Escape double quotes
                    }
                    return cellStr;
                }).join(";");
                csvContent += row + "\r\n";
            });

            // 4. Create Download Link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        downloadTransactionsCSV: function () {
            const headers = ["Tarih", "Türü", "Kategori", "Açıklama", "Tutar (TL)", "İlgili Kişi/Daire"];

            // Sort by date desc
            const sorted = [...app.data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

            const rows = sorted.map(t => {
                let entityName = "-";
                if (t.residentId) {
                    const r = app.data.residents.find(x => x.id == t.residentId);
                    entityName = r ? `Daire ${r.doorNumber} - ${r.fullName}` : "Silinmiş Kayıt";
                }

                // Format type
                let typeStr = t.type === 'income' ? 'GELİR (TAHSİLAT)' : 'GİDER (HARCAMA)';
                if (t.isDebt) typeStr = 'BORÇLANDIRMA (AİDAT)';

                // Format amount (use standard decimal point for excel if needed, or comma)
                const amountStr = t.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                return [
                    t.date,
                    typeStr,
                    (t.category || "-").toLocaleUpperCase('tr-TR'),
                    t.description,
                    amountStr,
                    entityName
                ];
            });

            app.helpers.exportToCSV(`Bina_Hareketler_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.csv`, headers, rows);
        },

        downloadResidentsCSV: function () {
            const headers = ["Daire No", "Ad Soyad", "Telefon", "Tür", "Ev Sahibi Adı", "Ev Sahibi Tel", "Güncel Bakiye (TL)"];

            const sorted = [...app.data.residents].sort((a, b) => a.doorNumber - b.doorNumber);

            const rows = sorted.map(r => {
                const balance = app.helpers.getResidentBalance(r.id);
                const balanceStr = balance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                return [
                    r.doorNumber,
                    r.fullName,
                    r.phone,
                    r.type === 'tenant' ? 'KİRACI' : 'EV SAHİBİ',
                    r.ownerName || "",
                    r.ownerPhone || "",
                    balanceStr
                ];
            });

            app.helpers.exportToCSV(`Bina_Sakinler_Borc_Listesi_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.csv`, headers, rows);
        },


        // --- REAL EXCEL EXPORT HELPERS (XLS/HTML) ---
        exportToXLS: function (filename, headers, rows) {
            let tableHTML = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
            tableHTML += '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sayfa1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>';
            tableHTML += '<body><table border="1" style="border-collapse: collapse;">';

            tableHTML += '<tr style="background-color: #f0f0f0; font-weight: bold;">';
            headers.forEach(h => { tableHTML += `<th style="padding:10px;">${h}</th>`; });
            tableHTML += '</tr>';

            rows.forEach(rowArray => {
                tableHTML += '<tr>';
                rowArray.forEach(cell => {
                    const cellStr = cell === null || cell === undefined ? "" : cell;
                    tableHTML += `<td style="padding:5px;">${cellStr}</td>`;
                });
                tableHTML += '</tr>';
            });
            tableHTML += '</table></body></html>';

            const blob = new Blob([tableHTML], { type: 'application/vnd.ms-excel;charset=utf-8' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        downloadTransactionsXLS: function () {
            const headers = ["Tarih", "Türü", "Kategori", "Açıklama", "Tutar (TL)", "İlgili Kişi/Daire"];
            const sorted = [...app.data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
            const rows = sorted.map(t => {
                let entityName = "-";
                if (t.residentId) {
                    const r = app.data.residents.find(x => x.id == t.residentId);
                    entityName = r ? `Daire ${r.doorNumber} - ${r.fullName}` : "Silinmiş Kayıt";
                }
                let typeStr = t.type === 'income' ? 'GELİR (TAHSİLAT)' : 'GİDER (HARCAMA)';
                if (t.isDebt) typeStr = 'BORÇLANDIRMA (AİDAT)';
                const amountStr = t.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return [t.date, typeStr, (t.category || "-").toLocaleUpperCase('tr-TR'), t.description, amountStr, entityName];
            });
            app.helpers.exportToXLS(`Bina_Hareketler_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.xls`, headers, rows);
        },

        downloadResidentsXLS: function () {
            const headers = ["Daire No", "Ad Soyad", "Telefon", "Tür", "Ev Sahibi Adı", "Ev Sahibi Tel", "Güncel Bakiye (TL)"];
            const sorted = [...app.data.residents].sort((a, b) => a.doorNumber - b.doorNumber);
            const rows = sorted.map(r => {
                const balance = app.helpers.getResidentBalance(r.id);
                const balanceStr = balance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return [r.doorNumber, r.fullName, r.phone, r.type === 'tenant' ? 'KİRACI' : 'EV SAHİBİ', r.ownerName || "", r.ownerPhone || "", balanceStr];
            });
            app.helpers.exportToXLS(`Bina_Sakinler_Borc_Listesi_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.xls`, headers, rows);
        },

        // --- Premium Auth Handlers ---
        switchAuthScreen: function (screenName) {
            document.querySelectorAll('.auth-screen').forEach(el => el.style.display = 'none');
            const target = document.getElementById(`auth-${screenName}`);
            if (target) target.style.display = 'block';

            // Reset forgot screen state if switching to it
            if (screenName === 'forgot') {
                document.getElementById('forgot-step-1').style.display = 'block';
                document.getElementById('forgot-step-2').style.display = 'none';
            }

            // Clear errors
            const err = document.getElementById('login-error');
            if (err) err.style.display = 'none';

            // Clear inputs if needed or focus
            if (screenName === 'login') {
                setTimeout(() => document.getElementById('login-username')?.focus(), 100);
            }
        },

        resetApp: function () {
            if (confirm('Tüm veriler silinecek ve kurulum ekranına dönülecek.\nOnaylıyor musunuz?')) {
                localStorage.clear();
                location.reload();
            }
        },

        handleRegister: function () {
            const fullname = document.getElementById('reg-fullname').value.trim();
            const username = document.getElementById('reg-username').value.trim();
            const password = document.getElementById('reg-password').value;
            const question = document.getElementById('reg-question').value;
            const answer = document.getElementById('reg-answer').value.trim();

            if (!fullname || !username || !password || !question || !answer) {
                alert("Lütfen tüm alanları doldurun.");
                return;
            }

            const user = {
                fullname,
                username,
                password,
                question,
                answer: answer.toLowerCase()
            };
            localStorage.setItem('app_user', JSON.stringify(user));

            alert("Kurulum tamamlandı! Giriş yapabilirsiniz.");
            app.handlers.switchAuthScreen('login');
        },

        handleLogin: function () {
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const err = document.getElementById('login-error');

            const storedUser = JSON.parse(localStorage.getItem('app_user'));

            if (storedUser && username === storedUser.username && password === storedUser.password) {
                // Success
                document.getElementById('auth-overlay').style.display = 'none';
                app.initializeAppContent();
            } else {
                if (err) err.style.display = 'block';
                // Shake effect
                const card = document.querySelector('.auth-card');
                if (card) {
                    card.style.animation = 'none';
                    card.offsetHeight; /* trigger reflow */
                    card.style.animation = 'shake 0.5s';
                }
            }
        },

        checkRecoveryUser: function () {
            const username = document.getElementById('forgot-username').value.trim();
            const storedUser = JSON.parse(localStorage.getItem('app_user'));

            if (storedUser && storedUser.username === username) {
                document.getElementById('forgot-step-1').style.display = 'none';
                document.getElementById('forgot-step-2').style.display = 'block';
                document.getElementById('recovery-question-display').innerText = storedUser.question || 'Güvenlik Sorusu';
            } else {
                alert('Kullanıcı bulunamadı.');
            }
        },

        handleResetPassword: function () {
            const answer = document.getElementById('forgot-answer').value.trim().toLowerCase();
            const newPass = document.getElementById('new-password').value;
            const storedUser = JSON.parse(localStorage.getItem('app_user'));

            if (!answer || !newPass) {
                alert("Lütfen cevap ve yeni parola girin.");
                return;
            }

            if (storedUser && answer === storedUser.answer.toLowerCase()) {
                storedUser.password = newPass;
                localStorage.setItem('app_user', JSON.stringify(storedUser));
                alert("Parola güncellendi! Giriş yapabilirsiniz.");
                app.handlers.switchAuthScreen('login');
            } else {
                alert("Güvenlik cevabı hatalı!");
            }
        },

        showImportReview: function (transactions) {
            const container = document.getElementById('import-preview-container');

            // Generate Datalist Options ONCE
            let datalistOptions = '';
            (app.data.residents || []).sort((a, b) => a.doorNumber - b.doorNumber).forEach(r => {
                let displayName = r.fullName;
                if (r.type === 'tenant' && r.ownerName) {
                    displayName = `${r.fullName} (Ev S: ${r.ownerName})`;
                }
                const val = `Daire ${r.doorNumber}: ${displayName}`;
                datalistOptions += `<option data-id="${r.id}" value="${val}"></option>`;
            });

            // Add datalist to DOM if not exists or update it
            let dataList = document.getElementById('resident-datalist-source');
            if (!dataList) {
                dataList = document.createElement('datalist');
                dataList.id = 'resident-datalist-source';
                document.body.appendChild(dataList);
            }
            dataList.innerHTML = datalistOptions;

            let html = '<table class="premium-table"><thead><tr><th>Tarih</th><th>Açıklama</th><th>Tutar</th><th>Tip</th><th>Detay / Kategori</th></tr></thead><tbody>';

            const categories = [
                "PERSONEL MAAŞ", "PERSONEL SGK", "ELEKTRİK", "SU",
                "ASANSÖR BAKIM", "TEMİZLİK", "BAHÇE PEYZAJ",
                "BAKIM ONARIM", "YÖNETİM KIRTASİYE", "BÖCEK İLAÇLAMA", "DİĞER"
            ];
            const expenseOptions = categories.map((c, i) => `<option value="${c}">${i + 1}-${c}</option>`).join('');

            transactions.forEach((t, index) => {
                // Type Check logic handled inside renderRow to support dynamic updates
                const rowHTML = app.handlers.renderImportRow(index, t, expenseOptions);
                html += rowHTML;
            });

            html += '</tbody></table>';

            // ... (rest of showImportReview)
            document.getElementById('import-preview-container').innerHTML = html;
            app.ui.openModal('modal-import-review');
        },

        renderImportRow: function (index, t, expenseOptions) {
            const isIncome = t.type === 'income';
            const color = isIncome ? 'text-success' : 'text-danger';

            let lastCellHTML = '';

            if (isIncome) {
                // Resident Search Logic
                const rId = t.residentId;
                let inputValue = '';

                if (rId) {
                    const r = app.data.residents.find(x => x.id == rId);
                    if (r) {
                        let displayName = r.fullName;
                        if (r.type === 'tenant' && r.ownerName) displayName = `${r.fullName} (Ev S: ${r.ownerName})`;
                        inputValue = `Daire ${r.doorNumber}: ${displayName}`;
                    }
                }

                lastCellHTML = `
                        <input type="text" class="form-control resident-search-input" 
                               list="resident-datalist-source" 
                               value="${inputValue}" 
                               placeholder="Üye Ara..." 
                               onclick="this.select()" 
                               onchange="app.handlers.updateTempTransactionResident(${index}, this)">
                    `;
            } else {
                // Expense Category Logic
                const currentCat = t.category || '';
                const currentSubCat = t.subCategory || '';
                const subCatVisible = (currentCat === 'DİĞER' || currentCat === 'Diğer');

                lastCellHTML = `
                        <select class="form-control" onchange="app.handlers.updateTempTransactionCategory(${index}, this)">
                            <option value="">-- Kategori Seç --</option>
                            ${expenseOptions.replace(`value="${currentCat}"`, `value="${currentCat}" selected`)}
                        </select>
                        <input type="text" id="import-subcat-${index}" class="form-control" 
                               style="margin-top: 5px; display: ${subCatVisible ? 'block' : 'none'};" 
                               placeholder="Harcama Detayı" 
                               value="${currentSubCat}"
                               oninput="app.handlers.updateTempTransactionSubCategory(${index}, this)">
                    `;
            }

            return `
                    <tr id="import-row-${index}">
                        <td>${t.date}</td>
                        <td>${t.description}</td>
                        <td class="${color}">${app.formatCurrency(t.amount)}</td>
                        <td>
                            <select class="form-control" style="width: auto; padding: 5px;" onchange="app.handlers.updateTempTransactionType(${index}, this, '${encodeURIComponent(expenseOptions)}')">
                                <option value="income" ${isIncome ? 'selected' : ''}>Gelir</option>
                                <option value="expense" ${!isIncome ? 'selected' : ''}>Gider</option>
                            </select>
                        </td>
                        <td id="import-cell-detail-${index}">
                            ${lastCellHTML}
                        </td>
                    </tr>
                 `;
        },

        // Handler for Type Change
        updateTempTransactionType: function (index, typeSelect, encodedExpenseOptions) {
            const newType = typeSelect.value;
            app.data.tempTransactions[index].type = newType;

            // Re-render the detail cell
            const expenseOptions = decodeURIComponent(encodedExpenseOptions);
            const t = app.data.tempTransactions[index];

            // Re-generate the last cell HTML
            const isIncome = newType === 'income';
            let lastCellHTML = '';

            if (isIncome) {
                t.subCategory = null; // Clear subcat on income
                const rId = t.residentId;
                let inputValue = '';
                if (rId) {
                    const r = app.data.residents.find(x => x.id == rId);
                    if (r) {
                        let displayName = r.fullName;
                        if (r.type === 'tenant' && r.ownerName) displayName = `${r.fullName} (Ev S: ${r.ownerName})`;
                        inputValue = `Daire ${r.doorNumber}: ${displayName}`;
                    }
                }
                lastCellHTML = `
                        <input type="text" class="form-control resident-search-input" 
                               list="resident-datalist-source" 
                               value="${inputValue}" 
                               placeholder="Üye Ara..." 
                               onclick="this.select()" 
                               onchange="app.handlers.updateTempTransactionResident(${index}, this)">
                    `;
            } else {
                const currentCat = t.category || '';
                const currentSubCat = t.subCategory || '';
                const subCatVisible = currentCat === 'Diğer';

                lastCellHTML = `
                        <select class="form-control" onchange="app.handlers.updateTempTransactionCategory(${index}, this)">
                            <option value="">-- Kategori Seç --</option>
                            ${expenseOptions.replace(`value="${currentCat}"`, `value="${currentCat}" selected`)}
                        </select>
                        <input type="text" id="import-subcat-${index}" class="form-control" 
                               style="margin-top: 5px; display: ${subCatVisible ? 'block' : 'none'};" 
                               placeholder="Harcama Detayı" 
                               value="${currentSubCat}"
                               oninput="app.handlers.updateTempTransactionSubCategory(${index}, this)">
                    `;
            }

            document.getElementById(`import-cell-detail-${index}`).innerHTML = lastCellHTML;

            // Update amount color
            const row = document.getElementById(`import-row-${index}`);
            if (row && row.children[2]) {
                row.children[2].className = isIncome ? 'text-success' : 'text-danger';
            }
        },

        updateTempTransactionCategory: function (index, selectElement) {
            const cat = selectElement.value;
            app.data.tempTransactions[index].category = cat;

            const subCatInput = document.getElementById(`import-subcat-${index}`);
            if (subCatInput) {
                if (cat === 'DİĞER' || cat === 'Diğer') {
                    subCatInput.style.display = 'block';
                } else {
                    subCatInput.style.display = 'none';
                    subCatInput.value = '';
                    app.data.tempTransactions[index].subCategory = null;
                }
            }
        },

        updateTempTransactionSubCategory: function (index, inputElement) {
            app.data.tempTransactions[index].subCategory = inputElement.value;
        },

        updateTempTransactionResident: function (index, inputElement) {
            const val = inputElement.value.trim();
            const options = Array.from(document.querySelectorAll('#resident-datalist-source option'));
            let foundId = null;
            let foundValue = '';

            if (val === '') {
                app.data.tempTransactions[index].residentId = null;
                inputElement.style.borderColor = "";
                return;
            }

            // 1. Exact Match
            const exactMatch = options.find(opt => opt.value === val);
            if (exactMatch) {
                foundId = exactMatch.getAttribute('data-id');
                foundValue = exactMatch.value;
            } else {
                // 2. Fuzzy Match (Contains text)
                const search = val.toLocaleUpperCase('tr-TR');
                const matches = options.filter(opt => opt.value.toLocaleUpperCase('tr-TR').includes(search));

                if (matches.length === 1) {
                    foundId = matches[0].getAttribute('data-id');
                    foundValue = matches[0].value;
                    inputElement.value = foundValue;
                }
            }

            if (foundId) {
                app.data.tempTransactions[index].residentId = parseFloat(foundId); // Save as Number
                inputElement.style.borderColor = "#4CAF50"; // Green border for valid selection
            } else {
                app.data.tempTransactions[index].residentId = null;
                inputElement.style.borderColor = "#FF5722";
            }
        },




        confirmImportedTransactions: function () {
            if (!app.data.tempTransactions || app.data.tempTransactions.length === 0) return;

            const count = app.data.tempTransactions.length;
            app.data.tempTransactions.forEach(t => {
                // Ensure unique object for main DB
                const newTransaction = JSON.parse(JSON.stringify(t));
                newTransaction.id = Date.now() + Math.random();
                app.data.transactions.push(newTransaction);
            });

            app.data.tempTransactions = null;
            app.saveData();
            app.ui.closeModal('modal-import-review');
            alert(`${count} adet işlem başarıyla eklendi!`);

            // Refresh
            if (document.querySelector('.nav-item.active').dataset.page === 'transactions') {
                app.ui.renderPage('transactions');
            } else {
                app.renderDashboard();
            }
        },

        // --- Maintenance Module ---
        renderMaintenancePage: function (container) {
            container.innerHTML = `
                <div class="section-container">
                    <div class="section-header">
                        <div>
                            <h2>Bakım ve Kontrol Takvimi</h2>
                            <p class="text-muted">Periyodik bina bakımlarını (Asansör, Yangın Tüpü vb.) takip edin.</p>
                        </div>
                        <button class="btn btn-primary" onclick="app.handlers.openMaintenanceModal()">
                            <i class="fa-solid fa-plus"></i> Yeni Bakım Ekle
                        </button>
                    </div>
                </div>
                
                <div class="dashboard-grid" style="margin-bottom:20px;">
                     <!-- Alert Cards Will Go Here -->
                     ${this.getMaintenanceAlertsHTML()}
                </div>

                <div class="section-container">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th>Bakım Adı</th>
                                <th>Periyot</th>
                                <th>Son Yapılan</th>
                                <th>Sıradaki Tarih</th>
                                <th>Durum</th>
                                <th>İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.getMaintenanceRowsHTML()}
                        </tbody>
                    </table>
                </div>
                
                <!-- Maintenance Modal -->
                <div id="modal-maintenance" class="modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>Bakım Tanımla</h2>
                            <span class="close-modal" onclick="app.ui.closeModal('modal-maintenance')">&times;</span>
                        </div>
                        <form onsubmit="app.handlers.submitMaintenance(event)">
                            <input type="hidden" id="maint-id">
                            <div class="form-group">
                                <label>Bakım Adı (Örn: Asansör Mavi Etiket)</label>
                                <input type="text" id="maint-name" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Kaç Günde Bir?</label>
                                <input type="number" id="maint-freq" class="form-control" placeholder="30" required>
                            </div>
                            <div class="form-group">
                                <label>En Son Ne Zaman Yapıldı?</label>
                                <input type="date" id="maint-last" class="form-control" required>
                            </div>
                            <button type="submit" class="btn btn-primary full-width">Kaydet</button>
                        </form>
                    </div>
                </div>
            `;
        },

        getMaintenanceAlertsHTML: function () {
            let html = '';
            const today = new Date();
            const items = app.data.maintenance || [];

            items.forEach(m => {
                const nextDate = new Date(m.nextDate);
                const diffTime = nextDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 7) {
                    const color = diffDays < 0 ? 'var(--danger-color)' : 'var(--warning-color)';
                    const icon = diffDays < 0 ? 'fa-triangle-exclamation' : 'fa-clock';
                    const text = diffDays < 0 ? 'SÜRESİ GEÇTİ!' : `${diffDays} gün kaldı`;

                    html += `
                        <div class="stat-card" style="border-left: 4px solid ${color};">
                             <div class="icon-wrapper" style="color:${color}; background:rgba(0,0,0,0.05);">
                                <i class="fa-solid ${icon}"></i>
                            </div>
                            <div class="stat-info">
                                <h3 style="color:${color}">${m.name}</h3>
                                <p class="stat-value" style="font-size:1rem;">${text}</p>
                            </div>
                        </div>
                    `;
                }
            });
            return html;
        },

        getMaintenanceRowsHTML: function () {
            if (!app.data.maintenance || app.data.maintenance.length === 0) return '<tr><td colspan="6" class="text-center text-muted">Kayıtlı bakım yok.</td></tr>';

            return app.data.maintenance.map(m => {
                const nextDate = new Date(m.nextDate);
                const today = new Date();
                const diffTime = nextDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let statusBadge = '<span class="status-badge" style="background:#e8f5e9; color:#2e7d32;">Zamanı Var</span>';
                if (diffDays < 0) statusBadge = '<span class="status-badge" style="background:#ffebee; color:#c62828;">GECİKMİŞ</span>';
                else if (diffDays <= 7) statusBadge = '<span class="status-badge" style="background:#fff3e0; color:#ef6c00;">Yaklaşıyor</span>';

                return `
                    <tr>
                        <td>${m.name}</td>
                        <td>${m.frequency} günde bir</td>
                        <td>${m.lastDate}</td>
                        <td><strong>${m.nextDate}</strong></td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn-icon" onclick="app.handlers.completeMaintenance(${m.id})" title="Bugün Yapıldı Olarak İşaretle">
                                <i class="fa-solid fa-check-double" style="color:green;"></i>
                            </button>
                             <button class="btn-icon delete" onclick="app.handlers.deleteMaintenance(${m.id})" title="Sil">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        openMaintenanceModal: function () {
            document.getElementById('maint-id').value = '';
            document.getElementById('maint-name').value = '';
            document.getElementById('maint-freq').value = '';
            document.getElementById('maint-last').value = new Date().toISOString().split('T')[0];
            app.ui.openModal('modal-maintenance');
        },

        submitMaintenance: function (e) {
            e.preventDefault();
            const id = document.getElementById('maint-id').value;
            const name = document.getElementById('maint-name').value;
            const freq = parseInt(document.getElementById('maint-freq').value);
            const last = document.getElementById('maint-last').value;

            // Calculate Next Date
            const lastDate = new Date(last);
            lastDate.setDate(lastDate.getDate() + freq);
            const nextDate = lastDate.toISOString().split('T')[0];

            if (id) {
                // Edit
                const item = app.data.maintenance.find(x => x.id == id);
                if (item) {
                    item.name = name;
                    item.frequency = freq;
                    item.lastDate = last;
                    item.nextDate = nextDate;
                }
            } else {
                // New
                app.data.maintenance.push({
                    id: Date.now(),
                    name: name,
                    frequency: freq,
                    lastDate: last,
                    nextDate: nextDate
                });
            }

            app.saveData();
            app.ui.closeModal('modal-maintenance');
            // Re-render
            const container = document.getElementById('content-area');
            if (document.querySelector('.nav-item.active').dataset.page === 'maintenance') {
                this.renderMaintenancePage(container);
            }
        },

        completeMaintenance: function (id) {
            if (!confirm("Bakımın bugün yapıldığını onaylıyor musunuz?")) return;

            const item = app.data.maintenance.find(x => x.id == id);
            if (item) {
                item.lastDate = new Date().toISOString().split('T')[0];
                const lastDate = new Date(item.lastDate);
                lastDate.setDate(lastDate.getDate() + parseInt(item.frequency));
                item.nextDate = lastDate.toISOString().split('T')[0];

                app.saveData();
                const container = document.getElementById('content-area');
                if (document.querySelector('.nav-item.active').dataset.page === 'maintenance') {
                    this.renderMaintenancePage(container);
                }
            }
        },

        deleteMaintenance: function (id) {
            if (!confirm("Bu bakım kaydını silmek istediğinize emin misiniz?")) return;
            app.data.maintenance = app.data.maintenance.filter(x => x.id !== id);
            app.saveData();
            const container = document.getElementById('content-area');
            if (document.querySelector('.nav-item.active').dataset.page === 'maintenance') {
                this.renderMaintenancePage(container);
            }
        },

        // --- Decision Book Module ---
        renderDecisionsPage: function (container) {
            container.innerHTML = `
                <div class="section-container">
                    <div class="section-header">
                        <div>
                            <h2>Karar Defteri</h2>
                            <p class="text-muted">Bina yönetimi ile ilgili alınan kararları buradan takip edebilirsiniz.</p>
                        </div>
                        <button class="btn btn-primary" onclick="app.handlers.openDecisionModal()">
                            <i class="fa-solid fa-plus"></i> Yeni Karar Ekle
                        </button>
                    </div>
                </div>

                <div class="section-container">
                    <table class="premium-table">
                        <thead>
                            <tr>
                                <th>Tarih</th>
                                <th>Konu</th>
                                <th>Karar Detayı</th>
                                <th>Durum</th>
                                <th>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.getDecisionsRowsHTML()}
                        </tbody>
                    </table>
                </div>

                <!-- Decision Modal -->
                <div id="modal-decision" class="modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>Karar Ekle/Düzenle</h2>
                            <span class="close-modal" onclick="app.ui.closeModal('modal-decision')">&times;</span>
                        </div>
                        <form onsubmit="app.handlers.submitDecision(event)">
                            <input type="hidden" id="dec-id">
                            <div class="form-group">
                                <label>Tarih</label>
                                <input type="date" id="dec-date" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Konu</label>
                                <input type="text" id="dec-subject" class="form-control" placeholder="Örn: Dış Cephe Boyası" required>
                            </div>
                            <div class="form-group">
                                <label>Alınan Karar</label>
                                <textarea id="dec-detail" class="form-control" rows="4" required></textarea>
                            </div>
                            <div class="form-group">
                                <label>Durum</label>
                                <select id="dec-status" class="form-control">
                                    <option value="pending">Görüşülüyor</option>
                                    <option value="accepted">Kabul Edildi</option>
                                    <option value="rejected">Reddedildi</option>
                                </select>
                            </div>
                            <button type="submit" class="btn btn-primary full-width">Kaydet</button>
                        </form>
                    </div>
                </div>
            `;
        },

        getDecisionsRowsHTML: function () {
            if (!app.data.decisions || app.data.decisions.length === 0) return '<tr><td colspan="5" class="text-center text-muted">Henüz kayıtlı karar yok.</td></tr>';

            return app.data.decisions.sort((a, b) => new Date(b.date) - new Date(a.date)).map(d => {
                let statusBadge = '';
                switch (d.status) {
                    case 'accepted': statusBadge = '<span class="status-badge" style="background:#e8f5e9; color:#2e7d32;"><i class="fa-solid fa-check"></i> Kabul Edildi</span>'; break;
                    case 'rejected': statusBadge = '<span class="status-badge" style="background:#ffebee; color:#c62828;"><i class="fa-solid fa-xmark"></i> Reddedildi</span>'; break;
                    default: statusBadge = '<span class="status-badge" style="background:#fff3e0; color:#ef6c00;"><i class="fa-solid fa-hourglass-half"></i> Görüşülüyor</span>';
                }

                return `
                    <tr>
                         <td>${d.date}</td>
                         <td style="font-weight:600;">${d.subject}</td>
                         <td>${d.detail}</td>
                         <td>${statusBadge}</td>
                         <td>
                             <button class="btn-icon delete" onclick="app.handlers.deleteDecision(${d.id})" title="Sil">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                         </td>
                    </tr>
                `;
            }).join('');
        },

        openDecisionModal: function () {
            document.getElementById('dec-id').value = '';
            document.getElementById('dec-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('dec-subject').value = '';
            document.getElementById('dec-detail').value = '';
            document.getElementById('dec-status').value = 'accepted';
            app.ui.openModal('modal-decision');
        },

        submitDecision: function (e) {
            e.preventDefault();
            const id = document.getElementById('dec-id').value;
            const date = document.getElementById('dec-date').value;
            const subject = document.getElementById('dec-subject').value;
            const detail = document.getElementById('dec-detail').value;
            const status = document.getElementById('dec-status').value;

            if (id) {
                const item = app.data.decisions.find(x => x.id == id);
                if (item) {
                    item.date = date;
                    item.subject = subject;
                    item.detail = detail;
                    item.status = status;
                }
            } else {
                app.data.decisions.push({
                    id: Date.now(),
                    date: date,
                    subject: subject,
                    detail: detail,
                    status: status
                });
            }

            app.saveData();
            app.ui.closeModal('modal-decision');
            // Re-render
            const container = document.getElementById('content-area');
            if (document.querySelector('.nav-item.active').dataset.page === 'decisions') {
                this.renderDecisionsPage(container);
            }
        },

        deleteDecision: function (id) {
            if (!confirm("Bu kararı silmek istediğinize emin misiniz?")) return;
            app.data.decisions = app.data.decisions.filter(x => x.id !== id);
            app.saveData();
            const container = document.getElementById('content-area');
            if (document.querySelector('.nav-item.active').dataset.page === 'decisions') {
                this.renderDecisionsPage(container);
            }
        },

        exportData: function () {
            const dataStr = JSON.stringify(app.data, null, 2);
            // Backup should be clear JSON for transfer.
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

            const exportFileDefaultName = 'bina_yonetim_yedek_' + new Date().toISOString().slice(0, 10) + '.json';

            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        },

        backupToDrive: function () {
            // 1. Trigger Download first
            app.handlers.exportData();

            // 2. Open Google Drive in new tab
            setTimeout(() => {
                const driveUrl = "https://drive.google.com/drive/u/0/my-drive";
                if (confirm("Yedek dosyası indirildi.\n\nGoogle Drive açılsın mı? (Açılan sayfaya inen dosyayı sürükleyip bırakabilirsiniz.)")) {
                    window.open(driveUrl, '_blank');
                }
            }, 1000);
        },

        clearAllData: function () {
            if (confirm("DİKKAT! Tüm veriler silinecek ve sistem sıfırlanacak.\n\nBu işlem geri alınamaz.\nDevam etmek istiyor musunuz?")) {
                if (confirm("Gerçekten emin misiniz? Tüm gelir/gider kayıtları ve sakinler silinecek.")) {
                    localStorage.removeItem('residents');
                    localStorage.removeItem('transactions');
                    localStorage.removeItem('savedAnnouncements');
                    // Keep API key and model selection for convenience
                    // localStorage.removeItem('openai_api_key'); 
                    // localStorage.removeItem('gemini_model');

                    alert("Tüm veriler temizlendi. Sayfa yenileniyor.");
                    location.reload();
                }
            }
        },

        deleteTransaction: function (id, askConfirm = true) {
            const t = app.data.transactions.find(x => x.id === id);
            if (!t) return;

            if (askConfirm && !confirm("Bu işlemi silmek istediğinize emin misiniz?")) return;

            app.data.transactions = app.data.transactions.filter(x => x.id !== id);
            app.saveData();

            // Refresh views
            const activePage = document.querySelector('.nav-item.active').dataset.page;
            if (activePage === 'transactions') app.ui.renderPage('transactions');
            if (activePage === 'dashboard') app.renderDashboard();
            if (activePage === 'residents') app.ui.renderResidentsPage(document.getElementById('content-area'));

            // If detail modal is open, refresh it or close it
            const modal = document.getElementById('modal-resident-detail');
            if (modal && modal.style.display === 'flex') {
                // We need to re-render the detail view. 
                // Since showResidentDetail takes an ID, finding the resident ID from the deleted transaction 
                // is tricky if we already deleted it. 
                // Better to close it or just remove the row? 
                // Let's remove the row for better UX.
                const btn = document.querySelector(`button[onclick*="deleteTransaction(${id}"]`);
                if (btn) {
                    const row = btn.closest('tr');
                    if (row) row.remove();
                    // Recalculate totals? For now, user can close/open to refresh stats.
                }
            }
        },

        deleteAllTransactions: function () {
            if (confirm("DİKKAT! Sadece banka hareket ve ödeme kayıtları silinecek.\nDaire sahipleri ve diğer bilgiler KORUNACAK.\n\nDevam etmek istiyor musunuz?")) {
                app.data.transactions = [];
                // Clear temp as well just in case
                app.data.tempTransactions = null;
                app.saveData();
                alert("Tüm işlem kayıtları temizlendi.");
                location.reload();
            }
        },

        deleteSelectedTransactions: function () {
            const checkboxes = document.querySelectorAll('.trans-checkbox:checked');
            if (checkboxes.length === 0) {
                alert('Lütfen silinecek işlemleri seçin.');
                return;
            }

            if (!confirm(`${checkboxes.length} adet işlemi silmek istediğinize emin misiniz ? `)) return;

            const idsToDelete = Array.from(checkboxes).map(cb => cb.value); // ids are stored as value

            // Filter out deleted transactions
            app.data.transactions = app.data.transactions.filter(t => !idsToDelete.includes(String(t.id)));

            app.saveData();
            alert('Seçilen işlemler silindi.');
            app.ui.renderPage('transactions');
        },

        toggleAllTransactions: function (source) {
            const checkboxes = document.querySelectorAll('.trans-checkbox');
            checkboxes.forEach(cb => cb.checked = source.checked);
            app.handlers.updateDeleteButtonState();
        },

        updateDeleteButtonState: function () {
            const checkedCount = document.querySelectorAll('.trans-checkbox:checked').length;
            const btn = document.getElementById('btn-delete-selected');
            const countSpan = document.getElementById('selected-count');

            if (btn && countSpan) {
                countSpan.innerText = checkedCount;
                if (checkedCount > 0) {
                    btn.style.display = 'inline-flex'; // Show button
                    btn.classList.add('animate__animated', 'animate__fadeIn');
                } else {
                    btn.style.display = 'none'; // Hide button
                }
            }
        },


        saveApiKey: function () {
            const key = document.getElementById('api-key-input').value;
            const model = document.getElementById('gemini-model-select').value;

            if (key) {
                localStorage.setItem('openai_api_key', key);
                localStorage.setItem('gemini_model', model);

                alert('Ayarlar kaydedildi.');
                // Refresh current page
                const activeNav = document.querySelector('.nav-item.active');
                if (activeNav) {
                    app.ui.renderPage(activeNav.dataset.page);
                }
            }
        },

        testApiKey: async function () {
            const apiKey = document.getElementById('api-key-input').value.trim();
            const model = document.getElementById('gemini-model-select').value;

            if (!apiKey) {
                alert("Lütfen önce bir API anahtarı girin.");
                return;
            }

            try {
                // 1. Check Google Gemini Models if key starts with AIza
                if (apiKey.startsWith('AIza')) {
                    alert("Google sunucularına bağlanılıyor, lütfen bekleyin...");

                    // List Models Request
                    // This will tell us EXACTLY what models are allowed for this key
                    const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                    const listData = await listResponse.json();

                    if (!listResponse.ok) {
                        throw new Error("API Erişim Hatası: " + JSON.stringify(listData, null, 2));
                    }

                    // Filter for generating content models
                    const availableModels = listData.models
                        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
                        .map(m => m.name.replace('models/', ''))
                        .join('\n');

                    alert(`BAŞARILI! Anahtarınız GEÇERLİ.\n\nSizin için açık olan modeller şunlardır:\n${availableModels}\n\nLütfen listeden bunlardan birini seçin.`);
                    console.log("Available models:", listData.models);
                    return; // Stop here if just testing key validity
                }

                // OpenAI Test (Keep existing logic)
                else if (apiKey.startsWith('sk-')) {
                    const url = 'https://api.openai.com/v1/chat/completions';
                    const body = JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [{ role: "user", content: "Test" }]
                    });

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: body
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(JSON.stringify(data, null, 2));
                    alert("BAŞARILI! OpenAI bağlantısı çalışıyor.");
                } else {
                    alert("Tanımsız API Anahtarı formatı.");
                }

            } catch (error) {
                console.error(error);
                alert("HATA OLUŞTU:\n" + error.message);
            }
        },

        sendChatMessage: async function () {
            const input = document.getElementById('chat-input');
            const message = input.value;
            if (!message) return;

            const apiKey = localStorage.getItem('openai_api_key');

            if (!apiKey) {
                alert('Lütfen önce Ayarlar sayfasından API anahtarını girin.');
                return;
            }

            const history = document.getElementById('chat-history');

            // Add User Message
            history.innerHTML += `<div class="chat-bubble user">${message}</div>`;
            input.value = '';
            history.scrollTop = history.scrollHeight;

            // Show Thinking
            const loadingId = 'loading-' + Date.now();
            history.innerHTML += `<div id="${loadingId}" class="chat-bubble bot"><i class="fa-solid fa-ellipsis fa-fade"></i></div>`;
            history.scrollTop = history.scrollHeight;

            try {
                let url, body;
                if (apiKey.startsWith('AIza')) {
                    const model = localStorage.getItem('gemini_model') || 'gemini-1.5-flash';
                    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    body = JSON.stringify({
                        contents: [{
                            parts: [{ text: "You are a helpful building management assistant. Answer in Turkish. " + message }]
                        }]
                    });
                } else {
                    url = 'https://api.openai.com/v1/chat/completions';
                    body = JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [
                            { role: "system", content: "You are a helpful building management assistant. Answer in Turkish." },
                            { role: "user", content: message }
                        ]
                    });
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(apiKey.startsWith('AIza') ? {} : { 'Authorization': `Bearer ${apiKey}` })
                    },
                    body: body
                });

                const data = await response.json();
                if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

                let reply = '';
                if (apiKey.startsWith('AIza')) {
                    reply = data.candidates[0].content.parts[0].text;
                } else {
                    reply = data.choices[0].message.content;
                }

                document.getElementById(loadingId).remove();
                history.innerHTML += `<div class="chat-bubble bot">${reply}</div>`;
                history.scrollTop = history.scrollHeight;

            } catch (error) {
                document.getElementById(loadingId).remove();
                history.innerHTML += `<div class="chat-bubble bot text-danger">Bağlantı hatası: ${error.message}</div>`;
            }
            history.scrollTop = history.scrollHeight;
        },

        runBulkAccrual: function () {
            const amount = prompt("Her daireye yansıtılacak aidat tutarını girin:", app.data.settings.monthlyDues);
            const desc = prompt("Açıklama girin (Örn: Ocak 2024 Aidat Tahakkuku):", "Aidat Borçlandırması");

            if (amount && desc) {
                if (confirm(`${app.data.residents.length} daireye ${amount} TL borç yansıtılacak. Onaylıyor musunuz?`)) {
                    const numAmount = parseFloat(amount);
                    const now = new Date().toISOString().slice(0, 10);

                    app.data.residents.forEach(r => {
                        // Create debt transaction
                        app.data.transactions.push({
                            id: Date.now() + Math.random(),
                            type: 'expense', // Using expense type for logic, but for resident it's debt. 
                            // WAIT: Our system logic currently is: Income = Balance Increase (Payment). 
                            // We need a 'debt' type effectively. 
                            // If I use 'expense' type in global transactions, it reduces GLOBAL box balance. 
                            // But for Resident, it should reduce THEIR balance.
                            // Let's introduce a special type 'debt' or just handle it here.

                            isDebt: true, // Marker
                            residentId: r.id,
                            amount: numAmount,
                            description: desc,
                            date: now
                        });

                        r.balance = (r.balance || 0) - numAmount;
                    });

                    app.saveData();
                    alert("Toplu borçlandırma tamamlandı.");
                    app.ui.renderPage('reports');
                }
            }
        },

        importBackup: function (input) {
            const file = input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const json = JSON.parse(e.target.result);

                    // Basic validation
                    if (!json.residents || !json.transactions) {
                        throw new Error("Geçersiz yedek dosyası formatı.");
                    }

                    if (confirm("Mevcut veriler silinecek ve yedekten geri yüklenecek. Onaylıyor musunuz?")) {
                        app.data = json;
                        app.saveData();
                        alert("Yedek başarıyla yüklendi. Sayfa yenileniyor.");
                        location.reload();
                    }
                } catch (err) {
                    alert("Hata: " + err.message);
                }
            };
            reader.readAsText(file);
        },

        recalculateBalances: function () {
            if (confirm("Tüm veri bütünlüğü kontrol edilecek ve bakiyeler yeniden hesaplanacak.")) {
                app.cleanupDuplicates();
                alert("İşlem tamamlandı. Sayfa yenileniyor.");
                location.reload();
            }
        }
    },

    renderDashboard: function () {
        const dashboardHTML = `
            <div class="dashboard-grid">
                <div class="stat-card">
                    <div class="icon-wrapper income">
                        <i class="fa-solid fa-wallet"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Kasa Durumu</h3>
                        <p class="stat-value" id="total-balance">Loading...</p>
                    </div>
                </div>
                <!-- More cards can be re-injected here if needed, or just update values -->
                <div class="stat-card">
                    <div class="icon-wrapper success">
                        <i class="fa-solid fa-arrow-trend-up"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Toplam Tahsilat</h3>
                        <p class="stat-value" id="total-income">Loading...</p>
                    </div>
                </div>
                 <div class="stat-card">
                    <div class="icon-wrapper expense">
                        <i class="fa-solid fa-arrow-trend-down"></i>
                    </div>
                    <div class="stat-info">
                        <h3>Toplam Gider</h3>
                        <p class="stat-value" id="total-expense">Loading...</p>
                    </div>
                </div>
            </div>
            
            <!-- Charts Section -->
            <div class="charts-row" style="display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap;">
                <div class="chart-card" style="flex: 1; min-width: 300px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <h3 style="margin-bottom: 15px; font-size: 1rem; color: #666;">Gelir / Gider Dağılımı</h3>
                    <div style="height: 250px; position: relative;">
                        <canvas id="balanceChart"></canvas>
                    </div>
                </div>
                <div class="chart-card" style="flex: 2; min-width: 300px; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <h3 style="margin-bottom: 15px; font-size: 1rem; color: #666;">Son 6 Ay Mali Durum</h3>
                    <div style="height: 250px; position: relative;">
                        <canvas id="trendChart"></canvas>
                    </div>
                </div>
            </div>

             <div class="section-container">
                    <div class="section-header">
                        <h3>Son Hareketler</h3>
                        <a href="#" onclick="app.router.navigate('transactions')">Tümünü Gör</a>
                    </div>
                    <div class="table-responsive">
                        <table class="premium-table">
                            <thead>
                                <tr>
                                    <th>Tarih</th>
                                    <th>Açıklama</th>
                                    <th>Tutar</th>
                                </tr>
                            </thead>
                            <tbody id="recent-transactions-body">
                            </tbody>
                        </table>
                    </div>
                </div>
        `;

        // Only inject if in dashboard mode or first load
        const contentArea = document.getElementById('content-area');
        if (!document.querySelector('.nav-item.active') || document.querySelector('.nav-item.active').dataset.page === 'dashboard') {
            contentArea.innerHTML = dashboardHTML;
        }

        // Calculate Totals
        let totalIncome = 0;
        let totalExpense = 0;

        app.data.transactions.forEach(t => {
            if (t.type === 'income') totalIncome += t.amount;
            else if (t.type === 'expense') totalExpense += t.amount;
        });

        const balance = totalIncome - totalExpense;

        // Update DOM Elements safely
        const balanceEl = document.getElementById('total-balance');
        if (balanceEl) balanceEl.innerText = app.formatCurrency(balance);

        const incomeEl = document.getElementById('total-income');
        if (incomeEl) incomeEl.innerText = app.formatCurrency(totalIncome);

        const expenseEl = document.getElementById('total-expense');
        if (expenseEl) expenseEl.innerText = app.formatCurrency(totalExpense);

        // Update Recent Transactions
        const tbody = document.getElementById('recent-transactions-body');
        if (tbody) {
            tbody.innerHTML = '';
            const recent = [...app.data.transactions]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 5);
            if (recent.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="empty-state">İşlem yok</td></tr>';
            } else {
                recent.forEach(t => {
                    const colorClass = t.type === 'income' ? 'text-success' : 'text-danger';
                    const sign = t.type === 'income' ? '+' : '-';
                    tbody.innerHTML += `
                        <tr>
                            <td>${t.date}</td>
                            <td>${t.description}</td>
                            <td class="${colorClass}"><strong>${sign}${app.formatCurrency(t.amount)}</strong></td>
                        </tr>
                    `;
                });
            }
        }

        // Render Charts
        setTimeout(() => { if (this.renderCharts) this.renderCharts(); }, 100);
    },

    renderCharts: function () {
        if (typeof Chart === 'undefined') return;

        // Balance Chart (Pie)
        const ctxBalance = document.getElementById('balanceChart');
        if (ctxBalance) {
            const income = parseFloat(document.getElementById('total-income').innerText.replace(/[^\d.-]/g, '')) || 0;
            const expense = parseFloat(document.getElementById('total-expense').innerText.replace(/[^\d.-]/g, '')) || 0;

            if (window.myBalanceChart) window.myBalanceChart.destroy();

            window.myBalanceChart = new Chart(ctxBalance, {
                type: 'doughnut',
                data: {
                    labels: ['Gelir', 'Gider'],
                    datasets: [{
                        data: [income, expense],
                        backgroundColor: ['#4caf50', '#f44336'],
                        borderWidth: 1
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // Trend Chart (Bar)
        const ctxTrend = document.getElementById('trendChart');
        if (ctxTrend) {
            if (window.myTrendChart) window.myTrendChart.destroy();

            // Calculate 6 Months Data
            const months = [];
            const incomes = [];
            const expenses = [];

            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const key = d.toISOString().slice(0, 7); // YYYY-MM
                const monthName = d.toLocaleString('tr-TR', { month: 'long' });

                months.push(monthName);

                // Sum
                const inc = app.data.transactions.filter(t => t.date.startsWith(key) && t.type === 'income').reduce((a, b) => a + b.amount, 0);
                const exp = app.data.transactions.filter(t => t.date.startsWith(key) && t.type === 'expense').reduce((a, b) => a + b.amount, 0);
                incomes.push(inc);
                expenses.push(exp);
            }

            window.myTrendChart = new Chart(ctxTrend, {
                type: 'bar',
                data: {
                    labels: months,
                    datasets: [
                        { label: 'Gelir', data: incomes, backgroundColor: '#4caf50' },
                        { label: 'Gider', data: expenses, backgroundColor: '#f44336' }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
            });
        }
    }
};

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
