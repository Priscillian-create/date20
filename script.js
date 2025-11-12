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
                email: state.currentUser.email, password: adminPassword
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
                name: data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'User',
                email: data.user.email,
                role: data.user.user_metadata?.role || 'cashier',
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
            name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            email: session.user.email,
            role: session.user.user_metadata?.role || 'cashier',
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
    
    mergeProductData(serverProducts) {
        const serverMap = serverProducts.reduce((map, p) => (map[p.id] = p, map), {});
        const localMap = state.products.reduce((map, p) => (map[p.id] = p, map), {});
        
        const merged = serverProducts.map(serverProduct => {
            const localProduct = localMap[serverProduct.id];
            if (!localProduct) return serverProduct;
            
            const serverDate = new Date(serverProduct.updated_at || serverProduct.created_at || 0);
            const localDate = new Date(localProduct.updated_at || localProduct.created_at || 0);
            return localDate > serverDate ? localProduct : serverProduct;
        });
        
        state.products.filter(p => !serverMap[p.id]).forEach(p => merged.push(p));
        return merged;
    },
    
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
    
    // Other DataModule methods would be similarly refactored...
    async fetchSales() {
        // Similar refactoring as fetchProducts
        // Implementation would follow the same pattern
    },
    
    async saveSale(sale) {
        // Similar refactoring as saveProduct
        // Implementation would follow the same pattern
    }
    
    // Additional methods...
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
        // Reset to defaults on error
        state.products = []; state.sales = []; state.deletedSales = [];
        state.users = []; state.currentUser = null;
        state.expenses = []; state.purchases = [];
        state.stockAlerts = []; state.profitData = [];
    }
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
        loadSales();
        setupRealtimeListeners();
    } catch (error) {
        console.error('Error loading initial data:', error);
        showNotification('Error loading data. Using offline cache.', 'warning');
        loadProducts();
        loadSales();
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
    
    // Load specific page data
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
        if (product.stock <= 0) stockClass = 'stock-low';
        else if (product.stock <= state.settings.lowStockThreshold) stockClass = 'stock-medium';
        
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

// Event Listeners
DOM.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('login-email').value;
    const password = $('login-password').value;
    AuthModule.signIn(email, password);
});

DOM.registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('register-name').value;
    const email = $('register-email').value;
    const password = $('register-password').value;
    const confirmPassword = $('register-confirm-password').value;
    const role = $('register-role').value;
    
    if (password !== confirmPassword) {
        const registerError = $('register-error');
        if (registerError) {
            registerError.style.display = 'block';
            registerError.textContent = 'Passwords do not match';
        }
        return;
    }
    
    const registerSubmitBtn = $('register-submit-btn');
    registerSubmitBtn.classList.add('loading');
    registerSubmitBtn.disabled = true;
    
    AuthModule.signUp(email, password, name, role)
        .then(result => {
            if (result.success) {
                const loginTab = document.querySelector('[data-tab="login"]');
                if (loginTab) loginTab.click();
                DOM.registerForm.reset();
            }
        })
        .finally(() => {
            registerSubmitBtn.classList.remove('loading');
            registerSubmitBtn.disabled = false;
        });
});

// Navigation
DOM.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const pageName = link.getAttribute('data-page');
        showPage(pageName);
    });
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