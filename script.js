// Service Worker & Supabase Init
if ('serviceWorker' in navigator && !window.location.hostname.includes('stackblitz')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js')
        .then(registration => console.log('ServiceWorker registered:', registration.scope))
        .catch(err => console.log('ServiceWorker registration failed:', err))
    );
}

const supabase = window.supabase.createClient(
    'https://ieriphdzlbuzqqwrymwn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcmlwaGR6bGJ1enFxd3J5bXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMDU1MTgsImV4cCI6MjA3Nzg4MTUxOH0.bvbs6joSxf1u9U8SlaAYmjve-N6ArNYcNMtnG6-N_HU'
);

// Global State
const state = {
    products: [], cart: [], sales: [], deletedSales: [], users: [], currentUser: null,
    expenses: [], purchases: [], stockAlerts: [], profitData: [],
    currentPage: "pos", isOnline: navigator.onLine, syncQueue: [],
    connectionRetryCount: 0, MAX_RETRY_ATTEMPTS: 3, RETRY_DELAY: 5000,
    settings: {
        storeName: "Pa Gerrys Mart", storeAddress: "Alatishe, Ibeju Lekki, Lagos State, Nigeria",
        storePhone: "+2347037850121", lowStockThreshold: 10, expiryWarningDays: 90
    },
    expenseCategories: ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Marketing', 'Maintenance', 'Other'],
    STORAGE_KEYS: {
        PRODUCTS: 'pagerrysmart_products', SALES: 'pagerrysmart_sales', DELETED_SALES: 'pagerrysmart_deleted_sales',
        USERS: 'pagerrysmart_users', SETTINGS: 'pagerrysmart_settings', CURRENT_USER: 'pagerrysmart_current_user',
        EXPENSES: 'pagerrysmart_expenses', PURCHASES: 'pagerrysmart_purchases',
        STOCK_ALERTS: 'pagerrysmart_stock_alerts', PROFIT_DATA: 'pagerrysmart_profit_data'
    }
};

// DOM Elements Cache
const DOM = {
    loginPage: document.getElementById('login-page'), appContainer: document.getElementById('app-container'),
    loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'),
    navLinks: document.querySelectorAll('.nav-link'), pageContents: document.querySelectorAll('.page-content'),
    pageTitle: document.getElementById('page-title'), currentUserEl: document.getElementById('current-user'),
    userRoleEl: document.getElementById('user-role'), logoutBtn: document.getElementById('logout-btn'),
    productsGrid: document.getElementById('products-grid'), cartItems: document.getElementById('cart-items'),
    totalEl: document.getElementById('total'), inventoryTableBody: document.getElementById('inventory-table-body'),
    salesTableBody: document.getElementById('sales-table-body'), deletedSalesTableBody: document.getElementById('deleted-sales-table-body'),
    dailySalesTableBody: document.getElementById('daily-sales-table-body'), productModal: document.getElementById('product-modal'),
    receiptModal: document.getElementById('receipt-modal'), notification: document.getElementById('notification'),
    notificationMessage: document.getElementById('notification-message'), mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    sidebar: document.getElementById('sidebar')
};

// Utility Functions
const $ = (id) => document.getElementById(id);
const show = (el) => el.style.display = 'flex';
const hide = (el) => el.style.display = 'none';
const formatCurrency = (amount) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 }).format(amount);
const formatDate = (date, short = false) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return short ? d.toLocaleDateString() : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
};
const generateId = () => 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
const showNotification = (message, type = 'success') => {
    DOM.notificationMessage.textContent = message;
    DOM.notification.className = `notification ${type} show`;
    DOM.notification.querySelector('i').className = type === 'success' ? 'fas fa-check-circle' : 
                                                type === 'error' ? 'fas fa-exclamation-circle' : 
                                                type === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle';
    setTimeout(() => DOM.notification.classList.remove('show'), 3000);
};

// Auth Module
const AuthModule = {
    async signUp(email, password, name, role = 'cashier') {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !state.currentUser || state.currentUser.role !== 'admin') {
                showNotification("Only admins can create new users.", "error");
                return { success: false };
            }

            const adminPassword = prompt("Please confirm your admin password to continue:");
            if (!adminPassword) return { success: false };

            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: state.currentUser.email,
                password: adminPassword
            });

            if (signInError) {
                showNotification("Incorrect admin password.", "error");
                return { success: false };
            }

            const { data, error } = await supabase.auth.admin.createUser({ email, password, user_metadata: { name, role } });
            if (error) throw error;

            await supabase.from('users').insert({
                id: data.user.id, name, email, role,
                created_at: new Date().toISOString(),
                last_login: new Date().toISOString(),
                created_by: user.id
            }).catch(console.warn);

            showNotification(`User "${name}" (${role}) created successfully!`, "success");
            return { success: true };
        } catch (error) {
            console.error("Signup error:", error);
            showNotification("Error creating user: " + error.message, "error");
            return { success: false, error: error.message };
        }
    },

    async signIn(email, password) {
        const loginSubmitBtn = $('login-submit-btn');
        loginSubmitBtn.classList.add('loading');
        loginSubmitBtn.disabled = true;
        
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            const fallbackUser = {
                id: data.user.id,
                name: data.user.user_metadata && data.user.user_metadata.name || data.user.email && data.user.email.split('@')[0] || 'User',
                email: data.user.email,
                role: data.user.user_metadata && data.user.user_metadata.role || 'cashier',
                created_at: data.user.created_at,
                last_login: new Date().toISOString()
            };

            const { data: userData, error: userError } = await supabase
                .from('users').select('*').eq('id', data.user.id).single();

            state.currentUser = !userError && userData ? userData : fallbackUser;
            
            if (!userError && userData) {
                await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', data.user.id)
                    .catch(console.warn);
            } else if (userError) {
                await supabase.from('users').insert(fallbackUser).select().single()
                    .then(({ data }) => { if (data) state.currentUser = data; })
                    .catch(console.warn);
            }
            
            localStorage.setItem(state.STORAGE_KEYS.CURRENT_USER, JSON.stringify(state.currentUser));
            showApp();
            showNotification('Login successful!', 'success');
            return { success: true };
        } catch (error) {
            console.error('Signin error:', error);
            showNotification(error.message || 'Login failed', 'error');
            return { success: false, error: error.message };
        } finally {
            loginSubmitBtn.classList.remove('loading');
            loginSubmitBtn.disabled = false;
        }
    },
    
    async signOut() {
        try {
            await supabase.auth.signOut();
            localStorage.removeItem(state.STORAGE_KEYS.CURRENT_USER);
            state.currentUser = null;
            showLogin();
            showNotification('Logged out successfully', 'info');
        } catch (error) {
            console.error('Signout error:', error);
            showNotification(error.message, 'error');
        }
    },
    
    isAdmin: () => state.currentUser && state.currentUser.role === 'admin',
    
    onAuthStateChanged(callback) {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                this.handleExistingSession(session, callback);
            } else {
                supabase.auth.onAuthStateChange(async (event, session) => {
                    if (session) {
                        this.handleExistingSession(session, callback);
                    } else {
                        state.currentUser = null;
                        localStorage.removeItem(state.STORAGE_KEYS.CURRENT_USER);
                        callback(null);
                    }
                });
                callback(null);
            }
        });
    },
    
    async handleExistingSession(session, callback) {
        const fallbackUser = {
            id: session.user.id,
            name: session.user.user_metadata && session.user.user_metadata.name || session.user.email && session.user.email.split('@')[0] || 'User',
            email: session.user.email,
            role: session.user.user_metadata && session.user.user_metadata.role || 'cashier',
            created_at: session.user.created_at,
            last_login: new Date().toISOString()
        };
        
        try {
            const { data: userData, error } = await supabase
                .from('users').select('*').eq('id', session.user.id).single();
            
            if (!error && userData) {
                state.currentUser = userData;
            } else {
                state.currentUser = fallbackUser;
                await supabase.from('users').insert(fallbackUser).select().single()
                    .then(({ data }) => { if (data) state.currentUser = data; })
                    .catch(console.warn);
            }
        } catch (fetchError) {
            if (fetchError.message && fetchError.message.includes('infinite recursion')) {
                showNotification('Database policy issue detected. Using limited functionality.', 'warning');
            }
            state.currentUser = fallbackUser;
        }
        
        localStorage.setItem(state.STORAGE_KEYS.CURRENT_USER, JSON.stringify(state.currentUser));
        callback(state.currentUser);
    }
};

// Data Module
const DataModule = {
    async fetchProducts() {
        try {
            if (state.isOnline) {
                let query = supabase.from('products').select('*');
                try { query = query.eq('deleted', false); } catch (e) { console.warn('deleted column might not exist'); }
                
                const { data, error } = await query;
                if (error) {
                    if (error.code === '42P17' || error.message.includes('infinite recursion')) {
                        showNotification('Database policy issue for products. Using local cache.', 'warning');
                    } else if (error.code === '42501' || error.message.includes('policy')) {
                        showNotification('Permission denied for products. Using local cache.', 'warning');
                    } else {
                        throw error;
                    }
                } else if (data) {
                    const normalizedProducts = data.map(product => {
                        if (product.expirydate && !product.expiryDate) product.expiryDate = product.expirydate;
                        return product;
                    });
                    // FIX: Added this missing function call
                    state.products = this.mergeProductData(normalizedProducts.filter(p => !p.deleted));
                    saveToLocalStorage();
                    return state.products;
                }
            }
            return state.products;
        } catch (error) {
            console.error('Error in fetchProducts:', error);
            if (error.code === '42501' || error.message.includes('policy')) {
                showNotification('Permission denied for products. Using local cache.', 'warning');
            } else if (error.code === '42P17' || error.message.includes('infinite recursion')) {
                showNotification('Database policy issue detected. Using local cache.', 'warning');
            } else {
                showNotification('Error fetching products: ' + error.message, 'error');
            }
            return state.products;
        }
    },

    // FIX: Added this missing function
    mergeProductData(serverProducts) {
        const serverProductsMap = {};
        serverProducts.forEach(product => {
            serverProductsMap[product.id] = product;
        });
        
        const localProductsMap = {};
        state.products.forEach(product => {
            if (product && product.id) {
                localProductsMap[product.id] = product;
            }
        });
        
        const mergedProducts = [];
        
        serverProducts.forEach(serverProduct => {
            const localProduct = localProductsMap[serverProduct.id];
            
            if (localProduct) {
                const serverDate = new Date(serverProduct.updated_at || serverProduct.created_at || 0);
                const localDate = new Date(localProduct.updated_at || localProduct.created_at || 0);
                
                mergedProducts.push(localDate > serverDate ? localProduct : serverProduct);
            } else {
                mergedProducts.push(serverProduct);
            }
        });
        
        state.products.forEach(localProduct => {
            if (localProduct && localProduct.id && !serverProductsMap[localProduct.id]) {
                mergedProducts.push(localProduct);
            }
        });
        
        return mergedProducts;
    },

    async fetchSales() {
        try {
            if (state.isOnline) {
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), 15000)
                );
                
                const fetchPromise = supabase
                    .from('sales')
                    .select('*')
                    .order('created_at', { ascending: false });
                
                const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
                
                if (error) {
                    console.error('Supabase fetch error:', error);
                    if (error.code === '42P17' || error.message.includes('infinite recursion')) {
                        showNotification('Database policy issue for sales. Using local cache.', 'warning');
                    } else if (error.code === '42501' || error.message.includes('policy')) {
                        showNotification('Permission denied for sales. Using local cache.', 'warning');
                    } else {
                        throw error;
                    }
                } else if (data && Array.isArray(data)) {
                    const validatedSales = data.map(sale => {
                        if (!sale.receiptNumber && sale.receiptnumber) {
                            sale.receiptNumber = sale.receiptnumber;
                        } else if (!sale.receiptNumber && !sale.receiptnumber) {
                            sale.receiptNumber = `UNKNOWN_${Date.now()}`;
                        }
                        
                        if (!sale.items) sale.items = [];
                        if (typeof sale.total !== 'number') {
                            sale.total = parseFloat(sale.total) || 0;
                        }
                        if (!sale.created_at) {
                            sale.created_at = new Date().toISOString();
                        }
                        return sale;
                    });
                    
                    state.sales = this.mergeSalesData(validatedSales);
                    saveToLocalStorage();
                    return state.sales;
                }
            }
            return state.sales;
        } catch (error) {
            console.error('Error in fetchSales:', error);
            if (error.message === 'Request timeout') {
                showNotification('Connection timeout. Using local cache.', 'warning');
            } else if (error.code === '42501' || error.message.includes('policy')) {
                showNotification('Permission denied for sales. Using local cache.', 'warning');
            } else if (error.code === '42P17' || error.message.includes('infinite recursion')) {
                showNotification('Database policy issue detected. Using local cache.', 'warning');
            } else {
                showNotification('Error fetching sales: ' + error.message, 'error');
            }
            return state.sales;
        }
    },
    
    mergeSalesData(serverSales) {
        const serverSalesMap = {};
        serverSales.forEach(sale => {
            serverSalesMap[sale.receiptNumber] = sale;
        });
        
        const localSalesMap = {};
        state.sales.forEach(sale => {
            if (sale && sale.receiptNumber) {
                localSalesMap[sale.receiptNumber] = sale;
            }
        });
        
        const mergedSales = [];
        
        serverSales.forEach(serverSale => {
            const localSale = localSalesMap[serverSale.receiptNumber];
            
            if (localSale) {
                const serverDate = new Date(serverSale.updated_at || serverSale.created_at || 0);
                const localDate = new Date(localSale.updated_at || localSale.created_at || 0);
                
                mergedSales.push(localDate > serverDate ? localSale : serverSale);
            } else {
                mergedSales.push(serverSale);
            }
        });
        
        state.sales.forEach(localSale => {
            if (localSale && localSale.receiptNumber && !serverSalesMap[localSale.receiptNumber]) {
                mergedSales.push(localSale);
            }
        });
        
        mergedSales.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
            const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
            return dateB - dateA;
        });
        
        return mergedSales;
    },
    
    // ... other DataModule methods would be similarly refactored
    async saveProduct(product) {
        const productModalLoading = $('product-modal-loading');
        const saveProductBtn = $('save-product-btn');
        
        if (productModalLoading) show(productModalLoading);
        if (saveProductBtn) saveProductBtn.disabled = true;
        
        try {
            if (!product.name || !product.category || !product.price || !product.stock || !product.expiryDate) {
                throw new Error('Please fill in all required fields');
            }
            
            if (isNaN(product.price) || product.price <= 0) {
                throw new Error('Please enter a valid price');
            }
            
            if (isNaN(product.stock) || product.stock < 0) {
                throw new Error('Please enter a valid stock quantity');
            }
            
            const productToSave = {
                name: product.name, category: product.category,
                price: parseFloat(product.price), stock: parseInt(product.stock),
                expirydate: product.expiryDate, barcode: product.barcode || null
            };
            
            let result;
            
            // FIX: Convert product.id to string before using .startsWith()
            if (product.id && !String(product.id).startsWith('temp_')) {
                const { data, error } = await supabase
                    .from('products').update(productToSave).eq('id', product.id).select();
                
                if (error) throw error;
                result = { success: true, product: data[0] || product };
            } else {
                const { data, error } = await supabase.from('products').insert(productToSave).select();
                if (error) throw error;
                
                if (data && data.length > 0) {
                    product.id = data[0].id;
                    result = { success: true, product: data[0] };
                } else {
                    result = { success: true, product };
                }
            }
            
            const index = state.products.findIndex(p => p.id === product.id);
            if (index >= 0) state.products[index] = product;
            else state.products.push(product);
            
            saveToLocalStorage();
            return result;
            
        } catch (error) {
            console.error('Error saving product:', error);
            
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                showNotification('Network error. Product saved locally only.', 'warning');
                
                if (product.id && !String(product.id).startsWith('temp_')) {
                    const index = state.products.findIndex(p => p.id === product.id);
                    if (index >= 0) state.products[index] = product;
                } else {
                    product.id = generateId();
                    state.products.push(product);
                }
                saveToLocalStorage();
                
                addToSyncQueue({ type: 'saveProduct', data: product });
                return { success: true, product };
            } else {
                showNotification('Error saving product: ' + error.message, 'error');
                return { success: false, error: error.message };
            }
        } finally {
            if (productModalLoading) hide(productModalLoading);
            if (saveProductBtn) saveProductBtn.disabled = false;
        }
    }
    // ... other DataModule methods
};

// Local Storage Functions
function saveToLocalStorage() {
    try {
        Object.entries(state.STORAGE_KEYS).forEach(([key, storageKey]) => {
            if (key === 'CURRENT_USER' && state.currentUser) {
                localStorage.setItem(storageKey, JSON.stringify(state.currentUser));
            } else if (state[key]) {
                localStorage.setItem(storageKey, JSON.stringify(state[key]));
            }
        });
    } catch (e) {
        console.error('Error saving data to localStorage:', e);
        showNotification('Error saving data locally. Some changes may be lost.', 'error');
    }
}

function loadFromLocalStorage() {
    try {
        Object.entries(state.STORAGE_KEYS).forEach(([key, storageKey]) => {
            const data = localStorage.getItem(storageKey);
            if (data) {
                try {
                    state[key] = JSON.parse(data);
                } catch (parseError) {
                    console.error(`Error parsing ${key} from localStorage:`, parseError);
                    if (Array.isArray(state[key])) state[key] = [];
                }
            }
        });
    } catch (e) {
        console.error('Error loading data from localStorage:', e);
        state.products = []; state.sales = []; state.deletedSales = [];
        state.users = []; state.currentUser = null;
        state.expenses = []; state.purchases = [];
        state.stockAlerts = []; state.profitData = [];
    }
}

// Sync Queue Management
function addToSyncQueue(operation) {
    if (!operation.id) {
        operation.id = 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    operation.timestamp = new Date().toISOString();
    
    if (operation.type === 'saveSale') {
        const receiptNumber = operation.data.receiptNumber;
        const existingIndex = state.syncQueue.findIndex(op => 
            op.type === 'saveSale' && 
            op.data.receiptNumber === receiptNumber
        );
        
        if (existingIndex !== -1) {
            state.syncQueue[existingIndex] = operation;
        } else {
            state.syncQueue.push(operation);
        }
    } else {
        const existingIndex = state.syncQueue.findIndex(op => 
            op.type === operation.type && 
            op.data.id === operation.data.id
        );
        
        if (existingIndex !== -1) {
            state.syncQueue[existingIndex] = operation;
        } else {
            state.syncQueue.push(operation);
        }
    }
    
    localStorage.setItem('syncQueue', JSON.stringify(state.syncQueue));
    
    if (state.isOnline) {
        processSyncQueue();
    } else {
        showNotification('Offline: Operation saved locally and will sync automatically.', 'info');
    }
}

async function processSyncQueue() {
    if (state.syncQueue.length === 0) return;
    
    const syncStatus = $('sync-status');
    const syncStatusText = $('sync-status-text');
    
    if (syncStatus) {
        syncStatus.classList.add('show', 'syncing');
        syncStatusText.textContent = `Syncing ${state.syncQueue.length} operations...`;
    }
    
    state.syncQueue.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    for (let i = 0; i < state.syncQueue.length; i++) {
        const operation = state.syncQueue[i];
        
        if (operation.synced) continue;
        
        try {
            let success = false;
            
            if (operation.type === 'saveSale') {
                success = await syncSale(operation);
            } else if (operation.type === 'saveProduct') {
                success = await syncProduct(operation);
            }
            
            if (success) {
                operation.synced = true;
                operation.syncedAt = new Date().toISOString();
            }
        } catch (error) {
            console.error(`Error syncing operation:`, operation.type, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    localStorage.setItem('syncQueue', JSON.stringify(state.syncQueue));
    
    const originalLength = state.syncQueue.length;
    state.syncQueue = state.syncQueue.filter(op => !op.synced);
    
    if (state.syncQueue.length < originalLength) {
        localStorage.setItem('syncQueue', JSON.stringify(state.syncQueue));
    }
    
    if (syncStatus && syncStatusText) {
        if (state.syncQueue.length === 0) {
            syncStatus.classList.remove('syncing');
            syncStatus.classList.add('show');
            syncStatusText.textContent = 'All data synced';
            setTimeout(() => syncStatus.classList.remove('show'), 3000);
            await refreshAllData();
        } else {
            syncStatus.classList.remove('syncing');
            syncStatus.classList.add('error');
            syncStatusText.textContent = `${state.syncQueue.length} operations pending`;
            setTimeout(() => syncStatus.classList.remove('show', 'error'), 3000);
        }
    }
}

async function syncSale(operation) {
    try {
        let validCashierId = operation.data.cashierId || '00000000-0000-0000-0000-000000000000';
        
        if (!validCashierId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
            validCashierId = '00000000-0000-0000-0000-000000000000';
        }
        
        operation.data.cashierId = validCashierId;
        
        const { data: existingSales, error: fetchError } = await supabase
            .from('sales')
            .select('*')
            .eq('receiptnumber', operation.data.receiptNumber);
        
        if (fetchError) throw fetchError;
        
        if (!existingSales || existingSales.length === 0) {
            const saleToSave = {
                receiptnumber: operation.data.receiptNumber,
                cashierid: validCashierId,
                items: operation.data.items,
                total: operation.data.total,
                created_at: operation.data.created_at,
                cashier: operation.data.cashier
            };
            
            const { data, error } = await supabase
                .from('sales')
                .insert(saleToSave)
                .select();
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                const localSaleIndex = state.sales.findIndex(s => s.receiptNumber === operation.data.receiptNumber);
                if (localSaleIndex !== -1) {
                    state.sales[localSaleIndex].id = data[0].id;
                    state.sales[localSaleIndex].cashierId = validCashierId;
                    saveToLocalStorage();
                }
                return true;
            }
        } else {
            if (existingSales.length > 0) {
                const localSaleIndex = state.sales.findIndex(s => s.receiptNumber === operation.data.receiptNumber);
                if (localSaleIndex !== -1) {
                    state.sales[localSaleIndex].id = existingSales[0].id;
                    state.sales[localSaleIndex].cashierId = validCashierId;
                    saveToLocalStorage();
                }
            }
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error syncing sale:', error);
        return false;
    }
}

async function syncProduct(operation) {
    try {
        if (operation.data.stock !== undefined && !operation.data.name) {
            const { error } = await supabase
                .from('products')
                .update({ stock: operation.data.stock })
                .eq('id', operation.data.id);
            
            if (error) throw error;
        } else {
            if (operation.data.id && !String(operation.data.id).startsWith('temp_')) {
                const productToSave = {
                    name: operation.data.name,
                    category: operation.data.category,
                    price: operation.data.price,
                    stock: operation.data.stock,
                    expirydate: operation.data.expiryDate,
                    barcode: operation.data.barcode
                };
                
                const { data, error } = await supabase
                    .from('products')
                    .insert(productToSave)
                    .select();
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    const localProductIndex = state.products.findIndex(p => p.id === operation.data.id);
                    if (localProductIndex !== -1) {
                        state.products[localProductIndex].id = data[0].id;
                        saveToLocalStorage();
                    }
                }
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error syncing product:', error);
        return false;
    }
}

// Connection Management
function checkSupabaseConnection() {
    if (!state.isOnline) {
        updateConnectionStatus('offline', 'Offline');
        return;
    }
    
    updateConnectionStatus('checking', 'Checking connection...');
    
    supabase.from('products').select('count').limit(1)
        .then(() => {
            state.connectionRetryCount = 0;
            updateConnectionStatus('online', 'Connected');
            if (state.syncQueue.length > 0) processSyncQueue();
        })
        .catch(error => {
            updateConnectionStatus('offline', 'Connection failed');
            
            if (error.code === '42P17' || error.message.includes('infinite recursion')) {
                showNotification('Database policy issue detected. Some features may be limited.', 'warning');
                return;
            }
            
            if (state.connectionRetryCount < state.MAX_RETRY_ATTEMPTS) {
                state.connectionRetryCount++;
                setTimeout(checkSupabaseConnection, state.RETRY_DELAY);
            } else {
                showNotification('Connection to database failed. Some features may be limited.', 'warning');
            }
        });
}

function updateConnectionStatus(status, message) {
    const statusEl = $('connection-status');
    const textEl = $('connection-text');
    
    if (statusEl && textEl) {
        statusEl.className = 'connection-status ' + status;
        textEl.textContent = message;
    }
}

// Realtime Listeners
function setupRealtimeListeners() {
    if (state.isOnline) {
        supabase
            .channel('products-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                DataModule.fetchProducts().then(updatedProducts => {
                    state.products = updatedProducts;
                    saveToLocalStorage();
                    loadProducts();
                    checkAndGenerateAlerts();
                });
            })
            .subscribe();
        
        supabase
            .channel('sales-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
                DataModule.fetchSales().then(updatedSales => {
                    state.sales = updatedSales;
                    saveToLocalStorage();
                    loadSales();
                });
            })
            .subscribe();
    }
}

// Stock Alert System
function checkAndGenerateAlerts() {
    const alerts = {
        expired: [], expiringSoon: [], lowStock: [], outOfStock: []
    };
    
    const today = new Date();
    
    state.products.forEach(product => {
        if (product.deleted) return;
        
        const expiryDate = new Date(product.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
            alerts.expired.push({
                id: product.id, name: product.name, expiryDate: product.expiryDate,
                daysExpired: Math.abs(daysUntilExpiry), severity: 'critical',
                message: `CRITICAL: ${product.name} expired ${Math.abs(daysUntilExpiry)} days ago`
            });
        } else if (daysUntilExpiry <= state.settings.expiryWarningDays) {
            alerts.expiringSoon.push({
                id: product.id, name: product.name, expiryDate: product.expiryDate,
                daysUntilExpiry: daysUntilExpiry,
                severity: daysUntilExpiry <= 7 ? 'high' : 'medium',
                message: `${daysUntilExpiry <= 7 ? 'URGENT' : 'WARNING'}: ${product.name} expires in ${daysUntilExpiry} days`
            });
        }
        
        if (product.stock <= 0) {
            alerts.outOfStock.push({
                id: product.id, name: product.name, currentStock: product.stock,
                severity: 'critical', message: `CRITICAL: ${product.name} is out of stock`
            });
        } else if (product.stock <= state.settings.lowStockThreshold) {
            alerts.lowStock.push({
                id: product.id, name: product.name, currentStock: product.stock,
                threshold: state.settings.lowStockThreshold,
                severity: product.stock <= state.settings.lowStockThreshold / 2 ? 'high' : 'medium',
                message: `${product.stock <= state.settings.lowStockThreshold / 2 ? 'URGENT' : 'WARNING'}: ${product.name} has only ${product.stock} items left (threshold: ${state.settings.lowStockThreshold})`
            });
        }
    });
    
    const allAlerts = [
        ...alerts.expired, ...alerts.outOfStock,
        ...alerts.expiringSoon.filter(a => a.severity === 'high'),
        ...alerts.lowStock.filter(a => a.severity === 'high'),
        ...alerts.expiringSoon.filter(a => a.severity === 'medium'),
        ...alerts.lowStock.filter(a => a.severity === 'medium')
    ];
    
    state.stockAlerts = allAlerts;
    saveToLocalStorage();
    
    const criticalAlerts = allAlerts.filter(alert => alert.severity === 'critical');
    if (criticalAlerts.length > 0) {
        showNotification(`${criticalAlerts.length} critical stock alerts detected! Check Analytics page for details.`, 'error');
    }
    
    return allAlerts;
}

// UI Functions
function showLogin() {
    show(DOM.loginPage);
    hide(DOM.appContainer);
}

async function showApp() {
    hide(DOM.loginPage);
    show(DOM.appContainer);
    
    if (state.currentUser) {
        DOM.currentUserEl.textContent = state.currentUser.name;
        DOM.userRoleEl.textContent = state.currentUser.role;
        
        const usersContainer = $('users-container');
        if (usersContainer) usersContainer.style.display = AuthModule.isAdmin() ? 'block' : 'none';
        
        document.querySelectorAll('.add-product-btn').forEach(btn => {
            btn.style.display = AuthModule.isAdmin() ? 'block' : 'none';
        });
    }
    
    try {
        const [productsResult, salesResult] = await Promise.allSettled([
            DataModule.fetchProducts(),
            DataModule.fetchSales()
        ]);
        
        if (productsResult.status === 'fulfilled') state.products = productsResult.value;
        if (salesResult.status === 'fulfilled') state.sales = salesResult.value;
        
        loadProducts();
        loadSales(); // This function is now defined below
        setupRealtimeListeners();
    } catch (error) {
        console.error('Error loading initial data:', error);
        showNotification('Error loading data. Using offline cache.', 'warning');
        
        loadProducts();
        loadSales(); // This function is now defined below
        setupRealtimeListeners();
    }
}

function showPage(pageName) {
    DOM.pageContents.forEach(page => hide(page));
    show($(`${pageName}-page`));
    
    DOM.navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-page') === pageName) link.classList.add('active');
    });
    
    const titles = {
        'pos': 'Point of Sale', 'inventory': 'Inventory Management',
        'reports': 'Sales Reports', 'expenses': 'Expense Management',
        'purchases': 'Purchase Management', 'analytics': 'Business Analytics',
        'account': 'My Account'
    };
    
    DOM.pageTitle.textContent = titles[pageName] || 'Pa Gerrys Mart';
    state.currentPage = pageName;
    
    if (pageName === 'inventory') loadInventory();
    else if (pageName === 'reports') loadReports();
    else if (pageName === 'account') loadAccount();
    else if (pageName === 'expenses') loadExpenses();
    else if (pageName === 'purchases') loadPurchases();
    else if (pageName === 'analytics') loadAnalytics();
}

// Product Functions
function loadProducts() {
    if (state.products.length === 0) {
        DOM.productsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>No Products Added Yet</h3>
                <p>Click "Add Product" to start adding your inventory</p>
            </div>
        `;
        return;
    }
    
    DOM.productsGrid.innerHTML = '';
    
    state.products.forEach(product => {
        if (product.deleted) return;
        
        const today = new Date();
        const expiryDate = new Date(product.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        let expiryWarning = '';
        let productNameStyle = '';
        
        if (daysUntilExpiry < 0) {
            expiryWarning = `<div class="expiry-warning"><i class="fas fa-exclamation-triangle"></i> Expired</div>`;
            productNameStyle = 'style="color: red; font-weight: bold;"';
        } else if (daysUntilExpiry <= state.settings.expiryWarningDays) {
            expiryWarning = `<div class="expiry-warning"><i class="fas fa-clock"></i> Expires in ${daysUntilExpiry} days</div>`;
            productNameStyle = 'style="color: red; font-weight: bold;"';
        }
        
        let stockClass = 'stock-high';
        if (product.stock <= 0) {
            stockClass = 'stock-low';
        } else if (product.stock <= state.settings.lowStockThreshold) {
            stockClass = 'stock-medium';
        }
        
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <div class="product-img"><i class="fas fa-box"></i></div>
            <h4 ${productNameStyle}>${product.name}</h4>
            <div class="price">${formatCurrency(product.price)}</div>
            <div class="stock ${stockClass}">Stock: ${product.stock}</div>
            ${expiryWarning}
        `;
        
        productCard.addEventListener('click', () => addToCart(product));
        DOM.productsGrid.appendChild(productCard);
    });
}

// Cart Functions
function addToCart(product) {
    if (product.stock <= 0) {
        showNotification('Product is out of stock', 'error');
        return;
    }
    
    const existingItem = state.cart.find(item => item.id === product.id);
    
    if (existingItem) {
        if (existingItem.quantity >= product.stock) {
            showNotification('Not enough stock available', 'error');
            return;
        }
        existingItem.quantity++;
    } else {
        state.cart.push({
            id: product.id, name: product.name,
            price: product.price, quantity: 1
        });
    }
    
    updateCart();
}

function updateCart() {
    if (state.cart.length === 0) {
        DOM.cartItems.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No items in cart</p>';
        DOM.totalEl.textContent = formatCurrency(0);
        return;
    }
    
    DOM.cartItems.innerHTML = '';
    let total = 0;
    
    state.cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatCurrency(item.price)}</div>
                <div class="cart-item-qty">
                    <button onclick="updateQuantity('${item.id}', -1)">-</button>
                    <input type="number" value="${item.quantity}" min="1" readonly>
                    <button onclick="updateQuantity('${item.id}', 1)">+</button>
                </div>
            </div>
            <div class="cart-item-total">${formatCurrency(itemTotal)}</div>
        `;
        
        DOM.cartItems.appendChild(cartItem);
    });
    
    DOM.totalEl.textContent = formatCurrency(total);
}

// FIX: Added this missing function
function loadSales() {
    if (!DOM.salesTableBody) return; // Exit if the element doesn't exist on the page

    if (state.sales.length === 0) {
        DOM.salesTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px; color: #999;">
                    No sales recorded yet
                </td>
            </tr>
        `;
        return;
    }
    
    DOM.salesTableBody.innerHTML = '';
    
    state.sales.forEach(sale => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${sale.receiptNumber || 'N/A'}</td>
            <td>${formatDate(sale.created_at)}</td>
            <td>${sale.cashier || 'Unknown'}</td>
            <td>${sale.items ? sale.items.length : 0}</td>
            <td>${formatCurrency(sale.total || 0)}</td>
            <td>
                <button class="btn-small" onclick="viewSaleDetails('${sale.receiptNumber}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        `;
        DOM.salesTableBody.appendChild(row);
    });
}

// FIX: Added this helper function called by loadSales
function viewSaleDetails(receiptNumber) {
    const sale = state.sales.find(s => s.receiptNumber === receiptNumber);
    if (!sale) {
        showNotification('Sale details not found', 'error');
        return;
    }
    
    // For now, just log the details. You can expand this to show a modal.
    console.log('Viewing sale details:', sale);
    showNotification(`Viewing details for Receipt #${receiptNumber}`, 'info');
    // TODO: Implement a modal to display sale.items and other details
}


// Placeholder functions for brevity - implement as needed
function loadInventory() { /* Implementation for loading inventory page */ }
function loadReports() { /* Implementation for loading reports page */ }
function loadAccount() { /* Implementation for loading account page */ }
function loadExpenses() { /* Implementation for loading expenses page */ }
function loadPurchases() { /* Implementation for loading purchases page */ }
function loadAnalytics() { /* Implementation for loading analytics page */ }
function refreshAllData() { /* Implementation for refreshing all data */ }
function updateQuantity(id, change) { /* Implementation for updating cart quantity */ }
function completeSale() { /* Implementation for completing a sale */ }

// Event Listeners
DOM.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('login-email').value;
    const password = $('login-password').value;
    AuthModule.signIn(email, password);
});

// Initialize app
async function init() {
    loadFromLocalStorage();
    
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && !error) {
            const savedUser = localStorage.getItem(state.STORAGE_KEYS.CURRENT_USER);
            if (savedUser) {
                try {
                    const parsedUser = JSON.parse(savedUser);
                    if (parsedUser.id === session.user.id) {
                        state.currentUser = parsedUser;
                        showApp();
                        return;
                    }
                } catch (e) {
                    console.error('Error parsing saved user data:', e);
                }
            }
            
            AuthModule.handleExistingSession(session, (user) => {
                state.currentUser = user;
                showApp();
            });
        }
    } catch (sessionError) {
        console.error('Error checking session:', sessionError);
    }
    
    AuthModule.onAuthStateChanged(async (user) => {
        if (user) {
            if (!state.currentUser || state.currentUser.id !== user.id) {
                try {
                    const { data, error } = await supabase
                        .from('users').select('*').eq('id', user.id).single();
                    
                    if (!error && data) state.currentUser = data;
                } catch (error) {
                    console.error('Error fetching user data:', error);
                }
            }
            
            showApp();
        } else {
            showLogin();
        }
    });
    
    showPage('pos');
    
    if (state.isOnline) {
        checkSupabaseConnection();
    }
}

// Start app
init();